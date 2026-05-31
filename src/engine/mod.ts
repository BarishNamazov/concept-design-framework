/**
 * Public entry point for the synchronization engine, imported elsewhere as
 * `@engine`. Concepts are composed by declarative synchronizations matched
 * against an append-only action journal — see the individual modules for the
 * model (flow, frames, when/where/then, synced marks).
 */

export { Frames } from "./frames.ts";
export { actions, Logging, SyncConcept } from "./sync.ts";
export type {
  ActionList,
  ActionPattern,
  Empty,
  Frame,
  Mapping,
  SyncFunction as Sync,
  Vars,
} from "./types.ts";
