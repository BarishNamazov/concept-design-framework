# The synchronization engine

This document describes the **engine** under `src/engine/` — the small framework
that runs concepts as independent state machines and composes them with
declarative **synchronizations**. It is the runtime behind everything in
[`docs/API_AND_SDK.md`](API_AND_SDK.md) and [`docs/CONCEPTS.md`](CONCEPTS.md);
read those for the concept catalogue and the endpoint set this engine wires up.

> Source: `src/engine/{mod,sync,actions,frames,types,vars,util}.ts`. Engine
> tests live under `src/engine/test/`.

## Mental model

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
[`docs/SDK_AUTOGEN.md`](SDK_AUTOGEN.md).

## The public `@engine` surface

`src/engine/mod.ts` is what the rest of the app imports as `@engine`:

```ts
export { actions, Logging, SyncConcept } from "./sync.ts";
export { Frames } from "./frames.ts";
export type { Empty, Frame, Mapping, SyncFunction as Sync, Vars } from "./types.ts";
```

| Export | Kind | Role |
| --- | --- | --- |
| `actions(...)` | function | Normalizes `[action, input, output?]` tuples into the clause patterns used in `when` / `then`. |
| `Sync` (`SyncFunction`) | type | The shape of a sync: `(vars) => { when, where?, then }`. |
| `Frames` | class | The relational working set a sync transforms in `where`. |
| `Logging` | enum | `OFF` / `TRACE` / `VERBOSE` verbosity for the action trace. |
| `SyncConcept` | class | The engine itself: registers syncs, instruments concepts, matches and fires. |
| `Empty` / `Frame` / `Mapping` / `Vars` | types | Core vocabulary (see below). |

The application creates one `SyncConcept` instance (exported as `Engine` from the
generated `@concepts` barrel), sets `Engine.logging`, calls `Engine.register(syncs)`,
and starts the Requesting server — see `src/main.ts`.

## Concepts as independent state machines

A concept only ever mutates its own collections and returns a plain mapping.
Actions that can fail return a non-empty success dict **or** an `{ error }` dict,
so a sync can distinguish the two cases by matching on the output pattern (this
is what makes e.g. an `error` output mutually exclusive with a `user` output —
see [`docs/CONCEPTS.md`](CONCEPTS.md), "Error overloads"). Queries (prefixed `_`)
never mutate and always return an **array** of rows (possibly empty).

Concepts never call each other. All cross-concept behavior is expressed as syncs.

## The action journal (`actions.ts`)

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

## Flows

A **flow** is a token shared by every action in one direct cause/effect chain.
The first action of a request gets a fresh flow (a UUID); any action a sync
produces in its `then` **inherits** the triggering action's flow. Matching only
ever considers records *within the firing action's flow* (`_getByFlow`), so two
independent requests in flight at the same time never cross-match. The flow token
travels on a reserved frame key, alongside `synced` and `actionId` (see
`sync.ts`).

## The when / where / then model

A sync is a function of the `Vars` proxy returning three clauses:

- **when** — patterns matched against the journal. Matching binds logic variables
  and yields a set of `Frames`.
- **where** — an optional, mostly pure transform over those frames (query,
  filter, map, aggregate). May be async. Produces the final frames.
- **then** — actions to invoke, **one per surviving frame**, with each input
  resolved from that frame's bindings.

If `when` produces zero frames the sync does not fire; if `where` filters every
frame away, `then` runs zero times.

## Matching and unification

### Symbols as logic variables, and the `Vars` proxy

`vars.ts` exports `$vars`, a `Proxy` whose every string property read returns a
**fresh `Symbol`** named after the property:

```ts
const { user, post } = $vars; // two distinct symbols, described "user"/"post"
```

A `symbol` gives each variable a stable identity that doubles as a frame key,
while its `.description` keeps logs (and `collectAs` output) human-readable. When
the engine registers a sync it calls the sync function with `$vars`, so the
destructured names become the sync's logic variables.

### `actions()` and clause patterns

`actions([action, input, output?], ...)` turns each tuple into an
`ActionPattern` carrying the `concept`, the `action`, the `input` pattern, an
optional `output` pattern, and the shared `flow` symbol. The action **must be
instrumented** (carry a `.concept`); a bare concept method throws
`"Action … is not instrumented."`. In a `when` an `ActionPattern` describes
something to match; in a `then` it describes something to invoke.

### How a record unifies with a pattern

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

## Frames and the `Frames` combinators (`frames.ts`)

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

## How concepts get instrumented

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

## Firing syncs (`synchronize` → `matchWhen` → `where` → `addThen`)

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

## Double-fire prevention (`synced`)

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

## Worked example: `POST /auth/login`

Tracing one request end-to-end through the journal and the auth syncs
(`src/syncs/auth.sync.ts`). All actions below share one **flow**.

1. **Request in.** The browser sends `POST /api/auth/login` with
   `{ username, password }`. The Requesting server (see
   [`docs/REQUESTING.md`](REQUESTING.md)) fires
   `Requesting.request({ path: "/auth/login", username, password })`, journaling
   it with a fresh flow and returning a `request` id. It then awaits the response
   via `Requesting._awaitResponse({ request })`.

2. **`LoginRequest` fires.** Its `when` matches the just-journaled
   `Requesting.request` for `path: "/auth/login"`, binding `request`, `username`,
   `password`. Its `then` invokes
   `Authenticating.authenticate({ username, password })` — in the same flow.

   ```ts
   export const LoginRequest: Sync = ({ request, username, password }) => ({
     when: actions([
       Requesting.request,
       { path: "/auth/login", username, password },
       { request },
     ]),
     then: actions([Authenticating.authenticate, { username, password }]),
   });
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
   export const LoginResponse: Sync = ({ request, user, session }) => ({
     when: actions(
       [Requesting.request, { path: "/auth/login" }, { request }],
       [Authenticating.authenticate, {}, { user }],
       [Sessioning.start, {}, { session }],
     ),
     then: actions([Requesting.respond, { request, session, user }]),
   });
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

## See also

- [`docs/REQUESTING.md`](REQUESTING.md) — how HTTP requests become
  `Requesting.request` actions and how syncs answer them.
- [`docs/CONCEPTS.md`](CONCEPTS.md) — the concept catalogue (actions, queries,
  collections).
- [`docs/API_AND_SDK.md`](API_AND_SDK.md) — the endpoint set and cross-concept
  wiring.
- [`docs/SDK_AUTOGEN.md`](SDK_AUTOGEN.md) — how the typed SDK contract is derived
  from these syncs.
