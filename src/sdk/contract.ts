/**
 * # API contract
 *
 * A single, exhaustive description of the forum HTTP API as a TypeScript
 * interface. Every endpoint maps its `path` (without the `/api` prefix) to an
 * `{ input; output }` pair.
 *
 * The crucial property of this file is that the **output** types are *derived*
 * from the real backend implementation rather than written by hand. Each output
 * is computed from the concept method(s) the matching synchronization in
 * `src/syncs/*.sync.ts` actually invokes (its `Requesting.respond` payload and
 * the queries feeding it). Because of that, if a concept's result shape ever
 * changes, this contract — and therefore the SDK and any frontend built on it —
 * fails to compile. The types stay bound to the backend.
 *
 * Inputs are written explicitly. Ids are accepted as plain `string` for
 * ergonomics (callers usually pass ids they received as strings), while outputs
 * preserve the backend's branded {@link ID} type so downstream code keeps the
 * stronger guarantees.
 */
import type {
  AuthenticatingConcept,
  ConversingConcept,
  FormattingConcept,
  LinkingConcept,
  PostingConcept,
  ProfilingConcept,
  ReactingConcept,
  SessioningConcept,
  TaggingConcept,
  TrackingConcept,
} from "@concepts";
import type { ID } from "@utils/types.ts";

// --- Derivation helpers ---------------------------------------------------

/**
 * The error envelope every endpoint may return instead of its success payload.
 * Mirrors the `{ error }` responses produced throughout the synchronizations
 * and the `Requesting` HTTP server.
 */
export type ApiError = { error: string };

/** Narrows a concept method type `C[K]` to a callable, or `never`. */
type Fn<C, K extends keyof C> = C[K] extends (...args: never[]) => unknown
  ? C[K]
  : never;

/**
 * The success branch of a concept **action** result. Concept actions return
 * `{ ...success } | { error }`; this strips the error branch so the contract
 * reflects the value the success-path sync responds with.
 */
type ActionOk<C, K extends keyof C> = Exclude<
  Awaited<ReturnType<Fn<C, K>>>,
  ApiError
>;

/**
 * One row of a concept **query** result. Concept queries return arrays of
 * frames; this extracts the element type so the contract can reuse a query's
 * exact row shape (and aggregate it into a list where a sync does so).
 */
type QueryRow<C, K extends keyof C> = Awaited<ReturnType<Fn<C, K>>> extends
  readonly (infer R)[] ? R : never;

/**
 * Flattens an intersection of object types into a single object literal. Keeps
 * payloads assembled from multiple concept results (e.g. `/auth/login`) readable
 * in editor tooltips and as plain merged shapes for consumers.
 */
type Prettify<T> = { [K in keyof T]: T[K] } & {};

// --- Reusable derived row/record shapes -----------------------------------

/** `{ profile: { displayName, bio, avatar } }`, as returned by Profiling. */
type ProfileRow = QueryRow<ProfilingConcept, "_getProfile">;

/** The post record `{ author, content, createdAt, editedAt }` from Posting. */
type PostRecord = QueryRow<PostingConcept, "_getPost">["post"];

/** A rendered-html row `{ rendered }` from Formatting. */
type RenderedRow = QueryRow<FormattingConcept, "_getRendered">;

/**
 * One enriched thread node, exactly as assembled by the `/threads/get` sync:
 * the Conversing node fields plus the post record and its rendered html.
 */
export type ThreadNode = Prettify<
  & QueryRow<ConversingConcept, "_getThread">
  & { post: PostRecord }
  & RenderedRow
>;

/**
 * A single post view as returned by `/posts/get`: the post record merged with
 * its rendered html.
 */
export type PostView = Prettify<PostRecord & RenderedRow>;

// --- The contract ---------------------------------------------------------

/**
 * Maps every API path to its request `input` and success `output`. Combine an
 * endpoint's `output` with {@link ApiError} via {@link Result} to get the full
 * set of values a call may resolve to.
 */
export interface ApiContract {
  // Authentication & session
  "/auth/register": {
    input: { username: string; password: string; displayName: string };
    output: ActionOk<AuthenticatingConcept, "register">;
  };
  "/auth/login": {
    input: { username: string; password: string };
    output: Prettify<
      & ActionOk<SessioningConcept, "start">
      & ActionOk<AuthenticatingConcept, "authenticate">
    >;
  };
  "/auth/logout": {
    input: { session: string };
    output: { ok: true };
  };
  "/auth/me": {
    input: { session: string };
    output: Prettify<
      & QueryRow<SessioningConcept, "_getUser">
      & QueryRow<AuthenticatingConcept, "_getById">
      & ProfileRow
    >;
  };

  // Profiles
  "/profiles/get": {
    input: { user: string };
    output: ProfileRow;
  };
  "/profiles/setDisplayName": {
    input: { session: string; displayName: string };
    output: ActionOk<ProfilingConcept, "setDisplayName">;
  };
  "/profiles/setBio": {
    input: { session: string; bio: string };
    output: ActionOk<ProfilingConcept, "setBio">;
  };
  "/profiles/setAvatar": {
    input: { session: string; avatar: string };
    output: ActionOk<ProfilingConcept, "setAvatar">;
  };

  // Threads / posts / conversation
  "/threads/create": {
    input: { session: string; content: string };
    output: Prettify<
      & ActionOk<PostingConcept, "create">
      & ActionOk<ConversingConcept, "start">
    >;
  };
  "/threads/reply": {
    input: { session: string; parent: string; content: string };
    output: Prettify<
      & ActionOk<PostingConcept, "create">
      & ActionOk<ConversingConcept, "reply">
    >;
  };
  "/threads/get": {
    input: { conversation: string };
    output: { thread: ThreadNode[] };
  };
  "/posts/get": {
    input: { post: string };
    output: { post: PostView };
  };
  "/posts/edit": {
    input: { session: string; post: string; content: string };
    output: ActionOk<PostingConcept, "edit">;
  };
  "/posts/delete": {
    input: { session: string; post: string };
    output: ActionOk<PostingConcept, "delete">;
  };
  "/posts/byAuthor": {
    input: { author: string };
    output: { posts: QueryRow<PostingConcept, "_getByAuthor">[] };
  };

  // Reactions
  "/reactions/add": {
    input: { session: string; target: string; kind: string };
    output: ActionOk<ReactingConcept, "react">;
  };
  "/reactions/remove": {
    input: { session: string; target: string; kind: string };
    output: { ok: true };
  };
  "/reactions/forTarget": {
    input: { target: string };
    output: {
      reactions: QueryRow<ReactingConcept, "_getReactionsForTarget">[];
    };
  };

  // Tags
  "/tags/create": {
    input: { session: string; name: string };
    output: ActionOk<TaggingConcept, "createTag">;
  };
  "/tags/add": {
    input: { session: string; target: string; tag: string };
    output: ActionOk<TaggingConcept, "addTag">;
  };
  "/tags/remove": {
    input: { session: string; target: string; tag: string };
    output: ActionOk<TaggingConcept, "removeTag">;
  };
  "/tags/targets": {
    input: { tag: string };
    output: { targets: QueryRow<TaggingConcept, "_getTargets">[] };
  };
  "/tags/forTarget": {
    input: { target: string };
    output: { tags: QueryRow<TaggingConcept, "_getTags">[] };
  };

  // Unread (Tracking)
  "/unread/list": {
    input: { session: string; scope: string };
    output: { items: QueryRow<TrackingConcept, "_getUnread">[] };
  };
  "/unread/count": {
    input: { session: string; scope: string };
    output: QueryRow<TrackingConcept, "_getUnreadCount">;
  };
  "/unread/markSeen": {
    input: { session: string; item: string };
    output: ActionOk<TrackingConcept, "markSeen">;
  };
  "/unread/markAllSeen": {
    input: { session: string; scope: string };
    output: ActionOk<TrackingConcept, "markAllSeen">;
  };

  // Links
  "/links/backlinks": {
    input: { target: string };
    output: { sources: QueryRow<LinkingConcept, "_getBacklinks">[] };
  };
  "/links/forward": {
    input: { source: string };
    output: { targets: QueryRow<LinkingConcept, "_getForwardLinks">[] };
  };
}

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

/** Re-exported so frontends get the branded id type without reaching into utils. */
export type { ID };
