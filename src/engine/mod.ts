/**
 * Public entry point for the synchronization engine, imported elsewhere as
 * `@engine`. Concepts are composed by declarative synchronizations matched
 * against an append-only action journal — see the individual modules for the
 * model (flow, frames, when/where/then, synced marks).
 */
export { actions, Logging, SyncConcept } from "./sync.ts";
export { Frames } from "./frames.ts";
export type {
  Empty,
  Frame,
  Mapping,
  SyncFunction as Sync,
  Vars,
} from "./types.ts";
