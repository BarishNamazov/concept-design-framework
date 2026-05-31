/*
  Copyright (c) Eagon Meng, MIT CSAIL. All rights reserved.
  SPDX-License-Identifier: CC-BY-NC-SA-4.0
  Licensed under the Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International.
  See https://creativecommons.org/licenses/by-nc-sa/4.0/
*/
/**
 * The synchronization engine.
 *
 * Concepts are independent state machines; **synchronizations** compose them
 * declaratively. A sync is a `when` / `where` / `then` rule:
 *
 *  - **when**  — patterns matched against the action journal. Matching binds
 *               logic variables and yields a set of {@link Frames}.
 *  - **where** — an optional pure transform over those frames (filter, query,
 *               aggregate, …) producing the final frames.
 *  - **then**  — actions to invoke, one per surviving frame, with their inputs
 *               resolved from the frame's bindings.
 *
 * Concepts are *instrumented* so that every (non-query) action invocation:
 *   1. appends a record to the journal under a **flow** token,
 *   2. runs the underlying action and records its output, then
 *   3. drives {@link SyncConcept.synchronize}, which fires any matching syncs.
 *
 * A **flow** groups actions in one causal chain: actions produced by a sync's
 * `then` inherit the triggering action's flow, and matching is restricted to a
 * single flow so independent invocations never cross-match.
 */

import { ActionConcept, type ActionRecord } from "./actions.ts";
import { Frames } from "./frames.ts";
import type {
  ActionList,
  ActionPattern,
  AnyAction,
  Frame,
  InstrumentedAction,
  SyncFunctionMap,
  Synchronization,
} from "./types.ts";
import { inspect, inspectCustom, uuid } from "./util.ts";
import { $vars } from "./vars.ts";

/**
 * Reserved frame keys carried alongside the user's logic variables:
 *  - `flow`     — the flow token threaded through a causal chain;
 *  - `synced`   — the per-action map recording which syncs already consumed it;
 *  - `actionId` — the journal id a matched/produced action is identified by.
 */
const flow = Symbol("flow");
const synced = Symbol("synced");
const actionId = Symbol("actionId");

/**
 * Normalize sync clauses into {@link ActionPattern}s.
 *
 * Used in both `when` and `then`. Each tuple is `[action, input, output?]`.
 * The action must be instrumented (carry a `.concept`); otherwise it could
 * never appear in — or be appended to — the journal.
 */
export function actions(...actions: ActionList[]): ActionPattern[] {
  return actions.map(([action, input, output]) => {
    const concept = action.concept;
    if (concept === undefined) {
      throw new Error(`Action ${action.name} is not instrumented.`);
    }
    return {
      concept,
      action,
      input,
      flow,
      ...(output ? { output } : {}),
    };
  });
}

/** The internal shape of an instrumented action's argument object. */
type ActionArguments = Record<string | symbol, unknown>;

/** Verbosity levels for engine logging. */
export enum Logging {
  /** Print nothing. */
  OFF,
  /** Print a one-line `Concept.action input => output` per action. */
  TRACE,
  /** Print TRACE plus matched frames and `then` dispatches. */
  VERBOSE,
}

export class SyncConcept {
  /** Registered synchronizations, by name. */
  public syncs: Record<string, Synchronization> = {};
  /** Inverted index: which syncs care about each `when` action. */
  public syncsByAction: Map<InstrumentedAction, Set<Synchronization>> =
    new Map();
  /** The action journal backing all matching. */
  public Action: ActionConcept;
  /** Current verbosity. */
  public logging = Logging.TRACE;
  /** Memoizes bound/instrumented wrappers per concept instance. */
  private boundActionsByConcept: WeakMap<
    object,
    Map<AnyAction, InstrumentedAction>
  > = new WeakMap();

  constructor(actionConcept: ActionConcept = new ActionConcept()) {
    this.Action = actionConcept;
  }

  /**
   * Register named sync functions. Each is invoked with the {@link $vars} proxy
   * to produce its declaration, then indexed by every action in its `when`.
   */
  register(syncs: SyncFunctionMap): void {
    for (const [name, syncFunction] of Object.entries(syncs)) {
      const sync: Synchronization = { sync: name, ...syncFunction($vars) };
      this.syncs[name] = sync;
      for (const { action } of sync.when) {
        let mapped = this.syncsByAction.get(action);
        if (mapped === undefined) {
          mapped = new Set();
          this.syncsByAction.set(action, mapped);
        }
        mapped.add(sync);
      }
    }
  }

  /**
   * React to a just-completed action: log it, then fire every sync indexed on
   * that action whose `when` matches within the action's flow.
   */
  async synchronize(record: ActionRecord): Promise<void> {
    this.logAction(record);

    const syncs = this.syncsByAction.get(record.action as InstrumentedAction);
    if (syncs === undefined) return;

    for (const sync of syncs) {
      const [matched, actionSymbols] = this.matchWhen(record, sync);
      if (matched.length === 0) continue;

      this.logFrames(`Matched \`sync\`: ${sync.sync} with \`when\`:`, matched);

      let frames = matched;
      if (sync.where !== undefined) {
        const maybeFrames = sync.where(frames);
        frames =
          maybeFrames instanceof Promise ? await maybeFrames : maybeFrames;
        this.logFrames(`After processing \`where\`:`, frames);
      }
      await this.addThen(frames, sync, actionSymbols);
    }
  }

  /**
   * Match a sync's `when` against the firing action's flow.
   *
   * Starts from a single seed frame carrying the flow token, then for each
   * `when` clause joins in every journal record (within the flow) that matches,
   * binding logic variables along the way. Returns the resulting frames and the
   * per-clause symbols under which each matched record's id was stored.
   */
  matchWhen(
    record: ActionRecord,
    sync: Synchronization,
  ): [Frames<Frame>, symbol[]] {
    const flowActions = this.Action._getByFlow(record.flow);
    if (flowActions === undefined) return [new Frames(), []];

    let frames: Frames = new Frames({ [flow]: record.flow } as Frame);
    const actionSymbols: symbol[] = [];

    sync.when.forEach((when, i) => {
      const actionSymbol = Symbol(`action_${i}`);
      actionSymbols.push(actionSymbol);

      const joined = new Frames();
      for (const frame of frames) {
        for (const candidate of flowActions) {
          // Skip records this sync has already consumed (double-fire guard).
          if (candidate.synced?.has(sync.sync)) continue;
          const matched = this.matchArguments(
            candidate,
            when,
            frame,
            actionSymbol,
          );
          if (matched !== undefined) joined.push(matched);
        }
      }
      frames = joined;
    });

    return [frames, actionSymbols];
  }

  /**
   * For every surviving frame, invoke each `then` action with inputs resolved
   * from the frame, threading the flow token and a fresh action id. As a side
   * effect, mark each consumed `when` record `synced` for this sync so it can't
   * be matched again. All produced actions are awaited in order afterward.
   */
  async addThen(
    frames: Frames,
    sync: Synchronization,
    actionSymbols: symbol[],
  ): Promise<void> {
    const thens: [InstrumentedAction, ActionArguments][] = [];

    for (const frame of frames) {
      const whenActions = this.resolveWhenActions(frame, actionSymbols);

      for (const then of sync.then) {
        const matched = this.matchThen(then, frame);
        const id = matched[actionId];
        if (typeof id !== "string") {
          throw new Error("Action produced from `then` is missing an id.");
        }
        for (const whenAction of whenActions) {
          whenAction.synced?.set(sync.sync, id);
        }
        thens.push([then.action, matched]);
      }
    }

    for (const [thenAction, thenRecord] of thens) {
      if (this.logging === Logging.VERBOSE) {
        console.log(`${sync.sync}: THEN ${thenAction}`, thenRecord);
      }
      const runThen = thenAction as unknown as (
        args: ActionArguments,
      ) => Promise<unknown>;
      await runThen(thenRecord);
    }
  }

  /** Recover the `when` records a frame matched, ready to be marked synced. */
  private resolveWhenActions(
    frame: Frame,
    actionSymbols: symbol[],
  ): ActionRecord[] {
    return actionSymbols.map((actionSymbol) => {
      const id = frame[actionSymbol];
      if (typeof id !== "string") {
        throw new Error("Missing actionId in `then` clause.");
      }
      const action = this.Action._getById(id);
      if (action?.synced === undefined) {
        throw new Error(
          `Action ${String(action)} missing or missing synced Map.`,
        );
      }
      return action;
    });
  }

  /**
   * Resolve a `then` clause into an action argument object: replace symbol
   * inputs with their frame bindings (a missing binding is an error), then
   * attach the flow token and a fresh action id.
   */
  matchThen(then: ActionPattern, frame: Frame): ActionArguments {
    const input: ActionArguments = {};
    for (const [key, value] of Object.entries(then.input)) {
      if (typeof value === "symbol") {
        const bound = frame[value];
        if (bound === undefined) {
          throw new Error(
            `Missing binding: ${String(value)} in frame: ${String(frame)}`,
          );
        }
        input[key] = bound;
      } else {
        input[key] = value;
      }
    }
    input[flow] = frame[flow];
    input[actionId] = uuid();
    return input;
  }

  /**
   * Try to match a single journal record against one `when` clause, extending
   * `frame` with any newly bound variables.
   *
   * The concept+action identity must match. For each input pattern key the
   * record's input must carry that key; symbols bind if unbound and otherwise
   * must unify (strict `!==`), while literals must strictly equal. The same
   * rules apply to the `output` pattern — which is required: an absent output
   * pattern is a declaration error, and a pattern key the record's output lacks
   * rejects the match (this is what makes e.g. `error` vs `question` outputs
   * mutually exclusive). On success the record's id is stored under
   * `actionSymbol`.
   */
  matchArguments(
    record: ActionRecord,
    when: ActionPattern,
    frame: Frame,
    actionSymbol: symbol,
  ): Frame | undefined {
    if (record.concept !== when.concept || record.action !== when.action) {
      return undefined;
    }

    let newFrame: Frame = { ...frame };

    const unified = this.unifyPattern(record.input, when.input, newFrame);
    if (unified === undefined) return undefined;
    newFrame = unified;

    if (when.output === undefined) {
      throw new Error(
        `When pattern: ${String(when)} is missing output pattern.`,
      );
    }
    if (record.output === undefined) return undefined;
    const unifiedOut = this.unifyPattern(record.output, when.output, newFrame);
    if (unifiedOut === undefined) return undefined;
    newFrame = unifiedOut;

    return { ...newFrame, [actionSymbol]: record.id };
  }

  /**
   * Unify one pattern mapping against a record mapping, returning an extended
   * frame or `undefined` on conflict / missing key. Pure: never mutates inputs.
   */
  private unifyPattern(
    recordValues: Record<string, unknown>,
    pattern: Record<string, unknown>,
    frame: Frame,
  ): Frame | undefined {
    let next: Frame = frame;
    for (const [key, value] of Object.entries(pattern)) {
      const recordValue = recordValues[key];
      if (recordValue === undefined) return undefined;
      if (typeof value === "symbol") {
        const bound = next[value];
        if (bound === undefined) {
          next = { ...next, [value]: recordValue };
        } else if (bound !== recordValue) {
          return undefined;
        }
      } else if (recordValue !== value) {
        return undefined;
      }
    }
    return next;
  }

  /** VERBOSE-only dump of a labeled set of frames. */
  logFrames(message: string, frames: Frames): void {
    if (this.logging === Logging.VERBOSE && frames.length > 0) {
      console.log(message, frames);
    }
  }

  /** Per-action logging honouring the current {@link Logging} level. */
  private logAction(record: ActionRecord): void {
    if (this.logging === Logging.VERBOSE) {
      const { concept, ...rest } = record;
      console.log("Synchronizing action:", {
        concept: concept.constructor.name,
        ...rest,
      });
      return;
    }
    if (this.logging === Logging.TRACE) {
      const boundAction = (record.action as InstrumentedAction).action;
      const constructorName = record.concept.constructor.name;
      const conceptName = constructorName.endsWith("Concept")
        ? constructorName.slice(0, -"Concept".length)
        : constructorName;
      const boundName = boundAction
        ? boundAction.name.slice("bound ".length)
        : "UNDEFINED";
      console.log(
        `\n${conceptName}.${boundName} ${inspect(record.input)} => ${inspect(
          record.output,
        )}\n`,
      );
    }
  }

  /**
   * Wrap a concept in a `Proxy` that instruments its actions.
   *
   * Queries (methods whose name starts with `_`) are bound but left
   * uninstrumented — they have no journal side effects. Every other method is
   * wrapped exactly once per concept instance so the instrumented identity is
   * stable across accesses without aliasing sibling instances of the same class.
   * The wrapper records the action in the journal, runs it, records its output,
   * and then drives {@link synchronize}.
   */
  instrumentConcept<T extends object>(concept: T): T {
    const Action = this.Action;
    const synchronize = this.synchronize.bind(this);
    let boundActions = this.boundActionsByConcept.get(concept);
    if (boundActions === undefined) {
      boundActions = new Map();
      this.boundActionsByConcept.set(concept, boundActions);
    }

    return new Proxy(concept, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);
        if (typeof value !== "function") return value;
        const actionKey = value as AnyAction;

        // Queries: bound, but never instrumented.
        if (value.name.startsWith("_")) {
          const cached = boundActions.get(actionKey);
          if (cached !== undefined) return cached;
          const bound = value.bind(concept) as InstrumentedAction;
          boundActions.set(actionKey, bound);
          return bound;
        }

        // Actions: instrument once, then memoize.
        let instrumented = boundActions.get(actionKey);
        if (instrumented !== undefined) return instrumented;

        const action = value.bind(concept);
        instrumented = async function instrumented(args: ActionArguments) {
          let {
            [flow]: flowToken,
            [synced]: syncedMap,
            [actionId]: id,
            ...input
          } = args;

          if (flowToken === undefined) flowToken = uuid();
          if (typeof flowToken !== "string") {
            throw new Error("Flow token not string.");
          }
          if (syncedMap === undefined) syncedMap = new Map();
          if (!(syncedMap instanceof Map)) {
            throw new Error("synced must be a Map.");
          }
          if (id === undefined) id = uuid();
          if (typeof id !== "string") {
            throw new Error("actionId not string.");
          }

          const actionRecord: ActionRecord = {
            id,
            action: instrumented as InstrumentedAction,
            concept,
            input,
            synced: syncedMap,
            flow: flowToken,
          };

          Action.invoke(actionRecord);
          const output = (await action(input)) as Record<string, unknown>;
          Action.invoked({ id, output });
          await synchronize({ ...actionRecord, output });
          return output;
        } as InstrumentedAction;

        instrumented.concept = concept;
        instrumented.action = action;
        const repr = () => inspect(action);
        instrumented.toString = repr;
        Object.defineProperty(instrumented, inspectCustom, {
          value: repr,
          writable: false,
          configurable: true,
        });

        boundActions.set(actionKey, instrumented);
        return instrumented;
      },
    });
  }

  /** Instrument every concept in a record, preserving keys. */
  instrument<T extends Record<string, object>>(concepts: T): T {
    return Object.fromEntries(
      Object.entries(concepts).map(([key, concept]) => [
        key,
        this.instrumentConcept(concept),
      ]),
    ) as T;
  }
}
