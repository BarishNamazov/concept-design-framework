# Code Review: Quality, Fidelity & Abstraction

A consolidated, evidence-based review of the concept-design forum backend. It has
three parts: a quality review (bugs, security, performance, and resource issues),
a concept-design **fidelity** audit, and a catalogue of **abstraction**
opportunities. Architecture reference: [ARCHITECTURE.md](ARCHITECTURE.md). Proposed
new concepts: [FUTURE_CONCEPTS.md](FUTURE_CONCEPTS.md).

## Contents

- [Code smells, bugs & issues](#code-smells-bugs--issues)
- [Concept-design fidelity audit](#concept-design-fidelity-audit)
- [Abstraction opportunities](#abstraction-opportunities)

---

## Code smells, bugs & issues

A rigorous, evidence-based review of the concept-design forum backend
(`src/engine`, `src/concepts`, `src/syncs`, `src/sdk`, `src/utils`, `src/main.ts`).

Every finding was verified against the source and, where relevant, against the
intended conventions in `design/background/*` and `docs/*`. Issues that are
**intentional per the design docs** (dynamic typing in the engine, error-as-result
dictionaries, `_`-prefixed queries returning arrays, IDs stored as branded
strings, concepts not importing one another) are **not** flagged as smells.
Line citations are orienting references; prefer the named symbol/file when code
movement changes exact line numbers.

Recent verification commands:
- `bun run typecheck` ✅
- `bun x tsc -p example-client` ✅
- `bun test src/engine/test/cases.basic.test.ts` ✅
- Mongo-backed tests require local listener support; this sandbox currently
  blocks `mongodb-memory-server` port probing.

---

### Executive summary

| # | Issue | Severity | File:line | Category |
|---|-------|----------|-----------|----------|
| S1 | NoSQL operator injection: raw JSON request fields flow unvalidated into `findOne()` filters | **Critical** | `RequestingConcept.ts:82`, `…:248`; e.g. `AuthenticatingConcept.ts:68` | Security / Validation |
| S2 | Passwords stored & compared in plaintext; no hashing | **High** | `AuthenticatingConcept.ts:52,69,93` | Security |
| S3 | Full request bodies (incl. passwords) persisted to `Requesting.requests` unconditionally | **High** | `RequestingConcept.ts:86-93` | Security |
| B1 | Silent 504 timeouts when a chained `where` query or a secondary `then` action yields nothing (no not-found/error sync) | **High** | `profiles.sync.ts:31`, `auth.sync.ts:139`, `threads.sync.ts:337,414` | Correctness / Error handling |
| R1 | Check-then-insert uniqueness with no unique index → race / duplicate rows | **High** | `AuthenticatingConcept.ts:48-53`, `Reacting…:56-63`, `Linking…:51-56`, `Conversing…:72-92`, `Tagging…:60-65`, `Tracking…:63-67` | Concurrency / Mongo |
| M1 | Unbounded in-memory action journal — never pruned (memory leak) | **High** | `engine/actions.ts:50-65` | Resources / Engine |
| R2 | No MongoDB indexes on any queried field | **Medium** | all `*Concept.ts` constructors | Mongo / Performance |
| P1 | `Tracking` loads *all* of a user's SeenMarks (every scope) and filters in memory | **Medium** | `TrackingConcept.ts:164-173,198-207,140-153` | Performance / N+1 |
| P2 | `_getAncestors` is a sequential `findOne` loop (N+1, O(depth) round-trips) | **Medium** | `ConversingConcept.ts:309-320` | Performance / N+1 |
| P3 | List queries are unbounded (no limit/pagination) | **Medium** | `ConversingConcept.ts:168`, `PostingConcept.ts:165`, `TaggingConcept.ts:215` | Performance / Mongo |
| L1 | Sessions never expire by default and are never swept; `expire` is dead | **Medium** | `SessioningConcept.ts:50-55,129-141`; `auth.sync.ts:94` | Resources / Correctness |
| E1 | `Requesting._awaitResponse` is a `_`-query but mutates state and **throws** | **Medium** | `RequestingConcept.ts:137-173` | Engine / Convention |
| B2 | `respond` overwrites/ignores the "no response yet" invariant; double-respond races | **Medium** | `RequestingConcept.ts:115-130` | Correctness |
| B3 | Register responds with `{ user }` even if profile creation fails; secondary-action errors swallowed | **Medium** | `auth.sync.ts:56-72` | Error handling |
| Q1 | Weak typing: `Record<string, any>` and many `as`-casts in server & syncs | **Low** | `RequestingConcept.ts:228`, `threads.sync.ts:236,291,318` | Typing |
| Q2 | Root thread creation does not derive links, while replies and edits do | **Low** | `threads.sync.ts` | Correctness |
| Q3 | CORS default `*` with `Authorization` allowed; left as a TODO | **Low** | `RequestingConcept.ts:22,183-187` | Security config |
| Q5 | Dead code: many concept actions/queries unused by any endpoint | **Low** | `AuthenticatingConcept.ts:107` (`changeUsername`), `SessioningConcept.ts:67` etc. | Dead code |
| Q6 | `console.log` per request instead of engine `Logging` | **Low** | `RequestingConcept.ts:69,266` | Logging |

---

### Critical

#### S1. NoSQL operator injection from unvalidated request bodies
**Where:** `src/concepts/Requesting/RequestingConcept.ts:82` (`request`) and
`:248-269` (`handleRequesting`), flowing into every concept query, e.g.
`AuthenticatingConcept.ts:68` `this.users.findOne({ username })`,
`:48`, `:114`; `Reacting…:56`; `Tagging…:60`, etc.

**Evidence:** the HTTP handler does
```ts
const body = await readJsonBody(req, undefined);      // arbitrary parsed JSON
const inputs = { ...(body as Record<string, unknown>), path: actionPath };
const { request } = await Requesting.request(inputs); // stored verbatim
```
A sync then binds those fields straight into action inputs, and concepts pass
them **directly** as Mongo filters: `this.users.findOne({ username })`. There is
no check that `username`/`password`/`target`/`tag`/… are primitives.

**Why it matters:** a client can send `{"username": {"$ne": null}}` (or
`{"$gt": ""}`, `{"$regex": "…"}`). For `register` the existence check
`findOne({ username: {$ne:null} })` matches an arbitrary user → registration is
blocked / user enumeration; `_getByUsername`, `_getTagByName`, reaction/link
existence checks are all manipulable. This is a classic MongoDB operator-injection
vector and a DoS / information-disclosure risk. (Full auth bypass is *not*
reachable here because `authenticate` compares `doc.password !== password` with a
string, which fails against an object — but the injection surface itself is real
and broad.)

**Fix (defense in depth):**
1. Validate/coerce inputs at the boundary. In `handleRequesting`, reject any body
   whose values aren't `string | number | boolean | null | array-of-those`:
   ```ts
   function isScalarRecord(o: Record<string, unknown>) {
     return Object.values(o).every(v =>
       v === null || ["string","number","boolean"].includes(typeof v) ||
       (Array.isArray(v) && v.every(x => typeof x === "string")));
   }
   if (typeof body !== "object" || body === null || !isScalarRecord(body))
     return json({ error: "Invalid request body." }, 400);
   ```
2. Belt-and-suspenders inside concepts: cast to `String(username)` before
   querying, or use a typed schema (e.g. a tiny validator) per endpoint.

**Tradeoff:** boundary validation is centralized and cheap but is generic;
per-concept coercion is more precise but repeated. Do both — boundary rejection
plus `String()` coercion on identity fields used in filters.

---

### High

#### S2. Plaintext password storage and comparison
**Where:** `AuthenticatingConcept.ts:52-53` (`insertOne({…password})`),
`:69` (`doc.password !== password`), `:90-95` (`changePassword`).

**Why it matters:** credentials are stored and compared in clear text. A DB leak
exposes every password; the comparison is also non-constant-time. The concept
**spec** models "password equals password" abstractly — it does *not* mandate
plaintext, so hashing is a pure implementation change that preserves the spec.

**Fix:** hash at `register`/`changePassword` and verify at `authenticate`:
```ts
// Bun ships native password hashing:
const hash = await Bun.password.hash(password);                  // register
const ok = await Bun.password.verify(password, doc.password);    // authenticate
```
No schema/spec change needed; `password` simply stores the hash. (If avoiding the
`Bun.*` global per the engine's "idiomatic Bun" note isn't a concern here, this is
the lowest-friction option; otherwise use `node:crypto` scrypt.)

#### S3. Request bodies (including passwords) are always persisted
**Where:** `RequestingConcept.ts:86-93` — `insertOne(requestDoc)` runs on **every**
request, before any sync. `REQUESTING_SAVE_RESPONSES` only gates the *response*
update (`:125-127`), not the request insert.

**Why it matters:** `/auth/login`, `/auth/register`, `/auth/changePassword`
bodies — i.e. plaintext passwords — are written to `Requesting.requests` and kept
indefinitely. Combined with S2 this is a serious credential-at-rest exposure, and
the collection grows unboundedly.

**Fix options:**
- Gate the request insert behind a flag too, and/or redact known-sensitive keys
  before persisting:
  ```ts
  const REDACT = new Set(["password", "oldPassword", "newPassword"]);
  const safeInput = Object.fromEntries(
    Object.entries(inputs).map(([k, v]) => [k, REDACT.has(k) ? "[redacted]" : v]));
  ```
- Add a TTL index on `createdAt` so the audit log self-expires.

#### B1. Silent 504 timeouts: missing not-found / error branches
**Where:** read endpoints and multi-step write flows that rely on chained
`.query` (inner-join/fan-out drops a frame on zero rows) **without** a guard sync:
- `profiles.sync.ts:31` `ProfileGetResponse` — only handler for `/profiles/get`.
- `auth.sync.ts:139` `MeResponse` — chains `_getUser → _getById → _getProfile`.
- `threads.sync.ts:337` `PostEditRequest` / `:414` `PostDeleteRequest` —
  `_getAuthor` returns `[]` for a nonexistent post.
- Secondary `then` actions: if `Conversing.start`/`reply`, `Tracking.register`,
  `Formatting.setSource` errors, the `…Response` sync (which joins on their output)
  never matches.

**Why it matters:** when a frame is dropped, **no** `Requesting.respond` ever
fires, so `_awaitResponse` hits the 10s timeout and returns HTTP 504 instead of a
clean `{ error }`. Examples that hang today: `GET`-style `/profiles/get` for a user
with no profile; `/auth/me` for a valid session whose user lacks a profile;
`/posts/edit` & `/posts/delete` for a nonexistent (but session-valid) post.
Only `/posts/get` has a `…NotFound` sync (`threads.sync.ts:326`).

**Why it's not by-design:** the engine reference
([ARCHITECTURE.md](ARCHITECTURE.md#the-synchronization-engine)) explicitly calls out the
`aggregate` pattern as the fix for "list endpoint silently fails to respond when
the query returns nothing" — the same hazard exists for *single-result* endpoints,
which are not guarded.

**Fix:** add the missing guard syncs, mirroring `PostGetNotFound`:
```ts
export const ProfileGetNotFound = getProfile.sync(({ request, user, exists }) => ({
  when: getProfile.actions(getProfile.request({ user }, { request })),
  where: async (f) => (await f.query(Profiling._getProfile, { user }, { exists }))
                       .length ? new Frames() : f,            // or query _exists
  then: getProfile.actions(getProfile.error({ request, error: "Profile not found." })),
}));
```
and equivalents for `/auth/me`, `/posts/edit`, `/posts/delete`. For secondary
actions, add `…Error` responders matching their `{ error }` output (as already done
for `Authenticating.register`). Consider a generic "unhandled request" sweeper that
responds with an error if no other sync answered within the flow.

#### R1. Check-then-insert uniqueness without a unique index (race / duplicates)
**Where:** every "exists?" guard followed by an insert:
- `AuthenticatingConcept.ts:48-53` (username), `:114-118` (changeUsername)
- `ReactingConcept.ts:56-63` (user,target,kind)
- `LinkingConcept.ts:51-56` (source,target)
- `ConversingConcept.ts:72-92` & `:112-118` (item placed once)
- `TaggingConcept.ts:60-65` (tag name)
- `TrackingConcept.ts:63-67` (item), `:106-110` (user,item)

**Why it matters:** `findOne()` then `insertOne()` is not atomic. Two concurrent
`register("alice")` (or two `react`/`link`/`reply`) both pass the check and both
insert, violating the documented invariants ("usernames are unique", "at most one
Reaction per (user,target,kind)", "each Item in at most one Node"). The async
engine fires syncs concurrently across flows, so this is reachable.

**Fix:** declare unique indexes and rely on duplicate-key errors:
```ts
constructor(db: Db) {
  this.users = db.collection(PREFIX + "users");
  this.users.createIndex({ username: 1 }, { unique: true }).catch(() => {});
}
async register({username, password}) {
  try {
    const user = freshID() as User;
    await this.users.insertOne({ _id: user, username, password });
    return { user };
  } catch (e) {
    if ((e as any).code === 11000) return { error: `Username "${username}" is already taken.` };
    throw e;
  }
}
```
**Tradeoff:** indexes must be created at startup (await once, e.g. an `init()`),
and the code shifts from "check" to "try/catch duplicate key" — but it's the only
correct, race-free approach in Mongo. For the multi-field invariants use compound
unique indexes (`{user:1,target:1,kind:1}`, `{source:1,target:1}`, `{item:1}`).

#### M1. Unbounded in-memory action journal (memory leak)
**Where:** `src/engine/actions.ts:50-65` — `ActionConcept.actions: Map` and
`flowIndex: Map` grow on every `invoke` and are **never** pruned.

**Why it matters:** every action ever executed (and every flow) is retained for
the lifetime of the process. A long-running server's memory grows without bound;
`matchWhen` also re-scans the whole flow partition each time. This is the engine's
core data structure, so the impact is global.

**Fix options:**
- Evict completed flows: once a flow's request has been responded to (or after a
  TTL), delete its entries from both maps.
- Cap journal size / use an LRU keyed by flow.
- Tradeoff: flow eviction must not race with in-flight matching; the safest hook is
  when `Requesting.respond` resolves a request (end of flow) — drop that flow's
  partition. Document that replay/audit then relies on the persisted
  `Requesting.requests`, not the in-memory journal.

---

### Medium

#### R2. No MongoDB indexes on queried fields
**Where:** all `*Concept.ts` constructors create collections but never call
`createIndex`. Queried-but-unindexed fields include `Posting.author`,
`Reacting.{target,user}`, `Conversing.{item,parent,conversation}`,
`Tracking.items.scope` & `seenMarks.{user,item}`, `Linking.{source,target}`,
`Tagging.targets.tags`, `Profiling.displayName`, `Sessioning.user`.

**Why it matters:** every lookup is a full collection scan; combined with P1-P3
this degrades super-linearly as data grows.

**Fix:** add the indexes alongside R1's unique indexes (single-field non-unique for
pure read paths). Centralize in an `ensureIndexes()` awaited at boot.

#### P1. `Tracking` reads all of a user's SeenMarks, then filters in memory
**Where:** `TrackingConcept.ts:164-173` (`_getUnread`), `:198-207` (`_getSeen`),
`:140-153` (`markAllSeen`) — each does `this.seenMarks.find({ user }).toArray()`
across **all scopes**, builds a `Set`, and filters.

**Why it matters:** unbounded in the number of items a user has ever seen, not the
scope being queried. As activity grows, an unread check for a small thread still
loads the user's entire seen history.

**Fix:** scope the query to the items in play:
```ts
const items = await this.items.find({ scope }).toArray();
const ids = items.map(i => i._id);
const seen = await this.seenMarks.find({ user, item: { $in: ids } }).toArray();
```
With an index on `seenMarks.{user,item}` this is bounded by the scope size.

#### P2. `_getAncestors` N+1 walk
**Where:** `ConversingConcept.ts:309-320` — a `while` loop issuing one `findOne`
per ancestor.

**Why it matters:** O(depth) sequential round-trips for a single query; deep
threads are slow and chatty.

**Fix:** use a single `$graphLookup` aggregation from `node` over
`parent → _id`, or denormalize an `ancestors: Node[]` array at `reply` time (depth
is already tracked). Tradeoff: `$graphLookup` keeps writes simple but needs an
index on `_id`/`parent`; denormalization speeds reads at the cost of write
complexity.

#### P3. Unbounded list endpoints
**Where:** `ConversingConcept._getConversations:168` (entire feed),
`PostingConcept._getByAuthor:165`, `TaggingConcept._getAllTags:215`,
`Reacting._getReactionsForTarget/ByUser`. The `/threads/list` sync fetches all
conversations then sorts in JS (`threads.sync.ts:552-580`).

**Why it matters:** no `limit`/pagination; the feed grows without bound and is
sorted application-side.

**Fix:** add `limit`/`skip` (or cursor) parameters and an index supporting
`sort({ createdAt: -1 })`; push the sort into Mongo (already done in
`_getConversations`, but then re-sorted in the sync — pick one).

#### L1. Sessions are immortal and never swept; `expire` is dead code
**Where:** `SessioningConcept.ts:50-55` (`start` sets no `expiresAt`),
`:129-141` (`expire`), `:192-194` (`isActive`). Login uses `Sessioning.start`
(`auth.sync.ts:94`), so **every** session is permanent. `startWithExpiry` and the
system `expire` action are never invoked by any sync; nothing deletes sessions
except explicit logout.

**Why it matters:** `Sessioning.sessions` grows forever; tokens never time out
(security); the entire `…InvalidSession` "expired" path is effectively unreachable
because `_isActive` is always true. The `expire` action and expiry branch are dead.

**Fix:** either log in via `startWithExpiry` with a TTL and add a sweeper (a TTL
index on `expiresAt`, or a periodic system action firing `expire`), or document
that sessions are intentionally non-expiring and remove the dead `expire`/expiry
code to avoid implying behavior that doesn't exist.

#### E1. `_awaitResponse` is a query but has side effects and throws
**Where:** `RequestingConcept.ts:137-173`.

**Why it matters:** the conventions (the [concepts reference](ARCHITECTURE.md#concepts-reference),
`implementing-concepts.md`) state queries are pure, never error, and return an array. `_awaitResponse` mutates
`this.pending` (`:171 delete`), creates timers, and **throws** when the request
isn't pending (`:145`). It also returns `Promise<{response}[]>` of length 1, so a
second await for the same request throws. This is a deliberate bootstrap shim, but
it's a leaky abstraction that breaks the query contract the rest of the system
relies on.

**Fix:** at minimum document it as a non-conforming system query; better, fall back
to the persisted response (`this.requests.findOne`) instead of throwing when the
in-memory pending entry is gone (the code's own `:143-144` comment already
anticipates this), and return `[]` rather than throwing for "unknown request".

#### B2. `respond` ignores the "no response yet" invariant
**Where:** `RequestingConcept.ts:115-130`. The doc comment says *requires a Request
… has no response yet*, but `respond` unconditionally resolves the pending promise
and overwrites `response`. If two syncs both produce a `respond` in one flow
(e.g. a success and an error branch both match due to a pattern bug), the first
wins the promise and the second silently overwrites the persisted doc.

**Why it matters:** masks sync-authoring bugs and makes double-responses
non-deterministic in what gets persisted.

**Fix:** guard idempotently — only resolve/persist if not already responded:
```ts
const pending = this.pending.get(request);
if (!pending) return { request };           // already answered or timed out
pending.resolve(response);
this.pending.delete(request);               // mark answered
```

#### B3. Register responds before/independent of profile creation; swallowed errors
**Where:** `auth.sync.ts:56-72`. `RegisterCreatesProfile` and `RegisterResponse`
both fire solely on `Authenticating.register` success. `RegisterResponse` returns
`{ user }` regardless of whether `Profiling.createProfile` succeeded, and there is
no error responder for a failed `createProfile`.

**Why it matters:** a partial failure (profile not created) is invisible to the
client, leaving a credential without a profile and a later `/auth/me` that hangs
(see B1). More generally, the "request → primary action → secondary actions"
pattern lacks error responders for the secondary actions across many endpoints
(`setSource`, `setLinks`, `register` unread, `Conversing.start/reply`).

**Fix:** sequence the response after the profile (`RegisterResponse` should join on
`Profiling.createProfile`'s `{ user }`), and add `…Error` responders for secondary
actions (mirroring `RegisterError`). Tradeoff: stricter sequencing means more
syncs; alternatively accept eventual consistency but at least respond with an error
when a required secondary step fails.

---

### Low

#### Q1. Weak typing
`startRequestingServer(concepts: Record<string, any>)` (`RequestingConcept.ts:228`)
and the `as any` in `app_testing.ts:75`. Syncs carry many `as`-casts
(`threads.sync.ts:236` `$[content] as string`, `:291` `as { post:{createdAt}}[]`,
`:318` `as object`, `:431` `as unknown[]`). These are partly inherent to the
dynamically-typed engine, but the server's `any` can be tightened to an interface
exposing `Requesting` and the typed concept surface.

#### Q2. Root thread creation does not derive links
`/threads/reply` and `/posts/edit` parse `[[<id>]]` references and call
`Linking.setLinks`, but `/threads/create` only creates the post, starts the
conversation, renders markdown, and registers unread state. Links in a root post
are therefore not indexed until the post is edited. Add a
`ThreadCreateDerivesLinks` sync mirroring the reply/edit syncs, or explicitly
document that only replies/edits derive links.

#### Q3. Permissive CORS default
`RequestingConcept.ts:22` defaults `REQUESTING_ALLOWED_DOMAIN` to `"*"` and `:183`
allows the `Authorization` header. There's a `TODO` to configure it; ship-time this
should be locked to known origins (and never `*` if cookies/credentials are added).

#### Q5. Dead code relative to the API
Several actions/queries are never wired to an endpoint: `Authenticating.changeUsername`
& `unregister` (`AuthenticatingConcept.ts:107,130`), `Sessioning.startWithExpiry`,
`endAllForUser`, `expire`, `_getSessionsForUser` (`SessioningConcept.ts:67-194`),
`Profiling.deleteProfile`/`_getByDisplayName` (`:139,193`), `Tagging.deleteTag`
(`:131`), `Reacting._getReactionsByUser`/`_countByKind`/`_hasReacted`. This is
acceptable for *reusable* concepts (and is consistent with the design intent), but
worth tracking so it isn't mistaken for required behavior — and so untested paths
(e.g. `expire`) aren't assumed to work.

#### Q6. Logging via `console.log`
`RequestingConcept.ts:69,266` and `:266` log to `console` on every request rather
than through the engine's `Logging` levels (`mod.ts`/`sync.ts`). In production this
is unconditional noise and can leak request paths; route it through the configurable
logger or guard by level.

---

### Notes on test quality

- **Good:** `FormattingConcept.test.ts:44-54` explicitly asserts XSS sanitization
  (`<script>`/`onerror` stripped), so the `marked` + `sanitize-html` pipeline
  (`FormattingConcept.ts:28-31`) is covered. The engine suite
  (`src/engine/test/*`) meaningfully exercises matching, flows, double-fire
  prevention, and `aggregate`. `endpoints.consistency.test.ts` is a strong
  structural + type-level contract check.
- **Gaps:**
  - No test covers the **race/uniqueness** invariants (R1) — they're asserted only
    under serial calls, which can't catch the missing-index race.
  - No test covers the **silent-timeout** paths (B1): `/profiles/get` /`/auth/me`
    with a missing profile, or edit/delete of a nonexistent post. A short-timeout
    test would surface them.
  - `Authenticating` tests don't assert anything about password handling (S2) —
    adding a "stored value is not the plaintext password" assertion would lock in a
    fix and prevent regressions.

### Suggested remediation order
1. **S1, S3, S2** (security: injection, credential-at-rest, hashing).
2. **B1** (stop silent 504s).
3. **R1 + R2** (correctness + indexes go together).
4. **M1, L1, P1-P3** (resource growth & performance).
5. **B2, B3, E1** then the **Low** cleanups.


---

## Concept-design fidelity audit

**Scope.** Current source under `src/engine`, `src/concepts`, `src/syncs`,
`src/sdk`, and the current methodology/reference docs under `design/background`
and `docs`.

**Headline.** The codebase still follows the core concept-design shape:
concepts are independent state machines, cross-concept behavior lives in syncs,
and the HTTP/SDK surface is expressed through explicit Requesting endpoints. The
remaining concerns are mostly boundary exceptions and enforcement gaps rather
than concept-design violations.

### Summary

| # | Finding | Severity | Location |
| --- | --- | --- | --- |
| M1 | `Requesting._awaitResponse` has query shape but waits, mutates pending state, and can throw. | Medium | `src/concepts/Requesting/RequestingConcept.ts` |
| M2 | `src/concepts/Requesting/api.ts` is sync/SDK glue living inside a concept folder and importing `@concepts`. | Medium | `src/concepts/Requesting/api.ts` |
| L1 | The engine relies on convention for concept-design invariants; it does not enforce query purity or concept import boundaries. | Low | `src/engine/*` |
| L2 | The Requesting module contains both the concept class and Bun HTTP server helper. | Low | `RequestingConcept.ts` |
| L3 | Some endpoint sync sets are not total over all reachable states, so a dropped frame can become a 504 timeout. | Low | `src/syncs/*.sync.ts` |
| L4 | `Sessioning.expire` is implemented but no scheduler or sync drives it. | Low | `SessioningConcept.ts` |
| L5 | Root thread creation does not derive links, while replies and edits do. | Low | `threads.sync.ts` |

### What Holds Well

- **Concept independence:** concept classes import MongoDB, utilities, and local
  rendering libraries, but not sibling concepts.
- **Polymorphic IDs:** concepts compare opaque branded IDs; they do not inspect
  IDs created by other concepts.
- **Composition through syncs:** threading, rendering, unread registration,
  authorization, link derivation, and cascades are sync behavior.
- **Reusable concepts:** several concept actions are not exposed as endpoints,
  but they are coherent reusable surface, not dead domain coupling.
- **Typed API surface:** `requestingEndpoint(...)` keeps runtime sync patterns
  and `ForumApi` type inference together.

### Detailed Findings

#### M1. `_awaitResponse` Is A Non-Standard Query

Queries normally return arrays, do not mutate state, and do not throw for normal
misses. `_awaitResponse` is the bootstrap exception: it waits on an in-memory
promise, deletes the pending request when done, and maps timeouts into HTTP
errors through the server helper.

This is acceptable as framework glue, but should remain documented as an
exception so authors do not copy it for ordinary concepts. A cleaner split would
move the waiting primitive into the server helper and leave only a pure
`_getResponse` query on the concept.

#### M2. The Endpoint Builder Is In A Concept Folder

`src/concepts/Requesting/api.ts` provides `requestingEndpoint`, `defineApi`, and
contract inference. It is not a concept, and it is used by every sync file. Its
location makes `src/concepts/Requesting/` contain both concept code and
sync/SDK glue.

The pragmatic path is to document this as Requesting infrastructure. The cleaner
path is to move the generic builder to a neutral sync/API module and have syncs
import it from there.

#### L1. Invariants Are Mostly Conventional

The engine assumes:

- `_` methods are pure queries;
- concepts do not import each other;
- action success outputs are non-empty when `{ error }` is also possible;
- `when` clauses provide output patterns.

These are documented conventions, not compile-time checks. A small structural
test or lint step could catch the highest-risk violations: concept-to-concept
imports and malformed `when` clauses.

#### L2. Requesting Mixes Concept And Transport In One Module

`RequestingConcept.ts` contains the concept class plus `startRequestingServer`
with routing, CORS, JSON parsing, and status mapping. The class itself remains
focused, but a separate `server.ts` would make the module boundary cleaner.

#### L3. Some Requests Can Still Time Out Instead Of Erroring

`Frames.query(...)` has inner-join semantics: zero rows drop the frame. That is
correct engine behavior, but endpoint sync sets must be total. List endpoints use
`aggregate(...)` to preserve an empty-list response; single-result endpoints and
multi-step secondary actions need explicit not-found/error responders.

Known shapes to keep checking: `/auth/me` if a valid session has no profile,
post edit/delete for nonexistent posts, and required secondary actions such as
formatting or unread registration.

#### L4. `Sessioning.expire` Has No Driver

`Sessioning.expire` exists as a system cleanup action, but no scheduler invokes
it. Expiry is currently lazy: queries report expired sessions inactive, but
expired documents are not swept. Either add a timer/TTL-index model or document
sessions as lazy-expiring.

#### L5. Link Derivation Is Incomplete For Root Posts

Reply and edit flows parse `[[<id>]]` references and update `Linking`. Thread
creation does not. If root-post backlinks matter before first edit, add a
`ThreadCreateDerivesLinks` sync.

### Verification Notes

- Concept member coverage is summarized in the [concepts reference](ARCHITECTURE.md#concepts-reference).
- Endpoint and SDK coverage is summarized in the [HTTP API](ARCHITECTURE.md#http-api-and-endpoint-set).
- Risk-level engineering issues are tracked in [Code smells, bugs & issues](#code-smells-bugs--issues) above.


---

## Abstraction opportunities

A code-elegance review of the forum backend, focused on **better abstractions**
that make the code DRYer, clearer, and more aligned with concept-design ideals —
**without violating concept independence**.

Guiding rule used throughout: shared *infrastructure* (Mongo glue, id minting,
request/response combinators) is fine to factor out; shared *domain logic*
between concepts is not. Cross-concept wiring belongs in **synchronizations**,
never inside a concept, and never in a single concept's helper module.

All findings were verified against the current source (file:line citations
below). Counts were gathered with `grep` over `src/`.

---

### Executive summary

| # | Opportunity | Impact | Effort | Coupling risk |
|---|-------------|--------|--------|---------------|
| 1 | Session-auth sync combinators (guard / resolve-user / error echo / respond) | **High** | Medium | Low* |
| 2 | "Read endpoint" list/aggregate `where` helper | Medium | Low | None |
| 3 | Mongo wiring + doc→row helpers for concepts (`collection`, `oneOrNone`, `existsRow`) | Medium | Low–Med | Low |
| 4 | Generic `freshID<T>()` to remove `as Post`/`as Tag` casts | Low–Med | Low | None |
| 5 | Stronger frame typing to cut `$[x] as T` casts in `where` clauses | Medium | High | None |
| 6 | De-duplicate shared types (`ApiError`, `ContractShape`, `Empty`, `Prettify`) | Low | Low | Low |
| 7 | Factor the duplicated "derive `[[links]]`" sync logic | Low | Low | None |
| 8 | Naming: `Authenticating._getById` → `_getUsername` | Low | Low | None |
| 9 | Reduce `as unknown as` erasure inside `api.ts` builder | Low | Med | None |

\* "Low" because these helpers live in the **sync layer**, whose job *is* to
reference multiple concepts. The one real risk — putting a `Sessioning`-aware
helper inside the `Requesting` concept folder — is called out explicitly in §1.

Ordered below by impact-to-effort ratio.

---

### 1. Session-authorization sync combinators (biggest win)

#### Current code

The synchronization layer already has a nice per-endpoint builder
(`requestingEndpoint`, `src/concepts/Requesting/api.ts:158`). But four
session-auth shapes are hand-written, almost verbatim, across every protected
endpoint.

**1a. The "invalid session" guard — 18 near-identical syncs.**
Every authenticated endpoint repeats this block (verified: 18 `*InvalidSession`
syncs across `auth`, `profiles`, `reactions`, `tags`, `threads`, `unread`;
the literal `"Invalid or expired session."` appears 23×):

```ts
// src/syncs/tags.sync.ts:57-68 (identical shape in 17 other places)
export const TagCreateInvalidSession = create.sync(({ request, session, active }) => ({
  when: create.actions(create.request({ session }, { request })),
  where: async (frames) => {
    frames = await frames.query(Sessioning._isActive, { session }, { active });
    return frames.filter(($) => $[active] === false);
  },
  then: create.actions(
    create.error({ request, error: "Invalid or expired session." }),
  ),
}));
```

Other instances: `src/syncs/profiles.sync.ts:63,95,127`,
`src/syncs/reactions.sync.ts:55,95`, `src/syncs/unread.sync.ts:44,76,116,152`,
`src/syncs/threads.sync.ts:162,399,537`,
`src/syncs/auth.sync.ts:151,196`, `src/syncs/tags.sync.ts:57,97,133`.

**1b. The "resolve session → user" `where` — 21 occurrences.**
Every protected *write* endpoint opens with the same resolution step
(`grep "Sessioning._getUser" src/syncs` → 21):

```ts
// src/syncs/reactions.sync.ts:30-37
export const ReactionAddRequest = add.sync(({ request, session, target, kind, user }) => ({
  when: add.actions(add.request({ session, target, kind }, { request })),
  where: async (frames) =>
    await frames.query(Sessioning._getUser, { session }, { user }),
  then: add.actions([Reacting.react, { user, target, kind }]),
}));
```

**1c. The "error echo" sync — 10 occurrences.**
When the domain action returns `{ error }`, echo it to the request
(`grep "Error = .*\.sync"` → 10):

```ts
// src/syncs/tags.sync.ts:49-55
export const TagCreateError = create.sync(({ request, error }) => ({
  when: create.actions(
    create.request({}, { request }),
    [Tagging.createTag, {}, { error }],
  ),
  then: create.actions(create.error({ request, error })),
}));
```

**1d. The "success respond" sync** appears once per action endpoint with the
same single-field echo shape (e.g. `src/syncs/tags.sync.ts:41`,
`profiles.sync.ts:53`, `unread.sync.ts:100`).

#### Proposed abstraction

Extend the endpoint builder with declarative combinators so an endpoint
*declares* its auth/echo behavior instead of restating the frames mechanics.
Sketch:

```ts
// session-aware sync helpers — see "where this lives" below
const create = authedEndpoint("/tags/create");

// 1a + 1b + 1c + 1d collapse to:
export const tagCreate = create.define({
  // resolves session→user, fires the action; auto-emits the InvalidSession guard
  request: create.authed({ name }, ({ name }) => [Tagging.createTag, { name }]),
  ok:      create.ok<TagCreateOutput>([Tagging.createTag], { tag: "tag" }),
  error:   create.errorFrom(Tagging.createTag),
});
```

Minimal, lower-magic alternative (keeps every sync explicit but removes the
boilerproof parts) — just three helpers returning whole syncs:

```ts
create.guardSession()                       // the entire 1a block
create.resolveUser({ name }, mkAction)      // request + _getUser where + then (1b)
create.errorFrom(Tagging.createTag)         // the entire 1c block
```

Each helper is a thin factory over the existing `.sync`/`.actions`/`.request`/
`.error` primitives — no engine change required.

#### Win

- Removes ~18 guard blocks (~180 lines) and ~10 error blocks (~70 lines), plus
  collapses the repeated `_getUser` `where`. The remaining code reads as the
  *operational principle* ("this endpoint is authed; on success respond X; on
  error echo it") rather than frame plumbing.
- One place to fix the auth contract (e.g. distinguishing "expired" from
  "never existed", or adding rate-limit checks) instead of 18.
- Consistency is currently enforced only by a test
  (`src/syncs/endpoints.consistency.test.ts`); a combinator makes the right
  thing the *easy* thing.

#### Risk & where this lives (important)

`src/concepts/Requesting/api.ts` currently imports **only** `Requesting`
(`api.ts:4`) — it is concept-pure. Session guards depend on `Sessioning`, so
putting them in `api.ts` would couple the `Requesting` concept folder to
`Sessioning` and break independence.

➡ Put session-aware combinators in a **new sync-layer module**, e.g.
`src/syncs/_lib/authed.ts`, that imports `Sessioning` and re-exports an
`authedEndpoint` wrapping `requestingEndpoint`. Concept independence is
preserved because this is app composition (syncs), exactly where cross-concept
references are allowed. Keep the generic, `Sessioning`-free combinators (`ok`,
`errorFrom`) in `api.ts`; keep only the `Sessioning`-aware ones (`guardSession`,
`resolveUser`) in the sync lib.

#### Migration effort

Medium. Helpers are ~40 lines; conversion is mechanical and per-endpoint, and
the existing consistency + integration tests (`src/syncs/app.test.ts`,
`endpoints.consistency.test.ts`) cover the behavior, so refactors are safe to
verify incrementally.

---

### 2. "Read endpoint" list/aggregate `where` helper

#### Current code

List endpoints all follow the identical "capture base frame → fan out via
queries → `aggregate` back into one row" shape (the `const [base] = frames`
idiom appears 9×):

```ts
// src/syncs/links.sync.ts:26-38
export const LinkBacklinksResponse = backlinks.sync(({ request, target, source, sources }) => ({
  when: backlinks.actions(backlinks.request({ target }, { request })),
  where: async (frames) => {
    const [base] = frames;
    frames = await frames.query(Linking._getBacklinks, { target }, { source });
    return frames.aggregate(base, [source], sources);
  },
  then: backlinks.actions(backlinks.respond<BacklinksOutput>({ request, sources })),
}));
```

Same skeleton: `tags.sync.ts:148,164`, `reactions.sync.ts:110`,
`unread.sync.ts:31`, `threads.sync.ts:267,552,582`, `links.sync.ts:42`.
`aggregate` (`frames.ts`) already exists precisely to make this safe against the
"zero matches -> no response" trap documented in [ENGINE.md](ARCHITECTURE.md#the-synchronization-engine), but
every caller still wires `base`, `collect`, and `as` by hand.

#### Proposed abstraction

A `where`-builder that encodes "capture base, run these queries, aggregate":

```ts
// returns a ready-to-use async where-clause
where: listWhere((q, { target, source }) =>
  q(Linking._getBacklinks, { target }, { source }))
  .collect([source]).as(sources),
```

or, simplest, a single helper that captures `base` for you:

```ts
where: collectList(
  (frames) => frames.query(Linking._getBacklinks, { target }, { source }),
  [source], sources,
),
```

This is pure `Frames`/engine infrastructure — it can live in `api.ts` or
`@engine`, references no concept, and removes the easy-to-forget `const [base]`
line that, if omitted, silently breaks the endpoint (per the memory file).

#### Win / risk / effort

Removes a sharp edge (forgetting `base`/`aggregate`) and ~3 lines per read
endpoint. **No coupling risk** (operates only on `Frames`). Low effort.

---

### 3. Mongo wiring + doc→row helpers for concepts

#### Current code

Every concept repeats the same MongoDB ceremony. Verified: `PREFIX = "X" + "."`
in all 11 concepts, plus constructor collection wiring, plus two pervasive
read-mapping shapes.

**3a. Collection wiring** (11×):

```ts
// src/concepts/Reacting/ReactingConcept.ts:6,41-43
const PREFIX = "Reacting" + ".";
// ...
constructor(private readonly db: Db) {
  this.reactions = this.db.collection(PREFIX + "reactions");
}
```

**3b. "zero-or-one row" mapping** — `findOne` then `doc === null ? [] : [{…}]`
appears 15× (`grep "=== null ? \[\]"`), e.g. `PostingConcept.ts:154`,
`ProfilingConcept.ts:163,183`, `AuthenticatingConcept.ts:151,165`,
`SessioningConcept.ts`, `FormattingConcept.ts:98,112,129`,
`ConversingConcept.ts:201,215,229,243`.

**3c. "existence flag" query** — `findOne` then `[{ flag: doc !== null }]`
appears 6× with different field names: `_exists`
(`PostingConcept.ts:198`), `_existsByUsername` (`AuthenticatingConcept.ts:180`),
`_hasReacted` (`ReactingConcept.ts:172`), `_hasLink` (`LinkingConcept.ts:177`),
`_isSeen` (`TrackingConcept.ts:221`), `_isActive` (`SessioningConcept.ts:189`).

#### Proposed abstraction

A `@utils/mongo.ts` of **pure infrastructure** helpers (sibling to the existing
shared `@utils/database.ts`):

```ts
// collection wiring
export function collections<T extends string>(db: Db, concept: string, names: readonly T[])
  : Record<T, Collection<any>> { /* prefixes with `${concept}.` */ }

// row mapping
export const oneOrNone = <T, R>(doc: T | null, map: (d: T) => R): R[] =>
  doc === null ? [] : [map(doc)];
export const existsRow = <K extends string>(doc: unknown, key: K) =>
  [{ [key]: doc !== null }] as Record<K, boolean>[];
```

Usage:

```ts
async _exists({ post }: { post: Post }) {
  return existsRow(await this.posts.findOne({ _id: post }), "exists");
}
async _getAuthor({ post }: { post: Post }) {
  return oneOrNone(await this.posts.findOne({ _id: post }), (d) => ({ author: d.author }));
}
```

#### Win

Removes repetitive null-handling and the `"X" + "."` prefix idiom; makes the
*interesting* part of each query (the projection) the only thing on screen.

#### Risk

Low but worth stating: these helpers are **infrastructure**, identical in spirit
to the already-shared `freshID`/`getDb`. They contain **no domain logic** and do
not let one concept reach into another, so independence is preserved. The mild
downside is that a reader must know one more util to read a concept; mitigate by
keeping the helpers tiny and obvious. Do **not** let this slide into shared
domain helpers (e.g. a shared "find-or-error" that encodes a specific error
message contract) — keep messages in the concept.

#### Effort

Low–Medium; per-concept, mechanical, fully covered by existing `*Concept.test.ts`.

---

### 4. Generic `freshID<T>()` to remove id casts

#### Current code

`freshID(): ID` (`src/utils/database.ts:65`) returns the base brand, so every
caller re-casts: `const post = freshID() as Post;` — 15× across concepts
(`PostingConcept.ts:52`, `ReactingConcept.ts:62`, `LinkingConcept.ts:55,112`,
`ConversingConcept.ts:77-78,116`, `TaggingConcept.ts:64`,
`AuthenticatingConcept.ts:52`, `SessioningConcept.ts:53,73`, …).

#### Proposed abstraction

```ts
export function freshID<T extends ID = ID>(): T {
  return uuidv7() as T;
}
```

Then `const post = freshID<Post>();` — the intent ("mint a Post id") is explicit
and the lossy `as` disappears.

#### Win / risk / effort

Removes 15 casts, improves readability, zero behavior change, **no coupling**.
Trivial effort. (`Post`/`Tag`/etc. are local `type X = ID` aliases, so this is
purely ergonomic, but it reads better and prevents accidental cross-type casts.)

---

### 5. Stronger frame typing to cut `$[x] as T` casts in `where`

#### Current code

`Frame` is `Record<symbol, unknown>` (`src/engine/types.ts:19`), so reading a
binding is untyped and callers cast. 7 such casts in `where` clauses, e.g.:

```ts
// src/syncs/threads.sync.ts:236
[targets]: parseLinkTargets($[content] as string),
// src/syncs/threads.sync.ts:291
($[thread] as { post: { createdAt: Date } }[]).slice().sort(...)
// src/syncs/threads.sync.ts:318
[result]: { ...($[postData] as object), rendered: $[rendered] },
```

`.query` already infers *new* frame keys precisely
(`ExtractSymbolMappings`, `frames.ts:27`), but variables are plain `symbol`s, so
the value type is lost on read.

#### Proposed abstraction (options)

- **Option A — branded variable symbols.** Give `$vars` a typed-symbol brand
  (`TVar<T>`) so `frames.map(($) => $[content])` infers `string`. High type
  sophistication, large change to `vars.ts`/`frames.ts`, and fights TS's
  inability to key objects by typed symbols. High effort, uncertain payoff.
- **Option B — typed read helpers.** A small `read($, content): string` /
  `readList($, thread): T[]` accessor that centralizes the cast in one audited
  place instead of scattering `as` at call sites. Low effort, modest payoff.

#### Win / risk / effort

Better safety in the one place the system is currently `any`-ish. **No coupling
risk.** Recommend Option B now (cheap), treat Option A as a research spike — it
touches engine internals and may not be worth the type gymnastics.

---

### 6. De-duplicate shared types

#### Current code

- `ApiError` and `ContractShape` are defined **twice**, identically, in
  `src/concepts/Requesting/api.ts:10,13` and `src/sdk/client.ts:36,43`.
- `Empty` is defined twice: `src/engine/types.ts:81` and
  `src/utils/types.ts:12` (both `Record<PropertyKey, never>`).
- `Prettify` lives in `api.ts:15` and is imported into sync files
  (`auth.sync.ts:21`, `threads.sync.ts:33`).

#### Proposed abstraction / tradeoff

These are 1-liners, so DRY value is small — but the *intent* matters:

- The SDK (`src/sdk/client.ts`) is **deliberately app-agnostic and standalone**
  (see its module doc, lines 1–33). Sharing `ApiError`/`ContractShape` from the
  backend would couple the SDK to backend internals — arguably *worse* than the
  duplication. **Recommendation: keep the SDK copies; add a one-line comment**
  noting the intentional, structural duplication so future readers don't "fix"
  it by coupling them.
- `Empty` duplication is pure accident and safe to unify: have
  `@utils/types.ts` re-export the engine's, or vice-versa.

#### Win / risk / effort

Mostly a clarity/intent fix. Low everything.

---

### 7. Factor the duplicated "derive `[[links]]`" sync

#### Current code

`parseLinkTargets` (`src/syncs/threads.sync.ts:94`) is used by two syncs whose
`where`/`then` are identical except for the triggering action
(`ThreadReplyDerivesLinks:226` and `PostEditDerivesLinks:362`):

```ts
where: async (frames) =>
  frames.map(($) => ({ ...$, [targets]: parseLinkTargets($[content] as string) })),
then: ...actions([Linking.setLinks, { source: post, targets }]),
```

#### Proposed abstraction

A small local factory in the same file:

```ts
const derivesLinks = (ep, trigger) => ep.sync(({ request, content, post, targets }) => ({
  when: ep.actions(ep.request({ content }, { request }), [trigger, {}, { post }]),
  where: async (frames) =>
    frames.map(($) => ({ ...$, [targets]: parseLinkTargets($[content] as string) })),
  then: ep.actions([Linking.setLinks, { source: post, targets }]),
}));
```

#### Win / risk / effort

Removes one duplicated sync body; keeps the markdown-link convention in exactly
one place. **No coupling risk** (already within the sync layer). Trivial effort.
Lower priority — only 2 instances.

---

### 8. Naming: `Authenticating._getById` → `_getUsername`

`Authenticating._getById({ user })` returns `{ username }`, not the user
(`src/concepts/Authenticating/AuthenticatingConcept.ts:147`). The name describes
the *input*, not the *output*, and obscures intent at call sites
(`src/syncs/auth.sync.ts:145`, where it produces `username`). Rename to
`_getUsername` to match siblings like `Profiling._getDisplayName`. Trivial,
purely local to the concept + its few sync references.

---

### 9. Reduce `as unknown as` erasure inside the `api.ts` builder

The `requestingEndpoint` builder implements its precisely-typed surface with
five `as unknown as` / `as` escapes (`api.ts:167,171,176,189,193`). This is a
deliberate type-erasure boundary (runtime returns plain `ActionList`s while the
public types carry phantom `RequestInputMeta`/`ResponseOutputMeta`). It works
and is well-contained, but each cast is a place where a typo wouldn't be caught.

**Option:** introduce internal typed constructors (`makeRequestList`,
`makeRespondList`) that build the branded tuples once, so the erasure lives in
two audited helpers rather than being sprinkled through the builder. Medium
effort, no behavior change, **no coupling**. Low priority — this is hardening,
not a correctness or duplication problem.

---

### What was checked and deliberately *not* recommended

- **A shared CRUD base class for concepts.** Tempting given the create/edit/
  delete symmetry, but a base class would invite shared *domain* behavior and
  erode the "each concept is independently understandable" property. The §3
  helpers (pure Mongo/mapping infra) capture the real duplication without that
  risk. Recommend **against** a base class.
- **Centralizing error *messages*.** Each concept owns its `{ error }` strings
  (e.g. `"Username \"x\" is already taken."`); these are part of the concept's
  contract and should stay local, not move into a shared util.
- **Cross-concept query helpers** (e.g. a generic "resolve session then author")
  inside a concept — would couple concepts. The §1 combinators keep this in the
  sync layer where it belongs.

---

### Suggested sequencing

1. **§1** (session-auth combinators) — by far the largest readability/DRY win;
   do it first, in a new `src/syncs/_lib/`.
2. **§2** (`collectList` read helper) and **§4** (`freshID<T>()`) — quick,
   safe, high-clarity.
3. **§3** (Mongo/mapping infra) — mechanical, well-tested; do per concept.
4. **§6/§7/§8** — small clarity fixes.
5. **§5 (Option B)** and **§9** — optional hardening.

Every change above is covered by the existing test suites
(`src/concepts/**/**.test.ts`, `src/syncs/app.test.ts`,
`src/syncs/endpoints.consistency.test.ts`, `src/sdk/client.test.ts`); run
`bun test` and `bun run typecheck` after each step.
