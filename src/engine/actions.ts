/*
  Copyright (c) Eagon Meng, MIT CSAIL. All rights reserved.
  SPDX-License-Identifier: CC-BY-NC-SA-4.0
  Licensed under the Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International.
  See https://creativecommons.org/licenses/by-nc-sa/4.0/
*/
/**
 * The **action journal** — itself a tiny concept.
 *
 * Every instrumented action invocation appends an immutable {@link ActionRecord}
 * to an append-only log. Synchronizations are then matched against this log
 * rather than against live program state, which is what makes the engine's
 * reactive semantics declarative and replayable.
 *
 * Two indexes are maintained:
 *  - **by id**   — for direct lookup of a record (e.g. when marking it synced);
 *  - **by flow** — for restricting matching to a single causal chain. A *flow*
 *    is a token shared by every action in a direct cause/effect chain: an action
 *    triggered from a sync's `then` inherits the flow of the action that fired
 *    the sync. Matching only ever considers records within the firing action's
 *    flow, which keeps independent invocations from cross-matching.
 */
import { uuid } from "./util.ts";

/**
 * One immutable entry in the action journal.
 *
 * `synced` records, per consuming sync, which produced action a `when` record
 * has already been spent on — the mechanism that prevents a sync from firing
 * twice off the same evidence (see `SyncConcept`'s double-fire prevention).
 */
export interface ActionRecord {
  id?: string;
  action: Function;
  concept: object;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  synced?: Map<string, string>;
  flow: string;
}

/**
 * Append-only journal of action invocations, indexed by id and by flow.
 *
 * The public surface (`invoke`, `invoked`, `_getByFlow`, `_getById`) mirrors a
 * concept: actions mutate the log, queries (prefixed `_`) read it.
 */
export class ActionConcept {
  /** All records, keyed by their unique id. */
  actions: Map<string, ActionRecord> = new Map();
  /** Records grouped by flow token, in invocation order. */
  flowIndex: Map<string, ActionRecord[]> = new Map();

  /** Append a record (the moment an action begins), returning its id. */
  invoke(record: ActionRecord): { id: string } {
    const id = record.id ?? uuid();
    const actionRecord: ActionRecord = { ...record, id };

    this.actions.set(id, actionRecord);
    const partition = this.flowIndex.get(record.flow) ?? [];
    partition.push(actionRecord);
    this.flowIndex.set(record.flow, partition);

    return { id };
  }

  /** Attach an action's output once it has resolved. */
  invoked(
    { id, output }: { id: string; output: Record<string, unknown> },
  ): { id: string } {
    const action = this.actions.get(id);
    if (action === undefined) {
      throw new Error(`Action with id ${id} not found.`);
    }
    action.output = output;
    return { id };
  }

  /** All records belonging to a flow, in order (or `undefined` if unknown). */
  _getByFlow(flow: string): ActionRecord[] | undefined {
    return this.flowIndex.get(flow);
  }

  /** Look up a single record by id. */
  _getById(id: string): ActionRecord | undefined {
    return this.actions.get(id);
  }
}
