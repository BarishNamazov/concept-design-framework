# Code Quality Review — Code Smells, Bugs & Issues

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
- `bun run build` ✅ (regenerates the `@concepts` barrel)
- `bun run typecheck` ✅
- `bun x tsc -p example-client` ✅
- `bun test src/engine/test/cases.basic.test.ts` ✅
- Mongo-backed tests require local listener support; this sandbox currently
  blocks `mongodb-memory-server` port probing.

---

## Executive summary

| # | Issue | Severity | File:line | Category |
|---|-------|----------|-----------|----------|
| S1 | NoSQL operator injection: raw JSON request fields flow unvalidated into `findOne()` filters | **Critical** | `RequestingConcept.ts:82`, `…:248`; e.g. `AuthenticatingConcept.ts:68` | Security / Validation |
| S2 | Passwords stored & compared in plaintext; no hashing | **High** | `AuthenticatingConcept.ts:52,69,93` | Security |
| S3 | Full request bodies (incl. passwords) persisted to `Requesting.requests` unconditionally | **High** | `RequestingConcept.ts:86-93` | Security |
| C1 | Integration tests are still order-sensitive around the generated concept singleton and Mongo teardown | **Medium** | `app_testing.ts`; generated `concepts.ts` | Test infra / Resources |
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

## Critical

### S1. NoSQL operator injection from unvalidated request bodies
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

## High

### S2. Plaintext password storage and comparison
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

### S3. Request bodies (including passwords) are always persisted
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

### C1. Integration test singleton teardown is order-sensitive
**Where:** `src/utils/app_testing.ts:48-96` (the process-wide `shared` singleton and
its `stop()` which calls `client.close()`), interacting with the generated
`src/concepts/concepts.ts` (top-level `await getDb()` creates the client **once**
per process).

**Evidence:** `setupApp()` intentionally shares the generated `@concepts` module
singleton across integration tests. If one suite closes that singleton's Mongo
client and another suite later imports the cached barrel, the second suite can
reuse a closed client:
```
$ bun test src/syncs/app.test.ts src/sdk/client.test.ts
… MongoNotConnectedError: Client must be connected before running operations
(fail) auth flows > register -> login -> me
```
`app.test.ts`'s `afterAll` calls `app.stop()` → `client.close()` and resets
`shared = undefined`. But the `@concepts` barrel creates `db`/`client` exactly once
at module load (top-level await), so the next suite's `setupApp()` re-`boot()`s,
re-imports the **cached** barrel, and reuses the now-**closed** client.

**Why it matters:** `package.json` documents `bun test`; order-dependent teardown
can make full-suite runs look flaky even though the endpoint logic is
deterministic. In this sandbox, Mongo-backed tests also fail before assertions
because local port probing is blocked.

**Fix options:**
- Make the suites truly share one lifecycle: have a single owner stop the client,
  or never `client.close()` between suites (let process exit reclaim it). E.g. drop
  `await client.close()` from `stop()` and only `server.stop()`.
- Or stop reusing the barrel singleton in tests: instantiate concepts against a
  per-suite `setupTestDb()` DB (as the concept unit tests already do) instead of
  importing `@concepts`.
- Tradeoff: the first is a one-line change but leaves the Mongo client open until
  process exit (fine for tests); the second is more isolated but duplicates the
  app-wiring done by the barrel.

### B1. Silent 504 timeouts: missing not-found / error branches
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

**Why it's not by-design:** `docs/ENGINE.md` explicitly calls out the
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

### R1. Check-then-insert uniqueness without a unique index (race / duplicates)
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

### M1. Unbounded in-memory action journal (memory leak)
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

## Medium

### R2. No MongoDB indexes on queried fields
**Where:** all `*Concept.ts` constructors create collections but never call
`createIndex`. Queried-but-unindexed fields include `Posting.author`,
`Reacting.{target,user}`, `Conversing.{item,parent,conversation}`,
`Tracking.items.scope` & `seenMarks.{user,item}`, `Linking.{source,target}`,
`Tagging.targets.tags`, `Profiling.displayName`, `Sessioning.user`.

**Why it matters:** every lookup is a full collection scan; combined with P1-P3
this degrades super-linearly as data grows.

**Fix:** add the indexes alongside R1's unique indexes (single-field non-unique for
pure read paths). Centralize in an `ensureIndexes()` awaited at boot.

### P1. `Tracking` reads all of a user's SeenMarks, then filters in memory
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

### P2. `_getAncestors` N+1 walk
**Where:** `ConversingConcept.ts:309-320` — a `while` loop issuing one `findOne`
per ancestor.

**Why it matters:** O(depth) sequential round-trips for a single query; deep
threads are slow and chatty.

**Fix:** use a single `$graphLookup` aggregation from `node` over
`parent → _id`, or denormalize an `ancestors: Node[]` array at `reply` time (depth
is already tracked). Tradeoff: `$graphLookup` keeps writes simple but needs an
index on `_id`/`parent`; denormalization speeds reads at the cost of write
complexity.

### P3. Unbounded list endpoints
**Where:** `ConversingConcept._getConversations:168` (entire feed),
`PostingConcept._getByAuthor:165`, `TaggingConcept._getAllTags:215`,
`Reacting._getReactionsForTarget/ByUser`. The `/threads/list` sync fetches all
conversations then sorts in JS (`threads.sync.ts:552-580`).

**Why it matters:** no `limit`/pagination; the feed grows without bound and is
sorted application-side.

**Fix:** add `limit`/`skip` (or cursor) parameters and an index supporting
`sort({ createdAt: -1 })`; push the sort into Mongo (already done in
`_getConversations`, but then re-sorted in the sync — pick one).

### L1. Sessions are immortal and never swept; `expire` is dead code
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

### E1. `_awaitResponse` is a query but has side effects and throws
**Where:** `RequestingConcept.ts:137-173`.

**Why it matters:** the conventions (`docs/CONCEPTS.md`, `implementing-concepts.md`)
state queries are pure, never error, and return an array. `_awaitResponse` mutates
`this.pending` (`:171 delete`), creates timers, and **throws** when the request
isn't pending (`:145`). It also returns `Promise<{response}[]>` of length 1, so a
second await for the same request throws. This is a deliberate bootstrap shim, but
it's a leaky abstraction that breaks the query contract the rest of the system
relies on.

**Fix:** at minimum document it as a non-conforming system query; better, fall back
to the persisted response (`this.requests.findOne`) instead of throwing when the
in-memory pending entry is gone (the code's own `:143-144` comment already
anticipates this), and return `[]` rather than throwing for "unknown request".

### B2. `respond` ignores the "no response yet" invariant
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

### B3. Register responds before/independent of profile creation; swallowed errors
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

## Low

### Q1. Weak typing
`startRequestingServer(concepts: Record<string, any>)` (`RequestingConcept.ts:228`)
and the `as any` in `app_testing.ts:75`. Syncs carry many `as`-casts
(`threads.sync.ts:236` `$[content] as string`, `:291` `as { post:{createdAt}}[]`,
`:318` `as object`, `:431` `as unknown[]`). These are partly inherent to the
dynamically-typed engine, but the server's `any` can be tightened to an interface
exposing `Requesting` and the typed concept surface.

### Q2. Root thread creation does not derive links
`/threads/reply` and `/posts/edit` parse `[[<id>]]` references and call
`Linking.setLinks`, but `/threads/create` only creates the post, starts the
conversation, renders markdown, and registers unread state. Links in a root post
are therefore not indexed until the post is edited. Add a
`ThreadCreateDerivesLinks` sync mirroring the reply/edit syncs, or explicitly
document that only replies/edits derive links.

### Q3. Permissive CORS default
`RequestingConcept.ts:22` defaults `REQUESTING_ALLOWED_DOMAIN` to `"*"` and `:183`
allows the `Authorization` header. There's a `TODO` to configure it; ship-time this
should be locked to known origins (and never `*` if cookies/credentials are added).

### Q5. Dead code relative to the API
Several actions/queries are never wired to an endpoint: `Authenticating.changeUsername`
& `unregister` (`AuthenticatingConcept.ts:107,130`), `Sessioning.startWithExpiry`,
`endAllForUser`, `expire`, `_getSessionsForUser` (`SessioningConcept.ts:67-194`),
`Profiling.deleteProfile`/`_getByDisplayName` (`:139,193`), `Tagging.deleteTag`
(`:131`), `Reacting._getReactionsByUser`/`_countByKind`/`_hasReacted`. This is
acceptable for *reusable* concepts (and is consistent with the design intent), but
worth tracking so it isn't mistaken for required behavior — and so untested paths
(e.g. `expire`) aren't assumed to work.

### Q6. Logging via `console.log`
`RequestingConcept.ts:69,266` and `:266` log to `console` on every request rather
than through the engine's `Logging` levels (`mod.ts`/`sync.ts`). In production this
is unconditional noise and can leak request paths; route it through the configurable
logger or guard by level.

---

## Notes on test quality

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
  - The integration suites are **not isolated** from each other (C1); `bun test`
    as documented does not pass clean.
  - `Authenticating` tests don't assert anything about password handling (S2) —
    adding a "stored value is not the plaintext password" assertion would lock in a
    fix and prevent regressions.

## Suggested remediation order
1. **S1, S3, S2** (security: injection, credential-at-rest, hashing).
2. **C1, B1** (make `bun test` pass; stop silent 504s).
3. **R1 + R2** (correctness + indexes go together).
4. **M1, L1, P1-P3** (resource growth & performance).
5. **B2, B3, E1** then the **Low** cleanups.
