# Missing & Redundant Concepts — Class Forum Gap Analysis

> Audience: maintainers of this concept-design forum backend, preparing it for use
> as a **course discussion forum** (Discourse / Piazza-style) that is *well-rounded
> but not bloated*.
>
> Method: every recommendation is judged against the concept-design principles in
> `design/background/*` — each concept must be **independent** (no reference to other
> concepts), **polymorphic** (treats related objects as opaque IDs), **single-purpose**
> (one coherent concern), and **complete** (owns all of its own functionality, composed
> only via synchronizations). Claims about what exists were verified against the source
> in `src/concepts/*` and `src/syncs/*`.

---

## 1. What exists today (verified)

Eleven concepts ship today (`src/concepts/`), one of which (`Requesting`) is the
provided HTTP bootstrap:

| Concept | Type params | Purpose (as implemented) |
| --- | --- | --- |
| `Authenticating` | owns `User` | username/password identity: `register`, `authenticate`, `changePassword`, `changeUsername`, `unregister` |
| `Sessioning` | `[User]` | keep a user signed in; `start`, `end`, `expire` (system) |
| `Profiling` | `[User]` | public display name / bio / avatar |
| `Posting` | `[Author]` | raw authored content; `create`, `edit` (stamps `editedAt`), `delete` (**hard delete**) |
| `Conversing` | `[Item]` | threaded reply tree (root + parent/child nodes) over generic items |
| `Reacting` | `[User, Target]` | one named reaction per (user, target, kind); `_countByKind` gives crowd sentiment |
| `Tagging` | `[Target]` | shared reusable labels applied to many targets |
| `Tracking` | `[User, Item, Scope]` | per-user **seen/unseen** state; "unread" is the derived query |
| `Linking` | `[Item]` | directed reference graph + backlinks |
| `Formatting` | `[Target]` | raw Markdown → sanitized HTML, kept in sync |
| `Requesting` | — | reifies HTTP requests as actions (provided) |

**User-facing features already supported** (verified from `src/syncs/*.sync.ts`
endpoint paths): register / login / logout / "me"; change password; edit profile
(display name, bio, avatar); start a thread; reply in a thread; fetch a threaded
view & a flat thread list; get / edit / delete a post (author-authorized); list posts
by author; react / unreact and count reactions on a target; create / add / remove /
browse tags; per-conversation unread list, unread count, mark-seen, mark-all-seen;
forward links and backlinks (auto-derived from `[[id]]` references in post content).

**Authorization today** is intentionally minimal — only "valid session" and "author of
the resource" (see `docs/DESIGN_DECISIONS.md` §"Out of scope"). There is **no notion of
instructor / TA / student**, no notifications, and no moderation. Those are the biggest
gaps for a *class* forum.

---

## 2. Executive summary

Priority key: **Must-have** = the forum is meaningfully deficient as a class tool
without it; **Nice-to-have** = clear value, add as capacity allows; **Skip** = omit to
avoid bloat (revisit only on demand). Effort: **S** ≈ one concept + a couple of syncs;
**M** ≈ concept + several syncs / a derived view; **L** ≈ touches many flows.

| Concept | Priority | Effort | Rationale (concept-design framing) |
| --- | --- | --- | --- |
| **Roling** (permissions/roles) | **Must-have** | M | A class needs instructor / TA / student distinctions to authorize pin, moderate, announce, close. Independent `[User, Context]` capability map; authorization stays in syncs. |
| **Notifying** | **Must-have** | M | Replies, mentions, announcements must reach people. Independent per-user inbox with read state; delivery owned by the concept, events fed by syncs. |
| **Flagging** | **Must-have** | S | Community-standards reporting on a class forum. Crowd-sourced reports on a generic target with a status lifecycle; distinct purpose from `Reacting`. |
| **Trashing** (soft delete) | **Must-have** | S | Moderation/author deletion must be *recoverable* (appeals, accidental loss). Today `Posting.delete` is irreversible. Purpose = undeletion, per the canonical `Trash` concept. |
| **Categorizing** (sections) | Nice-to-have | M | Course sections ("HW1", "Exams", "Logistics"). *Single-home* membership — semantically different from many-valued `Tagging`. See §5 for Categorizing-vs-Tagging tradeoff. |
| **Resolving** (accepted answer) | Nice-to-have | S | Q&A class forums (Piazza-style) need "this reply is the answer". Marks one item as the resolver of another. High value if your course is Q&A-heavy → borderline Must. |
| **Pinning** | Nice-to-have | S | Instructor announcements / pinned threads. Tiny ordering-priority concept over a scope; semantics differ from a magic tag. |
| **Subscribing** (watch/follow) | Nice-to-have | S | "Notify me of replies to this thread / category." Pure intent store; pairs with `Notifying`. |
| **Bookmarking** (saved items) | Nice-to-have | S | Students save useful posts for later. Trivially independent `[User, Item]`. |
| **Locking** (close thread) | Nice-to-have | S | Instructors close resolved/heated threads to new replies. Can fold into `Roling`+a flag, or a 1-state concept. |
| **Revisioning** (edit history) | Nice-to-have | M | Transparency / academic integrity: keep prior post versions. `Posting` only stamps `editedAt`. |
| **Voting** (generic up/down ranking) | **Skip** | — | Redundant with `Reacting` (`upvote` kind + `_countByKind`). Add only if you need *downvotes / net score ordering*. See §5. |
| **Mentioning** (@user) | **Skip as a concept** | S | Implement as a *sync* (parse content → `Authenticating._getByUsername` → `Notifying.notify`). A standalone concept would be bloat. |
| **Badging / Karma** | **Skip** | — | Gamified reputation distorts participation in a graded class; not a core need. |
| **Polls** | **Skip** | — | Occasional convenience; adds a whole concept + UI. Defer until explicitly requested. |
| **Drafts** | **Skip** | — | Best handled client-side; little server value for a class forum. |
| **Inviting** | **Skip** | — | Class membership is roster/SSO-driven, not invite-driven. Use `Roling` + enrollment instead. |
| **Rate-limiting** | **Skip (not a concept)** | — | Cross-cutting infrastructure concern, *not* user-facing. Belongs in the engine / `Requesting` layer, not a concept. |
| **Searching** | **Skip as a concept (use queries)** | — | Largely satisfiable with queries over `Posting`/`Formatting`. Only build an `Indexing` concept if you need ranked full-text at scale. See §5. |
| **Grouping** (teams) | Skip (unless group projects) | M | Only if the course has project teams or you want to grant permissions to a set. Otherwise `Roling` suffices. |
| **Read-tracking** | **Already covered** | — | `Tracking` *is* read-tracking. No new concept. |

**Recommended tight set to add now (in order): `Roling`, `Notifying`, `Trashing`,
`Flagging`** (the four Must-haves), then **`Resolving` + `Pinning` + `Subscribing`** if
your course is discussion/Q&A-heavy. Everything else is deferrable.

---

## 3. Capability map: current concepts → forum features

| Forum capability | Covered by | Status |
| --- | --- | --- |
| Accounts & login | `Authenticating` + `Sessioning` | ✅ |
| Public identity | `Profiling` | ✅ |
| Write / edit / delete posts | `Posting` | ✅ (delete is **hard**, no recovery) |
| Threaded discussion | `Conversing` | ✅ |
| Likes / emoji sentiment | `Reacting` | ✅ |
| Topical labels | `Tagging` | ✅ |
| Unread tracking | `Tracking` | ✅ |
| Cross-references / backlinks | `Linking` | ✅ |
| Markdown rendering | `Formatting` | ✅ |
| **Roles (instructor/TA/student)** | — | ❌ **gap** |
| **Notifications** | — | ❌ **gap** |
| **Flag / report content** | — | ❌ **gap** |
| **Recoverable deletion / moderation** | — | ❌ **gap** (only hard delete) |
| **Course sections / categories** | partially `Tagging` | ⚠️ weak (no single-home semantics) |
| **Accepted answer / solved** | — | ❌ gap (matters for Q&A courses) |
| **Pinned announcements** | — | ❌ gap |
| **Watch a thread / subscribe** | — | ❌ gap |
| **Closed/locked threads** | — | ❌ gap |

---

## 4. Recommended concepts — design sketches

Each sketch follows `design/background/concept-specifications.md`: name + type params,
a **need-focused / specific / evaluable** purpose, a **goal-focused / differentiating**
principle, key state, key actions, and example syncs in this repo's style. Independence
is preserved by keeping every cross-concept decision in the `then`/`where` of a sync,
never inside the concept.

> Sync notation below uses the lightweight spec form from
> `implementing-synchronizations.md`. The repo's actual TypeScript uses the
> `requestingEndpoint(...).sync(...)` helper from `@concepts/Requesting/api.ts`
> (see `src/syncs/threads.sync.ts`); one example is given in that concrete form.

---

### 4.1 `Roling` — permissions / roles  · **Must-have** · effort M

**concept** Roling [User, Context]

**purpose** decide which users are allowed to perform privileged operations within a
given context, by granting them named roles that carry capabilities.

**principle** if a user is granted the `instructor` role in a course context, then any
operation gated on the `moderate` capability of that context will be permitted for that
user, and refused once the role is revoked.

**state**
```
a set of Roles with
  a name String                       // e.g. "instructor", "ta", "student"
  a capabilities set of String        // e.g. {"moderate","pin","announce","close"}
a set of Grants with
  a user User
  a context Context                   // the course / category / forum id; "global" allowed
  a role Role
// Invariant: at most one Grant per (user, context, role).
```

**key actions**
- `defineRole (name, capabilities: set of String) : (role: Role)`
- `grant (user, context, role) : (grant)` — requires role exists, not already granted
- `revoke (user, context, role) : (grant)`
- `_hasCapability (user, context, capability) : (allowed: Flag)` — query; true iff some
  granted role in `context` (or a designated global context) lists `capability`
- `_getRoles (user, context) : (role)` · `_getUsersWithRole (context, role) : (user)`

**why it's independent & polymorphic.** It never names `Posting`, `Conversing`, etc. —
`Context` is just an opaque id (a course id, a category id, or a sentinel like the
forum's root). Capabilities are plain strings the *application* assigns meaning to via
syncs. Single purpose: map (user, context) → capabilities. It does **not** enforce
anything; enforcement lives in syncs (firing conditions).

**example syncs**
```
// Only a user with the "moderate" capability may hard-remove someone else's post.
sync ModeratorDeletePost
when
  Request.request (path: "/mod/deletePost", session, post) : (request)
where
  in Sessioning: user of session is u
  in Conversing: conversation/category context of post is ctx     // via a sync-side query
  in Roling: _hasCapability(u, ctx, "moderate") is true
then
  Trashing.trash (item: post, by: u)        // soft delete (see 4.4), not hard delete
```
```
// Bootstrap: the first registered account, or an env-seeded list, becomes instructor.
sync SeedInstructorRole
when
  Authenticating.register () : (user)
where
  in Roling: _getUsersWithRole("course", "instructor") is empty
then
  Roling.grant (user, context: "course", role: <instructorRoleId>)
```

**dependencies.** None at the concept level. At the app level it is *consumed by* the
authorization `where`-clauses of many syncs. Pairs naturally with an enrollment seed
(roster import) that calls `Roling.grant(..., "student")`.

**alternative considered.** A coarser `Permissioning [User, Resource]` that grants
capabilities directly on individual resources (ACL-style). Tradeoff: ACLs are more
granular but verbose for a class (you'd grant per-thread). Role-in-context is the right
default for a course; you can still add resource-level grants later by instantiating
`Roling` a second time with `Context = Post`.

---

### 4.2 `Notifying` — notifications · **Must-have** · effort M

**concept** Notifying [User]

**purpose** make sure a user learns about events relevant to them even when they are not
currently looking at the thread where the event occurred.

**principle** when an event addressed to a user is recorded, it appears in that user's
notification list as unread; after the user reads it, it no longer counts toward their
unread badge; the user can still review past notifications.

**state**
```
a set of Notifications with
  a recipient User
  a kind String                 // "reply" | "mention" | "announcement" | "flagResolved" ...
  a subject String              // short human text
  an optional link String       // opaque deep-link / target id, treated as a string
  a createdAt DateTime
  a read Flag
```

**key actions**
- `notify (recipient, kind, subject, link) : (notification)`
- `markRead (notification) : (notification)` · `markAllRead (recipient) : (recipient)`
- `dismiss (notification) : (notification)`
- `_getInbox (recipient) : (notification: {...})` · `_getUnreadCount (recipient) : (count)`

**completeness note.** Per concept-design's *completeness* rule, `Notifying` owns its
own delivery (the in-app inbox **is** the delivery). Email/push is a *separate* concept
(e.g. `Emailing`) synced to `Notifying.notify` — do **not** have `Notifying` "call out"
to an email service.

**example syncs**
```
// Notify the parent author when someone replies to their post.
sync NotifyOnReply
when
  Conversing.reply (item: childPost, parent) : (node)
where
  in Conversing: _getItem(parent) is parentPost
  in Posting:    _getAuthor(parentPost) is parentAuthor
  in Posting:    _getAuthor(childPost)  is replier
  parentAuthor != replier
then
  Notifying.notify (recipient: parentAuthor, kind: "reply",
                    subject: "New reply to your post", link: childPost)
```

Concrete repo form (mirrors `src/syncs/threads.sync.ts` style):
```typescript
export const NotifyOnReply = threadReply.sync(
  ({ post, parent, parentPost, parentAuthor, replier }) => ({
    when: threadReply.actions([Conversing.reply, { parent }, { node: post }]),
    where: async (frames) => {
      frames = await frames.query(Conversing._getItem, { node: parent }, { parentPost });
      frames = await frames.query(Posting._getAuthor, { post: parentPost }, { parentAuthor });
      frames = await frames.query(Posting._getAuthor, { post }, { replier });
      return frames.filter(($) => $[parentAuthor] !== $[replier]);
    },
    then: threadReply.actions([
      Notifying.notify,
      { recipient: parentAuthor, kind: "reply", subject: "New reply", link: post },
    ]),
  }),
);
```

**dependencies.** None at concept level. Consumes events from `Conversing`, `Flagging`,
`Roling` (announcements), `Mentioning`-sync, `Subscribing` — all via syncs.

**overlap check vs `Tracking`.** Different purposes. `Tracking` answers "which posts in a
thread are new to me?" (seen/unseen over a content scope). `Notifying` answers "what
happened that I should know about?" (discrete addressed events with their own read
state). They are complementary, not redundant.

---

### 4.3 `Flagging` — report content for moderation · **Must-have** · effort S

**concept** Flagging [User, Target]

**purpose** let the community surface content that may violate course/community
standards so that staff can review and act on it.

**principle** after one or more users flag a target with a reason, the target appears in
a staff review queue with its flags; once staff resolve it (upheld or dismissed) it
leaves the open queue, and a user cannot double-flag the same target.

**state**
```
a set of Flags with
  a reporter User
  a target Target
  a reason String
  a createdAt DateTime
  a status String              // "open" | "upheld" | "dismissed"
// Invariant: at most one open Flag per (reporter, target).
```

**key actions**
- `flag (reporter, target, reason) : (flag)` — requires no open flag by reporter on target
- `resolve (target, outcome: String) : (target)` — sets all open flags on target to outcome
- `_getOpenTargets () : (target, count: Number)` — the review queue, busiest first
- `_getFlags (target) : (flag: {...})` · `_hasFlagged (reporter, target) : (flagged: Flag)`

**why not just `Reacting`?** `Reacting`'s purpose is to *gauge crowd sentiment* (counts
of named reactions); `Flagging`'s purpose is a *moderation workflow* with a status
lifecycle and a staff queue. Conflating them would violate single-purpose separation.

**example syncs**
```
sync FlagPost
when
  Request.request (path: "/flags/create", session, post, reason) : (request)
where
  in Sessioning: user of session is u
then
  Flagging.flag (reporter: u, target: post, reason)

sync NotifyStaffOnFlag
when
  Flagging.flag (target) : (flag)
where
  in Roling: _getUsersWithRole("course", "ta") is staff
then
  Notifying.notify (recipient: staff, kind: "flag",
                    subject: "Content flagged for review", link: target)
```

**dependencies.** None at concept level; the review queue is gated by `Roling` and
staff are alerted via `Notifying`, both in syncs.

---

### 4.4 `Trashing` — recoverable deletion · **Must-have** · effort S

**concept** Trashing [Item]

**purpose** support deletion of items with the possibility of restoring them (so an
accidental or contested removal can be undone).

**principle** after an item is trashed it is hidden from normal listings but still
exists; it can be restored to full visibility, or eventually purged to remove it for
good — the defining value is the window in which restoration is still possible.

**state**
```
a set of TrashedItems with
  an item Item
  a trashedBy Item            // opaque actor id (kept as a generic ID)
  a trashedAt DateTime
// An item is "live" iff it is not in this set.
```

**key actions**
- `trash (item, by) : (item)` — requires item not already trashed
- `restore (item) : (item)` — requires item trashed
- `purge (item) : (item)` — permanently forgets the trash record (the real hard delete,
  e.g. cascaded to `Posting.delete` by a sync)
- `_isTrashed (item) : (trashed: Flag)` · `_getTrashed () : (item, trashedBy, trashedAt)`

**why it's needed.** Today `Posting.delete` is an irreversible `deleteOne` (verified in
`PostingConcept.ts`). For a class forum, both author "delete" and staff moderation
should be *recoverable* (appeals, mistakes). It also sidesteps a real wrinkle in
`Conversing.remove`, which refuses to remove a node that still has children — soft-trash
lets a contested parent post be hidden without breaking the reply tree.

**example syncs**
```
// "Delete" from the UI becomes a soft trash, and content listings filter trashed items.
sync AuthorDeletesPost
when
  Request.request (path: "/posts/delete", session, post) : (request)
where
  in Sessioning: user of session is u
  in Posting:    _getAuthor(post) is u
then
  Trashing.trash (item: post, by: u)

// A scheduled/admin purge cascades to the real hard delete + cleanup of side concepts.
sync PurgeCascade
when
  Trashing.purge (item: post) : (item)
then
  Posting.delete (post)
  Formatting.clear (target: post)
  Reacting.clearTarget (target: post)
  Tracking.unregister (item: post)
```

**dependencies.** None at concept level. Read endpoints (e.g. `/threads/get`) gain a
`where`-clause filter using `Trashing._isTrashed`. This is the one Must-have that also
implies a small change to existing read syncs (hence effort note).

---

### 4.5 `Resolving` — accepted answer / solved · Nice-to-have (Must for Q&A) · effort S

**concept** Resolving [Question, Answer, User]

**purpose** let the asker (or staff) designate which reply actually answers a question,
so future readers can jump straight to the resolution.

**principle** after a question receives several replies, marking one reply as its
accepted answer makes the question display as "solved" and surfaces that reply; the mark
can be moved to a different reply or cleared.

**state**
```
a set of Resolutions with
  a question Question          // opaque id (a root post / thread)
  an answer Answer             // opaque id (a reply post)
  a resolvedBy User
  a resolvedAt DateTime
// Invariant: at most one Resolution per question.
```

**key actions**
- `accept (question, answer, by) : (resolution)` — replaces any existing resolution
- `clear (question) : (question)`
- `_isResolved (question) : (resolved: Flag)` · `_getAnswer (question) : (answer)`

**example sync**
```
sync AcceptAnswer
when
  Request.request (path: "/threads/accept", session, question, answer) : (request)
where
  in Sessioning: user of session is u
  in Posting:    _getAuthor(question) is u          // asker; OR Roling capability "moderate"
then
  Resolving.accept (question, answer, by: u)
  Notifying.notify (recipient: <answer author>, kind: "accepted",
                    subject: "Your reply was marked the answer", link: answer)
```

---

### 4.6 `Pinning` — announcements / pinned threads · Nice-to-have · effort S

**concept** Pinning [Item, Scope]

**purpose** keep important items at the top of a listing within a scope, regardless of
recency, so announcements stay visible.

**principle** after an item is pinned in a scope it sorts ahead of unpinned items in
that scope's listing until it is unpinned; pin order among pinned items is controllable.

**state**
```
a set of Pins with
  an item Item
  a scope Scope               // the category / forum root
  a priority Number
  a pinnedAt DateTime
```

**key actions** `pin (item, scope, priority)`, `unpin (item, scope)`,
`_getPinned (scope) : (item, priority)`, `_isPinned (item, scope) : (pinned: Flag)`.

**why not a magic tag?** A "pinned" tag in `Tagging` has no ordering and no scope-bound
priority; pinning is about *position in a list within a scope*, a different purpose. Pin
creation is gated by `Roling._hasCapability(u, scope, "pin")` in a sync.

---

### 4.7 `Subscribing` — watch / follow · Nice-to-have · effort S

**concept** Subscribing [User, Target]

**purpose** record a user's standing interest in a target so that future events on that
target can be routed to them.

**principle** after a user subscribes to a target, every subsequent event on that target
reaches the user; after unsubscribing, such events no longer reach them.

**state** `a set of Subscriptions with a user User, a target Target, a createdAt DateTime`
(at most one per (user, target)).

**key actions** `subscribe`, `unsubscribe`, `_getSubscribers (target) : (user)`,
`_isSubscribed (user, target) : (subscribed: Flag)`.

**example sync** (fan-out to `Notifying`)
```
sync NotifyWatchersOnReply
when
  Conversing.reply (parent) : (node)
where
  in Conversing:   _getConversation(parent) is convo
  in Subscribing:  _getSubscribers(convo) is watcher
then
  Notifying.notify (recipient: watcher, kind: "reply",
                    subject: "New reply in a thread you follow", link: node)
```
Auto-subscribe the author on thread create, and the replier on reply, with two more
trivial syncs.

---

### 4.8 `Bookmarking` — saved items · Nice-to-have · effort S

**concept** Bookmarking [User, Item]

**purpose** let a user keep a private, personal shortlist of items to return to later.

**principle** after a user bookmarks an item it appears in their saved list until they
remove it; bookmarks are private to the user.

**state** `a set of Bookmarks with a user User, an item Item, a savedAt DateTime`
(at most one per (user, item)). **Actions** `save`, `unsave`,
`_getSaved (user) : (item, savedAt)`, `_isSaved (user, item) : (saved: Flag)`.

This is the cleanest possible independent concept — recommended whenever you want a
"save for later" affordance.

---

### 4.9 `Locking` — close a thread · Nice-to-have · effort S

**concept** Locking [Target]

**purpose** stop further contributions to a target once a discussion is concluded or
needs to be frozen.

**principle** after a target is locked, attempts to add to it are refused until it is
unlocked. **State** `a set of LockedTargets with a target Target, a lockedAt DateTime`.
**Actions** `lock`, `unlock`, `_isLocked (target) : (locked: Flag)`.

Enforcement is a firing condition in the reply sync:
```
sync ReplyBlockedWhenLocked
when
  Request.request (path: "/threads/reply", session, parent, content) : (request)
where
  in Conversing: _getConversation(parent) is convo
  in Locking:    _isLocked(convo) is true
then
  Request.respond (request, error: "This thread is locked.")
```
(Could also be folded into `Roling` + a status flag if you want to minimize concept
count.)

---

### 4.10 `Revisioning` — edit history · Nice-to-have · effort M

**concept** Revisioning [Item]

**purpose** preserve prior versions of an item's content so changes are transparent and
auditable (useful for academic-integrity review of edited posts).

**principle** each time an item's content is saved, the previous content is retained as a
numbered revision that can be listed and viewed later. **State**
`a set of Revisions with an item Item, a number Number, a content String, a savedAt DateTime`.
**Actions** `record (item, content)`, `_getRevisions (item)`, `_getRevision (item, number)`.

Wire a sync `when Posting.edit(post, content) then Revisioning.record(item: post, content)`.
`Posting` already stamps `editedAt`; `Revisioning` adds the actual history it lacks.

---

## 5. Key design decisions & alternatives (avoiding bloat)

### 5.1 Voting vs. Reacting — **don't add a generic `Voting` concept**
`Reacting` already records one named reaction per (user, target, kind) and exposes
`_countByKind`. An `upvote` kind plus that count gives you exactly crowd-ranked
popularity — `Upvote` and `Reacting` share the same machinery. Add a dedicated `Voting`
concept **only if** you specifically need **downvotes producing a net score** and want
to *sort* items by that net score as the concept's defining purpose (that ordering is
what distinguishes `Upvote` from a plain reaction in the literature). For a class forum,
a single `upvote`/`helpful` reaction kind is usually enough. *Recommendation: Skip;
revisit only if Q&A ranking with downvotes becomes a requirement.*

### 5.2 Categorizing vs. Tagging — **complementary, not redundant**
- `Tagging`: many labels per target, flat, shared vocabulary, discovery by overlap.
- `Categorizing`: ideally **one home** per thread (a course *section*), often with a
  description and its own permissions/scope — a different purpose (organize the forum
  into places) and a different cardinality (single-valued).

For a class with clear sections ("Logistics", "HW1"…"HW6", "Exams", "Project") a
`Categorizing [Item, Category]` concept with single-membership is worth it and doubles as
the natural `Context`/`Scope` for `Roling`, `Pinning`, `Subscribing`, and `Tracking`. If
your course is small and flat, you can defer it and reuse a small set of `Tagging` tags
as pseudo-sections. *Recommendation: Nice-to-have; add it if you want per-section
permissions or pinned section announcements.*

Sketch: **concept** Categorizing [Item, Category] · **purpose** give each item a single
home section so the forum can be browsed by area · state: a set of Categories with a name
/ description; a set of Memberships with an item and exactly one category · actions
`createCategory`, `assign (item, category)` (replaces prior), `_getCategory (item)`,
`_getItems (category)`.

### 5.3 Searching — **prefer queries, not a concept (for now)**
Most "search the forum" needs are satisfiable by queries over existing state
(`Posting._getByAuthor`, content scans, `Tagging._getTargets`, `Formatting`). A dedicated
`Indexing`/`Searching` concept (maintaining an inverted index over generic documents) is
only justified when you need ranked full-text at scale. Building it early is bloat.
*Recommendation: implement search as read syncs/queries; introduce an `Indexing` concept
later only if performance demands it.*

### 5.4 Mentioning — **a sync, not a concept**
`@username` handling needs no state of its own: a sync parses mentions out of post
content (exactly like the existing `parseLinkTargets` `[[id]]` logic in
`threads.sync.ts`), resolves them via `Authenticating._getByUsername`, and fires
`Notifying.notify`. Adding a `Mentioning` concept would duplicate `Notifying` state and
violate "no concept that isn't pulling its weight." *Recommendation: Skip the concept;
add a mention-parsing sync once `Notifying` exists.*

### 5.5 Rate-limiting — **not user-facing, so not a concept**
Concept design reserves concepts for *user-facing behavioral concerns*
(`concept-design-overview.md`). Throttling is infrastructure; put it in the engine or
the `Requesting` layer. Modeling it as a concept would be a category error.

### 5.6 Things to deliberately **Skip** for a class forum
Badging/Karma (distorts graded participation), Polls, Drafts (client-side), Inviting
(rosters/SSO instead), and Grouping unless the course runs project teams. Each is a whole
concept's worth of surface area for marginal class value — omit to stay lean.

---

## 6. Redundancy / overlap audit of *existing* concepts

- **`Tracking` already is "read tracking."** The brief's "ReadTracking vs current
  Tracking" is a non-gap: `Tracking` over `(User, Item, Scope=conversation)` *is* the
  unread system. No change needed.
- **`Reacting` already subsumes "Voting"** for the common case (see §5.1). Keep one
  concept; don't split.
- **`Tagging` partially overlaps a future `Categorizing`** (see §5.2). They can coexist
  with distinct purposes (many flat labels vs. one section). Avoid using `Tagging` to
  fake single-home categories long-term — the semantics (cardinality, scope) diverge.
- **`Posting.delete` is a hard delete** and `Conversing.remove` forbids removing a node
  with children. Introducing `Trashing` (§4.4) resolves both: soft-hide contested
  content without violating the reply-tree invariant, and reserve real `delete`/`remove`
  for a cascaded `purge`.
- No other redundancy found: `Authenticating`/`Sessioning`/`Profiling` cleanly separate
  credentials / live session / public view; `Posting`/`Conversing` cleanly separate
  content / structure; `Linking` and `Formatting` are orthogonal. This is a healthy,
  well-separated base — the gaps are additive (roles, notifications, moderation), not
  corrections.

---

## 7. Suggested rollout order

1. **`Roling`** — unblocks every staff-only capability (moderation, pin, announce, close).
2. **`Trashing`** — make deletion recoverable before you wire moderation to it.
3. **`Flagging`** — community reporting → staff queue (gated by `Roling`, alerts via…).
4. **`Notifying`** — replies + flags + announcements; then add the mention-parsing sync.
5. **`Resolving` + `Pinning` + `Subscribing`** — if the course is discussion/Q&A-centric.
6. **`Categorizing`** — when you want per-section permissions / pinned announcements.
7. Defer `Revisioning`, `Bookmarking`, `Locking` to demand; **skip** Voting, Karma,
   Polls, Drafts, Inviting, Grouping, Rate-limiting, and a standalone Search/Mentioning
   concept unless a concrete need appears.

Each added concept must keep the same discipline already present in this codebase: no
imports of other concepts, fully polymorphic type parameters, a single evaluable
purpose, and all cross-concept wiring expressed in `src/syncs/*.sync.ts`.
