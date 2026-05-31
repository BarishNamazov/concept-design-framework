/**
 * # API contract (aggregated from the synchronizations)
 *
 * This module no longer hand-enumerates the API. The endpoint specs are
 * co-located with the syncs that implement them (each `src/syncs/*.sync.ts`
 * exports an `endpoints` manifest and an `Endpoints` type), and `bun run build`
 * aggregates every feature's `Endpoints` into one `AppContract` type in the
 * generated `src/syncs/contract.generated.ts`. Here we simply re-expose that
 * aggregated type under the SDK's public names.
 *
 * The aggregated type is imported **as a type only**, so the SDK carries no
 * runtime dependency on the backend — it stays a pure client that is merely
 * *type*-bound to the concepts. Because each spec's outputs are derived from the
 * real `@concepts` return types, a change to any concept's result shape breaks
 * this contract — and therefore the SDK and any frontend — at compile time.
 *
 * Inputs accept ids as plain `string`; outputs preserve the backend's branded
 * {@link ID} type.
 */
import type { AppContract } from "../syncs/contract.generated.ts";
import type { ApiError } from "./client.ts";
import type { ID } from "@utils/types.ts";

/**
 * The error envelope every endpoint may return instead of its success payload.
 * Re-exported from the generic client (its canonical definition) so the SDK has
 * one `{ error }` shape. Mirrors the `{ error }` responses produced throughout
 * the synchronizations and the `Requesting` HTTP server.
 */
export type { ApiError };

/**
 * Maps every API path to its request `input` and success `output`, aggregated
 * from the per-feature endpoint specs. Combine an endpoint's `output` with
 * {@link ApiError} via {@link Result} to get the full set of values a call may
 * resolve to.
 */
export type ApiContract = AppContract;

/** Every API path as a string-literal union. */
export type ApiPath = keyof ApiContract;

/** The request body type for a given path. */
export type Input<P extends ApiPath> = ApiContract[P]["input"];

/** The success payload type for a given path. */
export type Output<P extends ApiPath> = ApiContract[P]["output"];

/**
 * Everything a call to `P` may resolve to: its success payload or an
 * {@link ApiError}. SDK methods always resolve to `Result<P>` and never throw.
 */
export type Result<P extends ApiPath> = Output<P> | ApiError;

/**
 * One enriched thread node, as returned by `/threads/get`. Projected from the
 * aggregated contract so it tracks the backend automatically.
 */
export type ThreadNode = Output<"/threads/get">["thread"][number];

/** A single post view, as returned by `/posts/get` (post record + rendered html). */
export type PostView = Output<"/posts/get">["post"];

/** Re-exported so frontends get the branded id type without reaching into utils. */
export type { ID };
