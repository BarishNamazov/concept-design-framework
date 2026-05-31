/*
  Copyright (c) Eagon Meng, MIT CSAIL. All rights reserved.
  SPDX-License-Identifier: CC-BY-NC-SA-4.0
  Licensed under the Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International.
  See https://creativecommons.org/licenses/by-nc-sa/4.0/
*/
/**
 * {@link Frames} — the working set of a synchronization.
 *
 * A *frame* is one row of variable bindings (keyed by `symbol`). A `Frames`
 * value is an ordered bag of such rows and behaves like a relational
 * intermediate result: `when` matching produces it, `where` transforms it, and
 * `then` consumes it.
 *
 * `Frames` extends `Array` and is wrapped in a `Proxy` so that every standard
 * array method which returns a new array (`map`, `filter`, `flatMap`, `slice`,
 * `concat`, `reverse`, `sort`, `splice`, …) transparently returns a `Frames`
 * again, keeping the fluent API closed over the type. The query helpers
 * (`query` / `queryAsync`) are excluded from this auto-wrapping because they
 * already construct and return `Frames` themselves (possibly inside a Promise).
 */
import type { Frame, Mapping } from "./types.ts";

export type { Frame, Mapping } from "./types.ts";

/** Infers the new frame keys contributed by a query's `output` mapping. */
type ExtractSymbolMappings<TOutputMapping, TFunctionOutput> = {
  [K in keyof TOutputMapping as TOutputMapping[K] extends symbol
    ? TOutputMapping[K]
    : never]: K extends keyof TFunctionOutput ? TFunctionOutput[K] : never;
};

export interface Frames<TFrame extends Frame = Frame> {
  map<U extends Frame>(
    callbackfn: (value: TFrame, index: number, array: TFrame[]) => U,
    thisArg?: unknown,
  ): Frames<U>;
  map<U>(
    callbackfn: (value: TFrame, index: number, array: TFrame[]) => U,
    thisArg?: unknown,
  ): U[];
  filter<S extends TFrame>(
    predicate: (value: TFrame, index: number, array: TFrame[]) => value is S,
    thisArg?: unknown,
  ): Frames<S>;
  filter(
    predicate: (value: TFrame, index: number, array: TFrame[]) => unknown,
    thisArg?: unknown,
  ): this;

  flatMap<U extends Frame>(
    callback: (
      value: TFrame,
      index: number,
      array: TFrame[],
    ) => U | ReadonlyArray<U>,
    thisArg?: unknown,
  ): Frames<U>;
  flatMap<U>(
    callback: (
      value: TFrame,
      index: number,
      array: TFrame[],
    ) => U | ReadonlyArray<U>,
    thisArg?: unknown,
  ): U[];

  find<S extends TFrame>(
    predicate: (value: TFrame, index: number, array: TFrame[]) => value is S,
    thisArg?: unknown,
  ): S | undefined;
  find(
    predicate: (value: TFrame, index: number, array: TFrame[]) => unknown,
    thisArg?: unknown,
  ): TFrame | undefined;

  slice(start?: number, end?: number): this;

  concat(...items: ConcatArray<TFrame>[]): this;
  concat(...items: (TFrame | ConcatArray<TFrame>)[]): this;

  reverse(): this;
  sort(compareFn?: (a: TFrame, b: TFrame) => number): this;

  splice(start: number, deleteCount?: number): this;
  splice(start: number, deleteCount: number, ...items: TFrame[]): this;
}

/** Methods that own their return value and must NOT be auto-rewrapped. */
const UNWRAPPED_METHODS = new Set<PropertyKey>(["query", "queryAsync"]);

// biome-ignore lint/suspicious/noUnsafeDeclarationMerging: The interface overloads Array methods so fluent frame transforms keep their narrowed return types.
export class Frames<TFrame extends Frame = Frame> extends Array<TFrame> {
  constructor(...frames: TFrame[]) {
    super(...frames);
    // Re-wrap array-returning methods so the fluent API stays a `Frames`.
    // biome-ignore lint/correctness/noConstructorReturn: Returning this proxy keeps built-in Array methods closed over Frames.
    return new Proxy(this, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);
        if (typeof value !== "function" || UNWRAPPED_METHODS.has(prop)) {
          return value;
        }
        return function (this: Frames<TFrame>, ...args: unknown[]) {
          const result = value.apply(this, args);
          if (Array.isArray(result) && !(result instanceof Frames)) {
            return new Frames(...result);
          }
          return result;
        };
      },
    });
  }

  /**
   * Resolve a query's `input` mapping against a single frame.
   *
   * Symbol values are looked up in the frame (and must be bound — an unbound
   * symbol is a programming error); literal values pass through unchanged.
   */
  private static bindInput(frame: Frame, input: Mapping): Mapping {
    const bound: Mapping = {};
    for (const [key, binding] of Object.entries(input)) {
      if (typeof binding === "symbol") {
        const value = frame[binding];
        if (value === undefined) {
          throw new Error(
            `Binding: ${String(binding)} not found in frame: ${String(frame)}`,
          );
        }
        bound[key] = value;
      } else {
        bound[key] = binding;
      }
    }
    return bound;
  }

  /**
   * Expand one source frame by a query's result rows into the accumulator.
   *
   * Each row yields a fresh frame extending `frame` with the `output` symbol
   * bindings. A query that returns no rows contributes nothing — the source
   * frame is dropped, giving inner-join / fan-out semantics.
   */
  private static expandOutputs(
    into: Frames,
    frame: Frame,
    rows: unknown[],
    output: Record<string, symbol>,
  ): void {
    for (const row of rows) {
      const newFrame: Record<symbol, unknown> = { ...frame };
      for (const [outputKey, symbolKey] of Object.entries(output)) {
        if (
          typeof symbolKey === "symbol" &&
          row &&
          typeof row === "object" &&
          outputKey in row
        ) {
          newFrame[symbolKey] = (row as Record<string, unknown>)[outputKey];
        }
      }
      into.push(newFrame as Frame);
    }
  }

  // Overloads: sync and async query function variants
  query<
    TFunction extends (...args: never[]) => unknown[],
    TInputMapping extends Record<string, unknown>,
    TOutputMapping extends Record<string, symbol>,
    TFunctionOutput = ReturnType<TFunction> extends (infer U)[] ? U : never,
    TNewFrame extends Frame = TFrame &
      ExtractSymbolMappings<TOutputMapping, TFunctionOutput>,
  >(
    f: TFunction,
    input: TInputMapping,
    output: TOutputMapping,
  ): Frames<TNewFrame>;
  query<
    TFunction extends (...args: never[]) => Promise<unknown[]>,
    TInputMapping extends Record<string, unknown>,
    TOutputMapping extends Record<string, symbol>,
    TFunctionOutput = Awaited<ReturnType<TFunction>> extends (infer U)[]
      ? U
      : never,
    TNewFrame extends Frame = TFrame &
      ExtractSymbolMappings<TOutputMapping, TFunctionOutput>,
  >(
    f: TFunction,
    input: TInputMapping,
    output: TOutputMapping,
  ): Promise<Frames<TNewFrame>>;
  /**
   * Fan each frame out over the rows returned by `f`.
   *
   * Works with both synchronous (`unknown[]`) and asynchronous
   * (`Promise<unknown[]>`) query functions, returning `Frames` or
   * `Promise<Frames>` to match. Frames whose query yields zero rows are dropped
   * (intentional inner-join semantics).
   */
  query(
    f: (...args: never[]) => unknown[] | Promise<unknown[]>,
    input: Record<string, unknown>,
    output: Record<string, symbol>,
  ): Frames | Promise<Frames> {
    const result = new Frames();
    const promises: Promise<void>[] = [];

    for (const frame of this) {
      const boundInput = Frames.bindInput(frame, input);
      const rows = f(boundInput as never);
      if (rows instanceof Promise) {
        promises.push(
          rows.then((arr) => Frames.expandOutputs(result, frame, arr, output)),
        );
      } else {
        Frames.expandOutputs(result, frame, rows, output);
      }
    }

    if (promises.length > 0) {
      return Promise.all(promises).then(() => result);
    }
    return result;
  }

  /**
   * Always-async variant of {@link query}, for query functions that return a
   * Promise. Semantics per frame are identical to {@link query}.
   */
  async queryAsync<
    TFunction extends (...args: never[]) => Promise<unknown[]>,
    TInputMapping extends Record<string, unknown>,
    TOutputMapping extends Record<string, symbol>,
    TFunctionOutput = Awaited<ReturnType<TFunction>> extends (infer U)[]
      ? U
      : never,
    TNewFrame extends Frame = TFrame &
      ExtractSymbolMappings<TOutputMapping, TFunctionOutput>,
  >(
    f: TFunction,
    input: TInputMapping,
    output: TOutputMapping,
  ): Promise<Frames<TNewFrame>> {
    const result = new Frames<TNewFrame>();
    for (const frame of this) {
      const boundInput = Frames.bindInput(frame, input);
      const rows = await f(boundInput as Parameters<TFunction>[0]);
      Frames.expandOutputs(result as Frames, frame, rows, output);
    }
    return result;
  }

  /**
   * Group frames by their non-collected symbol keys, gathering the `collect`
   * symbols of each group into an array bound to `as`.
   *
   * Within a group, each collected symbol is keyed by its `.description` in the
   * produced records, so downstream code reads them by name.
   */
  collectAs<TAsSymbol extends symbol>(
    collect: symbol[],
    as: TAsSymbol,
  ): Frames {
    const groups = new Map<
      string,
      { groupFrame: Frame; collected: Record<string, unknown>[] }
    >();

    for (const frame of this) {
      const groupKeys: Frame = {};
      const collectedRecord: Record<string, unknown> = {};

      for (const symbolKey of Object.getOwnPropertySymbols(frame)) {
        const value = (frame as Record<symbol, unknown>)[symbolKey];
        if (collect.includes(symbolKey)) {
          const symbolName = symbolKey.description || String(symbolKey);
          collectedRecord[symbolName] = value;
        } else {
          groupKeys[symbolKey] = value;
        }
      }

      // Stable, order-independent key over the group's surviving bindings.
      const groupKey = JSON.stringify(
        Object.getOwnPropertySymbols(groupKeys)
          .sort((a, b) => String(a).localeCompare(String(b)))
          .map((sym) => [String(sym), groupKeys[sym]]),
      );

      let group = groups.get(groupKey);
      if (group === undefined) {
        group = { groupFrame: groupKeys, collected: [] };
        groups.set(groupKey, group);
      }
      group.collected.push(collectedRecord);
    }

    const result = new Frames();
    for (const { groupFrame, collected } of groups.values()) {
      result.push({ ...groupFrame, [as]: collected } as Frame);
    }
    return result;
  }

  /**
   * Like {@link collectAs}, but guarantees exactly one output frame even when
   * `this` is empty — the common cause of a synchronization silently failing to
   * fire (see `design/memories/sync-learnings.md`, "Zero Matches").
   *
   * A list endpoint typically starts from a single request frame, fans out via
   * `.query` (which drops the frame when a query returns nothing), then collects
   * the results back into one list. If the query yields zero rows the request
   * frame is lost and no response is ever sent. `aggregate` restores it: pass the
   * originating `base` frame (captured before the queries) and, when there is
   * nothing to collect, it emits `base` with `as` bound to an empty array.
   *
   * @param base    bindings that must survive into the `then` clause (e.g. `request`).
   * @param collect symbols to gather into the list.
   * @param as      symbol the collected list is bound to.
   */
  aggregate(base: Frame, collect: symbol[], as: symbol): Frames {
    if (this.length === 0) {
      return new Frames({ ...base, [as]: [] } as Frame);
    }
    return this.collectAs(collect, as);
  }
}
