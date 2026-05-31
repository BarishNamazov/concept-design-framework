# Architecture: Engine, Concepts, API & SDK

This is the reference for how the concept-design forum backend works end to end:
the synchronization **engine** that runs concepts and composes them with syncs,
the **concept** catalogue, the **Requesting** HTTP server that bridges the wire to
actions, the **HTTP API / endpoint set**, and the **typed SDK** contract.

Companion reviews live in [CODE_REVIEW.md](CODE_REVIEW.md) (quality, fidelity, and
abstraction findings) and [FUTURE_CONCEPTS.md](FUTURE_CONCEPTS.md) (gap analysis).

## Contents

- [The synchronization engine](#the-synchronization-engine)
- [Concepts reference](#concepts-reference)
- [The Requesting server](#the-requesting-server)
- [HTTP API and endpoint set](#http-api-and-endpoint-set)
- [The typed SDK](#the-typed-sdk)

---

## The synchronization engine

This document describes the **engine** under `src/engine/` — the small framework
that runs concepts as independent state machines and composes them with
declarative **synchronizations**. It is the runtime behind everything in
[the HTTP API](#http-api-and-endpoint-set) and [the concepts reference](#concepts-reference);
read those for the concept catalogue and the endpoint set this engine wires up.

> Source: `src/engine/{mod,sync,actions,frames,types,vars,util}.ts`. Engine
> tests live under `src/engine/test/`.

### Mental model

- A **concept** is a self-contained class that owns its state (MongoDB
  collections) and exposes **actions** (state mutators) and **queries** (methods
  whose name starts with `_`). A concept never imports another concept.
- A **synchronization** ("sync") is a declarative rule of the form
  *when … where … then …* that reacts to actions and invokes further actions,
  composing concepts without coupling them.
- Every (non-query) action invocation is appended to an append-only **action
  journal**. Syncs are matched against that journal, not against live program
  state — which is what makes the reactive semantics declarative and replayable.

The engine is intentionally **dynamically typed**: logic variables are `symbol`s
and action inputs/outputs are `Mapping = Record<string, unknown>` (see
`types.ts`). Static typing is layered back on top by the SDK contract — see
[the typed SDK](#the-typed-sdk).

### The public `@engine` surface

`src/engine/mod.ts` is what the rest of the app imports as `@engine`:

```ts
export { actions, Logging, SyncConcept } from "./sync.ts";
export { Frames } from "./frames.ts";
export type {
  ActionList,
  ActionPattern,
  Empty,
  Frame,
  Mapping,
  SyncFunction as Sync,
  Vars,
} from "./types.ts";
```

| Export | Kind | Role |
| --- | --- | --- |
| `actions(...)` | function | Normalizes `[action, input, output?]` tuples into the clause patterns used in `when` / `then`. |
| `Sync` (`SyncFunction`) | type | The shape of a sync: `(vars) => { when, where?, then }`. |
| `ActionList` / `ActionPattern` | types | Clause tuple and normalized pattern types used by `actions(...)` and endpoint builders. |
| `Frames` | class | The relational working set a sync transforms in `where`. |
| `Logging` | enum | `OFF` / `TRACE` / `VERBOSE` verbosity for the action trace. |
| `SyncConcept` | class | The engine itself: registers syncs, instruments concepts, matches and fires. |
| `Empty` / `Frame` / `Mapping` / `Vars` | types | Core vocabulary (see below). |

The application creates one `SyncConcept` instance (exported as `Engine` from the
generated `@concepts` barrel), sets `Engine.logging`, calls `Engine.register(syncs)`,
and starts the Requesting server — see `src/main.ts`.

### Concepts as independent state machines

A concept only ever mutates its own collections and returns a plain mapping.
Actions that can fail return a non-empty success dict **or** an `{ error }` dict,
so a sync can distinguish the two cases by matching on the output pattern (this
is what makes e.g. an `error` output mutually exclusive with a `user` output —
see [the concepts reference](#concepts-reference), "Error overloads"). Queries (prefixed `_`)
never mutate and always return an **array** of rows (possibly empty).

Concepts never call each other. All cross-concept behavior is expressed as syncs.

### The action journal (`actions.ts`)

`ActionConcept` is itself a tiny concept: actions (`invoke`, `invoked`) mutate an
append-only log; queries (`_getByFlow`, `_getById`) read it.

Each entry is an immutable `ActionRecord`:

```ts
interface ActionRecord {
  id?: string;                       // unique journal id
  action: Function;                  // the instrumented action callable
  concept: object;                   // back-reference to the owning concept
  input: Record<string, unknown>;
  output?: Record<string, unknown>;  // attached once the action resolves
  synced?: Map<string, string>;      // per-sync double-fire guard (see below)
  flow: string;                      // the causal-chain token
}
```

Two indexes are maintained: **by id** (direct lookup, e.g. to mark a record
synced) and **by flow** (to restrict matching to a single causal chain).

### Flows

A **flow** is a token shared by every action in one direct cause/effect chain.
The first action of a request gets a fresh flow (a UUID); any action a sync
produces in its `then` **inherits** the triggering action's flow. Matching only
ever considers records *within the firing action's flow* (`_getByFlow`), so two
independent requests in flight at the same time never cross-match. The flow token
travels on a reserved frame key, alongside `synced` and `actionId` (see
`sync.ts`).

### The when / where / then model

A sync is a function of the `Vars` proxy returning three clauses:

- **when** — patterns matched against the journal. Matching binds logic variables
  and yields a set of `Frames`.
- **where** — an optional, mostly pure transform over those frames (query,
  filter, map, aggregate). May be async. Produces the final frames.
- **then** — actions to invoke, **one per surviving frame**, with each input
  resolved from that frame's bindings.

If `when` produces zero frames the sync does not fire; if `where` filters every
frame away, `then` runs zero times.

### Matching and unification

#### Symbols as logic variables, and the `Vars` proxy

`vars.ts` exports `$vars`, a `Proxy` whose every string property read returns a
**fresh `Symbol`** named after the property:

```ts
const { user, post } = $vars; // two distinct symbols, described "user"/"post"
```

A `symbol` gives each variable a stable identity that doubles as a frame key,
while its `.description` keeps logs (and `collectAs` output) human-readable. When
the engine registers a sync it calls the sync function with `$vars`, so the
destructured names become the sync's logic variables.

#### `actions()` and clause patterns

`actions([action, input, output?], ...)` turns each tuple into an
`ActionPattern` carrying the `concept`, the `action`, the `input` pattern, an
optional `output` pattern, and the shared `flow` symbol. The action **must be
instrumented** (carry a `.concept`); a bare concept method throws
`"Action … is not instrumented."`. In a `when` an `ActionPattern` describes
something to match; in a `then` it describes something to invoke.

#### How a record unifies with a pattern

`matchArguments` / `unifyPattern` decide whether one journal record satisfies one
`when` clause, given the frame accumulated so far:

1. The record's `concept` **and** `action` identity must equal the pattern's.
2. For each key in the pattern's `input`, the record's `input` must carry that
   key (a missing key rejects the match). Then:
   - a **symbol** value binds to the record's value if currently unbound, and
     otherwise must **unify** with the existing binding (strict `!==` conflict
     rejects);
   - a **literal** value must strictly equal the record's value.
3. The same rules apply to the `output` pattern, which is **required** in a
   `when`: an absent `output` is a declaration error, and an output key the
   record lacks rejects the match. This is what makes matching `{ error }` vs
   `{ user }` mutually exclusive.

Unification is pure — `unifyPattern` never mutates its inputs; it returns an
extended frame or `undefined`. On success the record's id is stored under a
per-clause symbol so the engine can later recover and mark the matched records.

`matchWhen` seeds a single frame carrying the flow token, then for each `when`
clause **joins** in every in-flow record that matches, growing the frame set —
this is the relational join across clauses that lets a sync correlate, say, a
`Requesting.request` with the `Authenticating.authenticate` it triggered.

### Frames and the `Frames` combinators (`frames.ts`)

A **frame** is one row of bindings keyed by `symbol`; **`Frames`** is an ordered
bag of rows that behaves like a relational intermediate result. `Frames` extends
`Array` and is wrapped in a `Proxy` so any array method that returns a new array
(`map`, `filter`, `flatMap`, `slice`, `concat`, `reverse`, `sort`, `splice`, …)
transparently returns a `Frames` again, keeping the fluent API closed. `query` /
`queryAsync` are excluded from auto-wrapping because they already construct
`Frames` themselves.

The key combinators used in `where`:

- **`query(f, input, output)`** — for each frame, bind `input` from the frame
  (symbols looked up, literals passed through), call the concept query `f`, and
  **fan the frame out** over the returned rows, extending each new frame with the
  `output` symbol bindings. Works with sync and async query functions (returning
  `Frames` or `Promise<Frames>`). A frame whose query yields **zero rows is
  dropped** — i.e. inner-join / fan-out semantics. (`queryAsync` is the
  always-async variant.)
- **`filter(pred)`** — drop frames that fail a predicate, e.g.
  `frames.filter(($) => $[active] === false)`.
- **`map(fn)`** — transform frames row-by-row (still a `Frames`).
- **`collectAs(collect, as)`** — group frames by their *non-collected* symbol
  keys and gather the `collect` symbols of each group into an array bound to
  `as`. Within a group each collected symbol is keyed by its `.description`, so
  downstream code reads them by name. This is the aggregation step that turns
  many rows into one list.
- **`aggregate(base, collect, as)`** — like `collectAs`, but guarantees **exactly
  one** output frame even when `this` is empty, by emitting `base` with `as`
  bound to `[]`. This fixes the classic "list endpoint silently fails to respond
  when the query returns nothing" bug: capture the originating `base` frame
  before the fan-out queries, then `aggregate` back so the request frame survives
  even with zero results.

> The standard pattern for a list endpoint: start from the single request frame,
> fan out with `.query`, then `aggregate` back into one list bound to the
> response.

### How concepts get instrumented

`SyncConcept.instrument(concepts)` wraps each concept in a `Proxy`
(`instrumentConcept`) that intercepts method access:

- **Queries** (`_`-prefixed) are simply bound to the concept and memoized — they
  have no journal side effects and are never instrumented.
- **Actions** are wrapped exactly once (memoized in `boundActions`, keyed by the
  original method, so the instrumented identity is stable across accesses — this
  identity is what `actions()` patterns are compared against). The wrapper:
  1. pulls the reserved `flow`, `synced`, and `actionId` off the argument object
     (defaulting each — a top-level call with none gets a fresh flow and id);
  2. appends an `ActionRecord` to the journal (`Action.invoke`);
  3. runs the underlying action and records its `output` (`Action.invoked`);
  4. drives `synchronize`, which fires any matching syncs;
  5. returns the action's output.

The instrumented callable also carries `.concept` and `.action` back-references
and a custom inspector for readable logs.

### Firing syncs (`synchronize` → `matchWhen` → `where` → `addThen`)

When an action completes, `synchronize`:

1. logs it (honouring `Logging`);
2. looks up the syncs indexed on that action (`syncsByAction`, an inverted index
   built at `register` time — only syncs whose `when` mentions this action are
   even considered);
3. for each candidate sync, runs `matchWhen` to get the matched frames; skips if
   empty;
4. runs `where` (awaiting it if it returns a Promise) to get the final frames;
5. calls `addThen`, which for every surviving frame resolves each `then` clause's
   input from the frame (`matchThen` — symbols replaced by bindings, plus a fresh
   `actionId` and the inherited `flow`) and invokes the action.

### Double-fire prevention (`synced`)

Because syncs match against an append-only log, the same evidence could match a
sync more than once as new records arrive in the flow. The `synced` map on each
`ActionRecord` prevents this:

- During `matchWhen`, any candidate record that already has this sync's name in
  its `synced` map is **skipped** (`candidate.synced?.has(sync.sync)`).
- In `addThen`, once a sync produces its `then` action(s) for a frame, every
  `when` record that frame consumed is marked
  `whenAction.synced.set(sync.sync, producedActionId)`.

So a given sync consumes a given set of `when` records **at most once**, even
though the journal keeps growing.

### Worked example: `POST /auth/login`

Tracing one request end-to-end through the journal and the auth syncs
(`src/syncs/auth.sync.ts`). All actions below share one **flow**.

1. **Request in.** The browser sends `POST /api/auth/login` with
   `{ username, password }`. The Requesting server (see
   [the Requesting server](#the-requesting-server)) fires
   `Requesting.request({ path: "/auth/login", username, password })`, journaling
   it with a fresh flow and returning a `request` id. It then awaits the response
   via `Requesting._awaitResponse({ request })`.

2. **`LoginRequest` fires.** Its `when` matches the just-journaled
   `Requesting.request` for `path: "/auth/login"`, binding `request`, `username`,
   `password`. Its `then` invokes
   `Authenticating.authenticate({ username, password })` — in the same flow.

   ```ts
   export const LoginRequest = login.sync(({ request, username, password }) => ({
     when: login.actions(login.request({ username, password }, { request })),
     then: login.actions([Authenticating.authenticate, { username, password }]),
   }));
   ```

3. **Branch on the result.** `Authenticating.authenticate` journals either
   `{ user }` (success) or `{ error }` (failure):
   - On **success**, `LoginStartsSession` matches the request *and* the
     `authenticate` output `{ user }` (a join across two `when` clauses), and its
     `then` invokes `Sessioning.start({ user })`.
   - On **failure**, `LoginError` matches the request and `{ error }` and
     responds immediately with `Requesting.respond({ request, error })`. (The
     `{ user }` and `{ error }` patterns are mutually exclusive, so exactly one
     branch fires.)

4. **Respond.** On the success path, once `Sessioning.start` journals
   `{ session }`, `LoginResponse` joins all three records (request, `authenticate`
   `{ user }`, `start` `{ session }`) and invokes
   `Requesting.respond({ request, session, user })`.

   ```ts
   export const LoginResponse = login.sync(({ request, user, session }) => ({
     when: login.actions(
       login.request({}, { request }),
       [Authenticating.authenticate, {}, { user }],
       [Sessioning.start, {}, { session }],
     ),
     then: login.actions(login.respond<LoginOutput>({ request, session, user })),
   }));
   ```

5. **Bridge back to HTTP.** `Requesting.respond` resolves the pending promise the
   server was awaiting, so `_awaitResponse` returns `{ session, user }` and the
   server writes it back as the HTTP JSON body.

Because all of these records share one flow, and because each sync marks its
`when` records `synced` after firing, the chain runs exactly once per request and
never tangles with other concurrent logins.

For an endpoint that uses `where` (queries + filter) instead of a multi-step
journal join, see `MeResponse` / `MeInvalidSession` in the same file, and the
list-endpoint `aggregate` pattern in `src/syncs/threads.sync.ts`.


---

## Concepts reference

This is the current catalogue of concept classes under `src/concepts/`. Concepts
own their own state, never import one another, and relate other concepts' objects
only through opaque branded `ID` strings.

| Concept | Type Params | Purpose | Actions | Queries | Collections |
| --- | --- | --- | --- | --- | --- |
| `Authenticating` | owns `User` | Establish and prove persistent identity. | `register`, `authenticate`, `changePassword`, `changeUsername`, `unregister` | `_getById`, `_getByUsername`, `_existsByUsername` | `Authenticating.users` |
| `Sessioning` | `[User]` | Keep a user signed in across requests. | `start`, `startWithExpiry`, `end`, `endAllForUser`, `expire` | `_getUser`, `_getSessionsForUser`, `_isActive` | `Sessioning.sessions` |
| `Profiling` | `[User]` | Store a public display name, bio, and avatar. | `createProfile`, `setDisplayName`, `setBio`, `setAvatar`, `deleteProfile` | `_getProfile`, `_getDisplayName`, `_getByDisplayName` | `Profiling.profiles` |
| `Posting` | `[Author]` | Store authored textual content. | `create`, `edit`, `delete` | `_getPost`, `_getContent`, `_getByAuthor`, `_getAuthor`, `_exists` | `Posting.posts` |
| `Conversing` | `[Item]` | Organize items into threaded conversations. | `start`, `reply`, `remove` | `_getConversations`, `_getNodeByItem`, `_getItem`, `_getConversation`, `_getRoot`, `_getThread`, `_getReplies`, `_getParent`, `_getAncestors` | `Conversing.conversations`, `Conversing.nodes` |
| `Reacting` | `[User, Target]` | Record named reactions by users on targets. | `react`, `unreact`, `clearTarget` | `_getReactionsForTarget`, `_getReactionsByUser`, `_countByKind`, `_hasReacted` | `Reacting.reactions` |
| `Tagging` | `[Target]` | Apply shared labels to targets. | `createTag`, `addTag`, `removeTag`, `deleteTag`, `clearTarget` | `_getTags`, `_getTargets`, `_getTagByName`, `_getAllTags` | `Tagging.tags`, `Tagging.targets` |
| `Tracking` | `[User, Item, Scope]` | Track seen/unseen state; unread is derived. | `register`, `unregister`, `markSeen`, `markUnseen`, `markAllSeen` | `_getUnread`, `_getUnreadCount`, `_getSeen`, `_isSeen`, `_getItemsInScope` | `Tracking.items`, `Tracking.seenMarks` |
| `Linking` | `[Item]` | Maintain directed links and backlinks. | `link`, `unlink`, `setLinks`, `clearLinks` | `_getForwardLinks`, `_getBacklinks`, `_hasLink`, `_getOutgoingCount`, `_getBacklinkCount` | `Linking.links` |
| `Formatting` | `[Target]` | Store sanitized HTML renderings of Markdown sources. | `setSource`, `clear` | `_getRendered`, `_getSource`, `_getDocument` | `Formatting.targets` |
| `Requesting` | none | Reify HTTP requests as actions for syncs. | `request`, `respond` | `_awaitResponse` | `Requesting.requests` |

### Conventions

- Actions take one object argument and return one object result.
- Normal action failures return `{ error: string }`; they are not thrown.
- Queries are methods prefixed with `_` and return arrays of rows.
- `Requesting._awaitResponse` is the bootstrap exception: it has query shape but
  waits on an in-memory pending request and can time out.
- Concepts are complete beyond the forum's current endpoints. Some actions are
  reusable concept surface that the app does not expose directly.
- Cross-concept behavior, including authorization, rendering, threading,
  unread registration, link derivation, and cascades, belongs in `src/syncs/`.


---

## The Requesting server

This document describes the Bun-native HTTP server that turns incoming requests
into concept actions:
`src/concepts/Requesting/RequestingConcept.ts`.

It complements the concept's own
[`src/concepts/Requesting/README.md`](../src/concepts/Requesting/README.md),
which explains the request/respond cycle from a concept author's perspective.
This page focuses on the server mechanics and how they connect to the
[engine](#the-synchronization-engine) and the [SDK](#the-typed-sdk).

### What Requesting Is

`Requesting` is the provided bootstrap concept: it reifies HTTP requests as
concept actions so the rest of the app can stay pure concepts +
synchronizations. It exposes two actions and one query:

| Member | Kind | Role |
| --- | --- | --- |
| `request({ path, ... })` | action | Create a `Request`, returning `{ request }`. Triggered by an incoming HTTP request. |
| `respond({ request, ... })` | action | Attach a response to a pending `Request`; resolves the awaiting HTTP handler. |
| `_awaitResponse({ request })` | query | Wait up to a timeout for the `Request` response, returning `[{ response }]`. |

`Requesting.requests` is the MongoDB collection that persists request documents
for logging and auditing. Pending in-flight requests are tracked in memory only,
since a promise cannot be persisted.

### From HTTP Request To `Requesting.request`

`startRequestingServer(concepts, options?)` starts `Bun.serve`. Its `fetch`
handler:

1. Answers CORS preflight (`OPTIONS`) immediately with `204` and the CORS
   headers.
2. For a `POST` whose pathname starts with `REQUESTING_BASE_URL`, calls
   `handleRequesting`.
3. Everything else gets `404`.

`handleRequesting` is the core bridge:

```ts
const actionPath = pathname.slice(REQUESTING_BASE_URL.length);
const inputs = { ...body, path: actionPath };

const { request } = await Requesting.request(inputs);
const responseArray = await Requesting._awaitResponse({ request });
return json(responseArray[0].response);
```

Key points:

- The JSON body must be an object; an empty or non-object body is rejected with
  `400`.
- The `path` matched by syncs excludes the base URL. A request to
  `POST /api/auth/login` becomes
  `Requesting.request({ path: "/auth/login", ... })`.
- All other body fields are spread flat alongside `path`, exactly as the
  endpoint's syncs expect.

There are no direct concept passthrough routes. Every public API endpoint is an
explicit `Requesting.request` synchronization.

### How `_awaitResponse` Bridges The Async Response

`Requesting.request` creates a `Promise` and stashes its `resolve`/`reject` in the
in-memory `pending` map keyed by the request id. The HTTP handler then calls
`_awaitResponse`, which races that promise against a timeout:

```ts
const response = await Promise.race([pendingRequest.promise, timeoutPromise]);
```

- If a sync calls `Requesting.respond({ request, ... })`, `respond` looks up the
  pending entry and calls `resolve(response)`, unblocking `_awaitResponse`.
- If no sync responds within `REQUESTING_TIMEOUT`, the timeout promise rejects.
  `handleRequesting` maps a timeout to HTTP `504` and other errors to `500`.

So the lifecycle is: HTTP in -> `request` -> syncs do work -> `respond` ->
`_awaitResponse` returns -> HTTP out. The engine's [flow](#flows) ties
every action in that chain together. For a full endpoint trace, see the
[`/auth/login` worked example](#worked-example-post-authlogin).

### How Syncs Answer

Both `request` and `respond` take any parameters as a flat record alongside
`path` / `request`. A success response is just a `then` clause:

```ts
then: actions([Requesting.respond, { request, session, user }]);
```

Domain logic answers through explicit syncs, so the response shape is whatever
the endpoint's typed sync declares. See
[`src/syncs/auth.sync.ts`](../src/syncs/auth.sync.ts) and the endpoint catalogue
in [the HTTP API](#http-api-and-endpoint-set).

### Why Endpoints Are Explicit

The old passthrough model exposed concept methods directly at routes derived from
class and method names. This forum now uses only explicit Requesting endpoints
because reifying requests lets us:

- authorize before doing anything;
- fan out across multiple concepts in one flow;
- shape success and error responses deliberately;
- infer the SDK contract from the same sync definitions used at runtime.

### CORS

Every response carries CORS headers built once at startup:

```ts
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": REQUESTING_ALLOWED_DOMAIN,
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
```

The allowed origin comes from `REQUESTING_ALLOWED_DOMAIN` (default `*`). Pin it
in production:

```bash
REQUESTING_ALLOWED_DOMAIN=https://app.example.com bun run start
```

The [`example-client/`](../example-client/README.md) demo runs on a different
origin from the API and relies on this default.

### Environment Variables

Bun loads `.env` automatically. The server reads:

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `8000` | Port `Bun.serve` binds. Tests can override with `options.port`. |
| `REQUESTING_BASE_URL` | `/api` | Path prefix for all API requests; stripped before sync matching. |
| `REQUESTING_TIMEOUT` | `10000` ms | How long `_awaitResponse` waits before timing out. |
| `REQUESTING_SAVE_RESPONSES` | `true` | Whether `respond` persists the response onto the request document. |
| `REQUESTING_ALLOWED_DOMAIN` | `*` | `Access-Control-Allow-Origin` value. |

### See Also

- [`src/concepts/Requesting/README.md`](../src/concepts/Requesting/README.md) -
  the request/respond cycle from a concept author's view.
- [the synchronization engine](#the-synchronization-engine) - how `Requesting.request` flows through syncs
  and back to `Requesting.respond`.
- [the HTTP API](#http-api-and-endpoint-set) - the endpoint set and typed sync
  contract.
- [the typed SDK](#the-typed-sdk) - how a typed client calls these
  endpoints.


---

## HTTP API and endpoint set

This document is the current HTTP API and SDK contract reference for the forum
backend. The source of truth is `src/syncs/app.ts`, which composes every typed
Requesting endpoint into `api` and exports `type ForumApi`.

### How The API Is Exposed

The browser talks to the backend only through the `Requesting` concept. Each API
endpoint is a `POST {REQUESTING_BASE_URL}{path}` request whose JSON body is the
endpoint input. A synchronization matches `Requesting.request` for that path,
performs the work across concepts, and answers with `Requesting.respond`.

There are no direct concept passthrough routes. Every public endpoint is an
explicit Requesting sync, which keeps authorization, fan-out across concepts,
response shaping, and SDK typing in one declared API surface.

Paths below are shown without the `/api` base prefix because syncs match the
unprefixed `path` value.

### Endpoint Set

#### Authentication And Session

- `POST /auth/register` `{ username, password, displayName }` -> `{ user }`
  Registers credentials and creates a profile.
- `POST /auth/login` `{ username, password }` -> `{ session, user }`
- `POST /auth/logout` `{ session }` -> `{ ok }`
- `POST /auth/me` `{ session }` -> `{ user, username, profile }`
- `POST /auth/changePassword` `{ session, oldPassword, newPassword }` ->
  `{ user }`

#### Profiles

- `POST /profiles/get` `{ user }` -> `{ profile }`
- `POST /profiles/setDisplayName` `{ session, displayName }` -> `{ user }`
- `POST /profiles/setBio` `{ session, bio }` -> `{ user }`
- `POST /profiles/setAvatar` `{ session, avatar }` -> `{ user }`

#### Threads And Posts

- `POST /threads/create` `{ session, content }` ->
  `{ post, conversation, node }`
  Creates a post, starts a conversation rooted at it, renders markdown, and
  registers unread tracking for the conversation scope.
- `POST /threads/reply` `{ session, parent, content }` -> `{ post, node }`
  Creates a post, replies under a Conversing node, renders markdown, registers
  unread tracking, and records `[[<id>]]` content links.
- `POST /threads/get` `{ conversation }` -> `{ thread }`
  Returns ordered nodes enriched with post content and rendered HTML.
- `POST /threads/list` `{}` -> `{ conversations }`
  Returns conversation roots enriched with their root post data.
- `POST /posts/get` `{ post }` -> `{ post }`
  Returns one post enriched with rendered HTML.
- `POST /posts/edit` `{ session, post, content }` -> `{ post }`
  Author-only; updates content, re-renders, and updates links.
- `POST /posts/delete` `{ session, post }` -> `{ post }`
  Author-only; cascades through conversation, formatting, unread tracking,
  reactions, tags, and links where applicable.
- `POST /posts/byAuthor` `{ author }` -> `{ posts }`

#### Reactions

- `POST /reactions/add` `{ session, target, kind }` -> `{ reaction }`
- `POST /reactions/remove` `{ session, target, kind }` -> `{ ok }`
- `POST /reactions/forTarget` `{ target }` -> `{ reactions }`

#### Tags

- `POST /tags/create` `{ session, name }` -> `{ tag }`
- `POST /tags/add` `{ session, target, tag }` -> `{ target }`
- `POST /tags/remove` `{ session, target, tag }` -> `{ target }`
- `POST /tags/targets` `{ tag }` -> `{ targets }`
- `POST /tags/forTarget` `{ target }` -> `{ tags }`

#### Unread

- `POST /unread/list` `{ session, scope }` -> `{ items }`
- `POST /unread/count` `{ session, scope }` -> `{ count }`
- `POST /unread/markSeen` `{ session, item }` -> `{ item }`
- `POST /unread/markAllSeen` `{ session, scope }` -> `{ user }`

#### Links

- `POST /links/backlinks` `{ target }` -> `{ sources }`
- `POST /links/forward` `{ source }` -> `{ targets }`

### Cross-Concept Synchronization Highlights

- **Authorization:** protected endpoints resolve `session` through
  `Sessioning._getUser`; invalid sessions respond with `{ error }`.
- **Thread creation:** `Posting.create` is followed by `Conversing.start`,
  `Formatting.setSource`, and `Tracking.register`.
- **Replies:** `Posting.create` is followed by `Conversing.reply`,
  `Formatting.setSource`, `Tracking.register`, and `Linking.setLinks`.
- **Post edits:** `Posting.edit` is followed by re-rendering and link
  replacement.
- **Post deletes:** deletion cascades to `Conversing.remove` when possible,
  `Formatting.clear`, `Tracking.unregister`, `Reacting.clearTarget`,
  `Tagging.clearTarget`, and `Linking.clearLinks`.
- **List endpoints:** syncs use `Frames.aggregate(...)` so empty lists still
  produce a response instead of timing out.

### SDK Contract

The SDK runtime under `src/sdk/` is generic and self-contained. It imports no app
concepts, syncs, or generated contract file.

The app contract lives with the server composition:

```ts
export const api = defineApi({ auth, threads, posts });
export type ForumApi = ContractOf<typeof api>;
```

Each endpoint is declared through `requestingEndpoint(path)`, so the same syncs
that implement `Requesting.request` / `Requesting.respond` also carry the input
and output types used by `ForumApi`.

Client code binds the generic SDK to the app type:

```ts
import { createClient } from "../src/sdk/index.ts";
import type { ForumApi } from "../src/syncs/app.ts";

const api = createClient<ForumApi>({ baseUrl: "http://localhost:8000/api" });
const login = await api.auth.login({ username, password });
```

SDK methods resolve to `Output | { error: string }` and do not throw for normal
backend or transport failures.


---

## The typed SDK

The SDK is split into two pieces:

- `src/sdk` is the self-contained Requesting client runtime.
- `src/syncs/app.ts` is the forum server API value and type contract.

```
browser / frontend
   │  createClient<ForumApi>().auth.login(...)
   ▼
src/sdk  (generic Proxy fetch client)
   │  POST {baseUrl}/auth/login
   ▼
Requesting server
   │  Requesting.request({ path: "/auth/login", ... })
   ▼
syncs from src/syncs/app.ts
   │  Authenticating.authenticate → Sessioning.start → Requesting.respond
   ▼
JSON response back to the SDK call
```

`src/sdk` imports no backend code. The frontend imports the app contract as a
type only:

```ts
import { createClient } from "../src/sdk/index.ts";
import type { ForumApi } from "../src/syncs/app.ts";

const api = createClient<ForumApi>({ baseUrl });
```

### Type Flow

1. Sync files declare Requesting endpoints with
   `requestingEndpoint("/path")`.
2. Each endpoint sync uses the same builder for runtime patterns and type
   metadata: `endpoint.request(...)`, `endpoint.respond<Output>(...)`, and
   `endpoint.error(...)`.
3. `src/syncs/app.ts` composes the endpoint groups and exports
   `type ForumApi = ContractOf<typeof api>`.
4. The generic SDK uses `ForumApi` to infer path, input, and output types.

There is no generated SDK contract file. `bun run typecheck` evaluates the
contract directly.

### Error Handling

SDK methods resolve to `Output<P> | { error: string }` and do not throw for
normal backend or transport failures. Callers check `"error" in result`. See also
[`src/sdk/README.md`](../src/sdk/README.md) for SDK usage.

> Status: implemented. Replaces the generated `src/syncs/contract.generated.ts`
> design.

### Goal

The SDK runtime is a self-contained Requesting client. It does not import forum
concepts, syncs, generated files, or app-specific view types. The forum API type
is inferred from the server's typed Requesting endpoint declarations in
`src/syncs/app.ts`, then passed to the SDK generic:

```ts
import { createClient } from "../src/sdk/index.ts";
import type { ForumApi } from "../src/syncs/app.ts";

const api = createClient<ForumApi>({ baseUrl: "http://localhost:8000/api" });
```

This mirrors Eden Treaty’s shape: the server exports an app type, and the client
is a generic transport bound to that type by the caller.

### Design

- `src/concepts/Requesting/api.ts` provides `requestingEndpoint(path)`, a typed
  wrapper over the existing `actions(...)` DSL.
- `endpoint.request(...)` emits the real `Requesting.request` pattern and records
  request body keys as phantom TypeScript metadata.
- `endpoint.respond<Output>(...)` emits the real `Requesting.respond` action and
  records the success payload type. Error responders use `endpoint.error(...)`
  and remain part of the SDK `Result` envelope, not the success output.
- Sync files export normal engine sync functions, but each is created through its
  endpoint builder. The same syncs are used for runtime registration and API type
  inference.
- `src/syncs/app.ts` composes the endpoint groups into `api`, exports
  `syncs = syncMap(api)`, and exposes `type ForumApi = ContractOf<typeof api>`.

### Adding An Endpoint

1. Create a path builder in the relevant sync file:
   `const login = requestingEndpoint("/auth/login")`.
2. Write syncs with `login.sync(...)`, `login.request(...)`, and
   `login.respond<LoginOutput>(...)`.
3. Add those syncs to the feature export via `login.define({ ... })`.
4. Include the feature in `src/syncs/app.ts` if it is a new feature group.

There is no generated SDK contract and no separate endpoint manifest to keep in
sync. Type-checking `ForumApi` is enough to catch API drift.

### Verification

- `bun run typecheck` checks the inferred `ForumApi`, SDK call inputs/outputs,
  and representative exact-type assertions.
- `src/syncs/endpoints.consistency.test.ts` introspects the endpoint groups and
  confirms every typed endpoint is backed by coherent `Requesting.request` paths
  and at least one `Requesting.respond` sync.

