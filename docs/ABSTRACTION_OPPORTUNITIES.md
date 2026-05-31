# Abstraction Opportunities

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

## Executive summary

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

## 1. Session-authorization sync combinators (biggest win)

### Current code

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

### Proposed abstraction

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

### Win

- Removes ~18 guard blocks (~180 lines) and ~10 error blocks (~70 lines), plus
  collapses the repeated `_getUser` `where`. The remaining code reads as the
  *operational principle* ("this endpoint is authed; on success respond X; on
  error echo it") rather than frame plumbing.
- One place to fix the auth contract (e.g. distinguishing "expired" from
  "never existed", or adding rate-limit checks) instead of 18.
- Consistency is currently enforced only by a test
  (`src/syncs/endpoints.consistency.test.ts`); a combinator makes the right
  thing the *easy* thing.

### Risk & where this lives (important)

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

### Migration effort

Medium. Helpers are ~40 lines; conversion is mechanical and per-endpoint, and
the existing consistency + integration tests (`src/syncs/app.test.ts`,
`endpoints.consistency.test.ts`) cover the behavior, so refactors are safe to
verify incrementally.

---

## 2. "Read endpoint" list/aggregate `where` helper

### Current code

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
"zero matches -> no response" trap documented in [ENGINE.md](ENGINE.md), but
every caller still wires `base`, `collect`, and `as` by hand.

### Proposed abstraction

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

### Win / risk / effort

Removes a sharp edge (forgetting `base`/`aggregate`) and ~3 lines per read
endpoint. **No coupling risk** (operates only on `Frames`). Low effort.

---

## 3. Mongo wiring + doc→row helpers for concepts

### Current code

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

### Proposed abstraction

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

### Win

Removes repetitive null-handling and the `"X" + "."` prefix idiom; makes the
*interesting* part of each query (the projection) the only thing on screen.

### Risk

Low but worth stating: these helpers are **infrastructure**, identical in spirit
to the already-shared `freshID`/`getDb`. They contain **no domain logic** and do
not let one concept reach into another, so independence is preserved. The mild
downside is that a reader must know one more util to read a concept; mitigate by
keeping the helpers tiny and obvious. Do **not** let this slide into shared
domain helpers (e.g. a shared "find-or-error" that encodes a specific error
message contract) — keep messages in the concept.

### Effort

Low–Medium; per-concept, mechanical, fully covered by existing `*Concept.test.ts`.

---

## 4. Generic `freshID<T>()` to remove id casts

### Current code

`freshID(): ID` (`src/utils/database.ts:65`) returns the base brand, so every
caller re-casts: `const post = freshID() as Post;` — 15× across concepts
(`PostingConcept.ts:52`, `ReactingConcept.ts:62`, `LinkingConcept.ts:55,112`,
`ConversingConcept.ts:77-78,116`, `TaggingConcept.ts:64`,
`AuthenticatingConcept.ts:52`, `SessioningConcept.ts:53,73`, …).

### Proposed abstraction

```ts
export function freshID<T extends ID = ID>(): T {
  return uuidv7() as T;
}
```

Then `const post = freshID<Post>();` — the intent ("mint a Post id") is explicit
and the lossy `as` disappears.

### Win / risk / effort

Removes 15 casts, improves readability, zero behavior change, **no coupling**.
Trivial effort. (`Post`/`Tag`/etc. are local `type X = ID` aliases, so this is
purely ergonomic, but it reads better and prevents accidental cross-type casts.)

---

## 5. Stronger frame typing to cut `$[x] as T` casts in `where`

### Current code

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

### Proposed abstraction (options)

- **Option A — branded variable symbols.** Give `$vars` a typed-symbol brand
  (`TVar<T>`) so `frames.map(($) => $[content])` infers `string`. High type
  sophistication, large change to `vars.ts`/`frames.ts`, and fights TS's
  inability to key objects by typed symbols. High effort, uncertain payoff.
- **Option B — typed read helpers.** A small `read($, content): string` /
  `readList($, thread): T[]` accessor that centralizes the cast in one audited
  place instead of scattering `as` at call sites. Low effort, modest payoff.

### Win / risk / effort

Better safety in the one place the system is currently `any`-ish. **No coupling
risk.** Recommend Option B now (cheap), treat Option A as a research spike — it
touches engine internals and may not be worth the type gymnastics.

---

## 6. De-duplicate shared types

### Current code

- `ApiError` and `ContractShape` are defined **twice**, identically, in
  `src/concepts/Requesting/api.ts:10,13` and `src/sdk/client.ts:36,43`.
- `Empty` is defined twice: `src/engine/types.ts:81` and
  `src/utils/types.ts:12` (both `Record<PropertyKey, never>`).
- `Prettify` lives in `api.ts:15` and is imported into sync files
  (`auth.sync.ts:21`, `threads.sync.ts:33`).

### Proposed abstraction / tradeoff

These are 1-liners, so DRY value is small — but the *intent* matters:

- The SDK (`src/sdk/client.ts`) is **deliberately app-agnostic and standalone**
  (see its module doc, lines 1–33). Sharing `ApiError`/`ContractShape` from the
  backend would couple the SDK to backend internals — arguably *worse* than the
  duplication. **Recommendation: keep the SDK copies; add a one-line comment**
  noting the intentional, structural duplication so future readers don't "fix"
  it by coupling them.
- `Empty` duplication is pure accident and safe to unify: have
  `@utils/types.ts` re-export the engine's, or vice-versa.

### Win / risk / effort

Mostly a clarity/intent fix. Low everything.

---

## 7. Factor the duplicated "derive `[[links]]`" sync

### Current code

`parseLinkTargets` (`src/syncs/threads.sync.ts:94`) is used by two syncs whose
`where`/`then` are identical except for the triggering action
(`ThreadReplyDerivesLinks:226` and `PostEditDerivesLinks:362`):

```ts
where: async (frames) =>
  frames.map(($) => ({ ...$, [targets]: parseLinkTargets($[content] as string) })),
then: ...actions([Linking.setLinks, { source: post, targets }]),
```

### Proposed abstraction

A small local factory in the same file:

```ts
const derivesLinks = (ep, trigger) => ep.sync(({ request, content, post, targets }) => ({
  when: ep.actions(ep.request({ content }, { request }), [trigger, {}, { post }]),
  where: async (frames) =>
    frames.map(($) => ({ ...$, [targets]: parseLinkTargets($[content] as string) })),
  then: ep.actions([Linking.setLinks, { source: post, targets }]),
}));
```

### Win / risk / effort

Removes one duplicated sync body; keeps the markdown-link convention in exactly
one place. **No coupling risk** (already within the sync layer). Trivial effort.
Lower priority — only 2 instances.

---

## 8. Naming: `Authenticating._getById` → `_getUsername`

`Authenticating._getById({ user })` returns `{ username }`, not the user
(`src/concepts/Authenticating/AuthenticatingConcept.ts:147`). The name describes
the *input*, not the *output*, and obscures intent at call sites
(`src/syncs/auth.sync.ts:145`, where it produces `username`). Rename to
`_getUsername` to match siblings like `Profiling._getDisplayName`. Trivial,
purely local to the concept + its few sync references.

---

## 9. Reduce `as unknown as` erasure inside the `api.ts` builder

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

## What was checked and deliberately *not* recommended

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

## Suggested sequencing

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
