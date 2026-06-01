/**
 * The single, type-safe gateway to the forum backend.
 *
 * Everything funnels through the project's own Requesting SDK
 * (`createClient<ForumApi>`), so every call here is end-to-end typed straight
 * from the backend's inferred `ForumApi` contract — no duplicated request
 * shapes, no generated stubs. The client talks to a same-origin `/api/*` path
 * that Next rewrites to the backend (see `next.config.ts`), which keeps the
 * backend origin out of the browser bundle and sidesteps CORS in every
 * environment.
 */
import { createClient } from "@backend/sdk";
import type { ForumApi, Input, Output } from "@backend/api";

/** Every endpoint path string, e.g. `"/threads/list"`. */
export type Path = keyof ForumApi & string;
/** The typed request body for an endpoint. */
export type Req<P extends Path> = Input<P>;
/** The typed success payload for an endpoint. */
export type Res<P extends Path> = Output<P>;

export type { ForumApi, Input, Output };

/** The error envelope any endpoint may return instead of its success payload. */
export type ApiError = { error: string };

/** Narrowing guard: did a call resolve to the backend's `{ error }` envelope? */
export function isApiError(value: unknown): value is ApiError {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as ApiError).error === "string"
  );
}

/** A thrown error that still carries the backend's human-readable message. */
export class ForumError extends Error {}

/**
 * Collapses a `Result` (success payload | `{ error }`) into the success payload,
 * throwing a {@link ForumError} on the error envelope. Ideal inside mutations
 * and composed loaders where you want a single happy path and `try/catch`.
 */
export function unwrap<T>(result: T | ApiError): T {
  if (isApiError(result)) throw new ForumError(result.error);
  return result;
}

/**
 * The grouped + indexed SDK client. Use the grouped style for readability:
 *
 * ```ts
 * const { conversations } = unwrap(await api.threads.list({}));
 * await api.reactions.add({ session, target, kind: "👍" });
 * ```
 */
export const api = createClient<ForumApi>({ baseUrl: "/api" });

export default api;
