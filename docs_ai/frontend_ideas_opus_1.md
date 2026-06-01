# Frontend Ideas for the Concept-Design Forum

A proposal for a web frontend built against the actual HTTP API exposed by this
backend. Every feature below is mapped to concrete endpoints found in
`src/syncs/*.sync.ts`. The API is uniformly **`POST`-only**, JSON-in/JSON-out,
served under a base path (the SDK uses `http://localhost:8000/api`), and a
type-safe client already exists in `src/sdk/` bound to the inferred `ForumApi`
contract — so the frontend can get end-to-end types for free.

---

## 1. What the backend actually does

The forum is assembled from independent concepts wired by synchronizations. The
endpoints group into the following capability areas:

| Area | Representative endpoints |
| --- | --- |
| Auth & session | `/auth/register`, `/auth/login`, `/auth/logout`, `/auth/me`, `/auth/changePassword` |
| Threads & posts | `/threads/create`, `/threads/reply`, `/threads/get`, `/threads/list`, `/posts/get`, `/posts/edit`, `/posts/delete`, `/posts/byAuthor` |
| Links / backlinks | `/links/backlinks`, `/links/forward` |
| Categories | `/categories/create`, `/categories/delete`, `/categories/assign`, `/categories/unassign`, `/categories/list`, `/categories/items`, `/categories/forItem` |
| Tags | `/tags/create`, `/tags/add`, `/tags/remove`, `/tags/targets`, `/tags/forTarget` |
| Reactions | `/reactions/add`, `/reactions/remove`, `/reactions/forTarget` |
| Resolutions (accepted answers) | `/resolutions/accept`, `/resolutions/clear`, `/resolutions/get`, `/resolutions/isResolved` |
| Notifications | `/notifications/list`, `/notifications/unreadCount`, `/notifications/markRead`, `/notifications/markAllRead`, `/notifications/dismiss` |
| Unread tracking | `/unread/list`, `/unread/count`, `/unread/markSeen`, `/unread/markAllSeen` |
| Subscriptions (watching) | `/subscriptions/subscribe`, `/subscriptions/unsubscribe`, `/subscriptions/mine`, `/subscriptions/isSubscribed`, `/subscriptions/subscribers` |
| Bookmarks | `/bookmarks/save`, `/bookmarks/unsave`, `/bookmarks/list`, `/bookmarks/isSaved` |
| Pins | `/pins/pin`, `/pins/unpin`, `/pins/setPriority`, `/pins/forScope`, `/pins/isPinned` |
| Flags (reporting) | `/flags/raise`, `/flags/resolve`, `/flags/open`, `/flags/forTarget` |
| Locks | `/locks/lock`, `/locks/unlock`, `/locks/isLocked`, `/locks/list` |
| Trash (soft delete) | `/trash/trash`, `/trash/restore`, `/trash/purge`, `/trash/list`, `/trash/isTrashed` |
| Roles & capabilities | `/roles/define`, `/roles/grant`, `/roles/revoke`, `/roles/forUser`, `/roles/can` |
| Revisions (history) | `/revisions/list`, `/revisions/get`, `/revisions/latest` |
| Profiles | `/profiles/get`, `/profiles/setDisplayName`, `/profiles/setBio`, `/profiles/setAvatar` |

A few structural facts that shape the UI:

- **Threads are trees, not flat lists.** `/threads/create` returns
  `{ post, conversation, node }` and `/threads/reply` takes a `parent` and
  returns `{ post, node }`. `/threads/get` returns an array of enriched thread
  nodes (each node = the Conversing node fields + the `Posting` record
  `{ author, content, createdAt, editedAt }` + rendered HTML). The frontend
  must reconstruct the reply tree from these nodes.
- **Posts are markdown, rendered server-side.** Each node/post view carries a
  `rendered` HTML field from the `Formatting` concept, so the client displays
  server-rendered HTML rather than rendering markdown itself.
- **`[[id]]` references create links automatically.** `threads.sync.ts`
  parses `[[<id>]]` out of post content; event syncs persist them into
  `Linking`, which powers `/links/backlinks` (who references this post) and
  `/links/forward` (what this post references).
- **`@username` mentions trigger notifications.** `events.sync.ts` parses
  `@handle` tokens and fans out `mention` notifications; replies fan out
  `reply` notifications to the parent author and to thread subscribers.
- **Authorization is capability-based with a bootstrap escape hatch.** Privilege
  lives in the global `"forum"` Roling context. Capabilities seen in code:
  `administer` (roles, categories), `moderate` (lock, trash, assign category),
  plus a scope-local `pin` capability. Until someone holds `administer` the
  forum is "unclaimed" and the privileged gates stay **open** so the first
  operator can grant themselves an admin role (`authorization.ts`). The UI must
  handle this bootstrap state explicitly.
- **Notification kinds are a small vocabulary:** `reply`, `mention`,
  `accepted` (accepted-answer). Each notification carries a `subject` and a
  `link` (the post to navigate to).

---

## 2. Frontend vision

A Discourse-flavored, keyboard-friendly reading app with a moderation/admin
surface layered on the same data. Three personas drive the IA:

- **Reader/participant** — browses threads, replies, reacts, bookmarks, watches.
- **Answer-seeker (Q&A mode)** — asks, gets answers, marks an accepted answer.
- **Staff (moderator/admin)** — manages roles, categories, locks, the flag
  queue, pins, and the trash.

### Design principles

1. **Tree-first thread rendering.** The reply graph is a first-class citizen,
   not a flat comment list. Indentation + collapsible subtrees.
2. **Server-rendered content, client-orchestrated chrome.** Trust the
   `rendered` HTML; the client owns layout, affordances, and live counts.
3. **Capabilities decide affordances, not routes.** Buttons appear/disappear
   based on `/roles/can`, but the server is always the source of truth (the UI
   degrades gracefully on a `403`-style `{ error }`).
4. **Everything addressable.** Posts, conversations, categories, tags, and
   profiles all get stable URLs so `[[links]]`, mentions, and notification
   `link` targets resolve to deep links.

---

## 3. Information architecture & navigation

```
App shell
├── Top bar: logo · global search · compose · notifications bell · avatar menu
├── Left rail: Home/Latest · Categories · Tags · Bookmarks · Watching · (Staff)
└── Main content (route outlet)

Routes
/                      → Latest feed (thread list)
/c/:category          → Category feed
/t/:tag               → Tag feed
/conversation/:id     → Thread view (tree)
/post/:id             → Single-post permalink (scrolls into its thread)
/u/:user              → Profile + that user's posts
/bookmarks            → Saved items
/watching             → Subscriptions feed
/notifications        → Full notifications inbox
/search?q=            → Search/discovery results
/staff                → Moderation home (flag queue, locks, trash)
/staff/roles          → Role & capability admin
/staff/categories     → Category management
/onboarding           → First-run admin bootstrap / claim flow
/login /register      → Auth
```

The **bell** badge is driven by `/notifications/unreadCount`; left-rail "Home"
and per-category items can show unread dots from `/unread/count` scoped to the
relevant scope.

---

## 4. Screens, components, and endpoint mappings

### 4.1 Auth & onboarding

| UI | Endpoint(s) |
| --- | --- |
| Register form | `/auth/register` |
| Login form | `/auth/login` → store returned `session` |
| Boot/session check on app load | `/auth/me` → `{ user, username, profile }` |
| Avatar menu → Logout | `/auth/logout` |
| Settings → Change password | `/auth/changePassword` |

**Onboarding / admin bootstrap (`/onboarding`).** Because the forum starts
unclaimed, the first registered user should be guided to claim it. After
register+login, detect the unclaimed state by attempting an admin grant or by
reading `/roles/forUser`. The flow:

1. Register → login.
2. Show a "Claim this forum" card: define an `administrator` role via
   `/roles/define` with `capabilities: ["administer", "moderate"]`.
3. Grant it to self with `/roles/grant` (`context: "forum"`).
4. Seed initial structure: create a couple of categories
   (`/categories/create`) and a welcome thread (`/threads/create`).

Once an admin exists, hide the claim card permanently (the backend now enforces
the gates). Use `/roles/can` to decide whether to even offer the claim UI.

### 4.2 Thread list / feeds (`/`, `/c/:category`, `/t/:tag`)

- **Component: `ThreadListItem`** — title (first line of root post), author +
  avatar (`/profiles/get`), reply count, category chip, tag chips, pinned
  badge, resolved badge, unread dot, last-activity time.
- **Data:**
  - Latest feed → `/threads/list` (returns conversation roots enriched with the
    root `post` record).
  - Category feed → `/categories/items` then hydrate each via `/threads/get` or
    `/posts/get`; category metadata from `/categories/list`.
  - Tag feed → `/tags/targets` → hydrate.
  - Pinned-first ordering → `/pins/forScope` for the feed's scope; pinned
    items float to the top sorted by `priority`.
  - Resolved badge → `/resolutions/isResolved` (batch per visible root).
  - Unread dot → `/unread/list` / `/unread/count` for the scope.

### 4.3 Thread view (`/conversation/:id`) — the core screen

- **Data:** `/threads/get` → array of enriched nodes; the client builds the
  reply tree from node parent pointers and renders each node's `rendered` HTML.
- **Components:**
  - `ThreadHeader` — title, category chip (`/categories/forItem`), tags
    (`/tags/forTarget`), lock indicator (`/locks/isLocked`), pin control,
    watch toggle (`/subscriptions/isSubscribed` + subscribe/unsubscribe),
    "mark all read" (`/unread/markAllSeen` for the conversation scope).
  - `PostNode` (recursive) — avatar, author, timestamps (`createdAt`,
    `editedAt` → "edited" affordance), rendered body, action bar, and a nested
    `PostNode[]` for replies with collapse/expand.
  - `PostActionBar` — Reply, React, Bookmark, Flag, Copy-permalink, plus
    capability-gated Edit/Delete/Lock/Trash/Accept-answer.
  - `BacklinksPanel` — "Referenced by N posts" from `/links/backlinks`;
    `ReferencesList` of outgoing `[[…]]` targets from `/links/forward`.
  - `ReactionBar` — aggregated counts from `/reactions/forTarget`; clicking a
    kind calls `/reactions/add` or `/reactions/remove` (kinds are freeform
    strings, e.g. `like`, `🎉`).
  - `RevisionHistory` (modal) — `/revisions/list` + `/revisions/get` /
    `/revisions/latest` to diff a post's versions.

When a node is rendered, mark it seen lazily via `/unread/markSeen` once it
enters the viewport (IntersectionObserver), and refresh the bell.

### 4.4 Composer (new thread & reply)

- **Component: `Composer`** — markdown textarea with live server-preview, an
  autocomplete for `@mentions` and `[[post links]]`, category picker, and tag
  picker.
- **Mapping:**
  - New thread → `/threads/create` `{ session, content }`; then optionally
    `/categories/assign` and `/tags/add` on the returned `post`.
  - Reply → `/threads/reply` `{ session, parent, content }`.
  - **`[[…]]` autocomplete:** as the user types `[[`, query candidate posts
    (e.g. via search/`/posts/byAuthor`/recent) and insert the chosen id. On
    submit, backlinks are created automatically by the backend.
  - **`@…` autocomplete:** suggest usernames; the backend turns them into
    `mention` notifications.
  - **Lock awareness:** disable the reply box and show a banner when
    `/locks/isLocked` is true (still allow staff if `/roles/can` says so).
  - Edit existing post → `/posts/edit`; delete → `/posts/delete`.

### 4.5 Q&A / resolutions

For threads used as questions, surface an **Accept answer** affordance on each
reply (visible to the question's author and staff):

- Accept → `/resolutions/accept` `{ session, question, answer }`.
- Clear → `/resolutions/clear`.
- The accepted answer is pinned to the top of the reply list with a green check;
  state from `/resolutions/get` / `/resolutions/isResolved`. Accepting fires an
  `accepted` notification to the answer's author.

### 4.6 Notifications (`/notifications` + bell dropdown)

| UI | Endpoint |
| --- | --- |
| Bell badge count | `/notifications/unreadCount` |
| Dropdown / inbox list | `/notifications/list` |
| Click a notification | navigate to its `link` post, then `/notifications/markRead` |
| "Mark all read" | `/notifications/markAllRead` |
| Swipe/X dismiss | `/notifications/dismiss` |

Render kind-specific copy: `reply` ("X replied to your post"), `mention`
("X mentioned you"), `accepted` ("Your answer was accepted"). Group by
conversation where possible.

### 4.7 Discovery: search, categories, tags, profiles

- **Search (`/search`).** There is no dedicated search endpoint, so the first
  iteration composes existing reads: filter `/threads/list`, `/categories/items`,
  `/tags/targets`, and `/posts/byAuthor` client-side, plus resolve a pasted
  `[[id]]`/`@user` directly. (Flag a backend `search` concept as a follow-up;
  see §9.)
- **Categories browser** — `/categories/list`; per category `/categories/items`.
  Staff create/delete via `/categories/create` / `/categories/delete` and
  curate membership with `/categories/assign` / `/categories/unassign`.
- **Tags** — a tag cloud or filter chips from `/tags/forTarget` aggregated over
  visible threads; tag pages via `/tags/targets`; create via `/tags/create`.
- **Profile (`/u/:user`)** — `/profiles/get` for display name/bio/avatar;
  `/posts/byAuthor` for activity; `/roles/forUser` to show badges (instructor,
  moderator). Own-profile editing via `/profiles/setDisplayName`,
  `/profiles/setBio`, `/profiles/setAvatar`.
- **Bookmarks (`/bookmarks`)** — `/bookmarks/list`; toggles via
  `/bookmarks/save` / `/bookmarks/unsave`; star state via `/bookmarks/isSaved`.
- **Watching (`/watching`)** — `/subscriptions/mine`; a "watchers" count on a
  thread from `/subscriptions/subscribers`.

### 4.8 Moderation & admin (`/staff`)

A dedicated surface, only mounted when `/roles/can` grants `moderate`/
`administer` in the `"forum"` context (and always during bootstrap).

- **Flag queue (`/staff`)** — `/flags/open` lists targets with open flags; for
  each, `/flags/forTarget` shows reporters and reasons; resolve with
  `/flags/resolve` `{ session, target, outcome }`. Note: any signed-in user can
  `/flags/raise`, so the "Report" affordance lives on every `PostActionBar`.
- **Locks (`/staff` tab)** — `/locks/list`; lock/unlock from the thread header
  or here via `/locks/lock` / `/locks/unlock`.
- **Trash (`/staff/trash`)** — `/trash/list` of soft-deleted items; restore with
  `/trash/restore`; permanently remove with `/trash/purge` (which the event
  syncs cascade into clearing formatting, reactions, tags, tracking, links, and
  the conversation node — so show a strong "this is irreversible" confirm).
  Trashing a post from the thread view → `/trash/trash`.
- **Pins** — staff can pin within a scope (conversation or category) when they
  hold the scope's `pin` capability: `/pins/pin` `{ item, scope, priority }`,
  reorder with `/pins/setPriority`, remove with `/pins/unpin`.
- **Roles & capabilities (`/staff/roles`)** — define roles
  (`/roles/define` `{ name, capabilities }`), grant/revoke per user+context
  (`/roles/grant` / `/roles/revoke`), and inspect with `/roles/forUser` and
  `/roles/can`. Present capabilities as a checkbox matrix
  (`administer` / `moderate` / `pin` / …) per role.

---

## 5. Component inventory (reusable building blocks)

| Component | Backed by |
| --- | --- |
| `MarkdownEditor` (with @ and [[ ]] autocomplete + preview) | `/threads/*`, `/posts/edit` |
| `PostNode` (recursive tree node) | `/threads/get` |
| `ReactionBar` | `/reactions/forTarget`, `/reactions/add`, `/reactions/remove` |
| `BacklinksPanel` / `ReferencesList` | `/links/backlinks`, `/links/forward` |
| `WatchToggle` | `/subscriptions/isSubscribed`, `/subscriptions/(un)subscribe` |
| `BookmarkStar` | `/bookmarks/isSaved`, `/bookmarks/save`, `/bookmarks/unsave` |
| `CategoryPicker` / `CategoryChip` | `/categories/*` |
| `TagPicker` / `TagChip` | `/tags/*` |
| `LockBadge` | `/locks/isLocked` |
| `PinBadge` / `PinControl` | `/pins/*` |
| `FlagButton` / `FlagQueueItem` | `/flags/*` |
| `NotificationBell` / `NotificationItem` | `/notifications/*` |
| `UnreadDot` | `/unread/count`, `/unread/markSeen` |
| `RevisionHistoryModal` | `/revisions/*` |
| `AcceptAnswerButton` / `ResolvedBadge` | `/resolutions/*` |
| `RoleMatrixEditor` | `/roles/*` |
| `CapabilityGate` (renders children only if `/roles/can`) | `/roles/can` |

`CapabilityGate` is the linchpin for moderation UX: it wraps any privileged
control and resolves once per (context, capability) with caching.

---

## 6. State management

- **Server cache layer.** Use a query/cache library (TanStack Query / SWR-style)
  keyed by endpoint+args. The existing typed SDK (`createClient<ForumApi>`)
  gives typed inputs/outputs and a `"error" in result` discriminator, so a thin
  `useApi(path, args)` wrapper over the SDK is enough.
- **Session.** Store the `session` token (returned by `/auth/login`) in memory +
  `localStorage`; hydrate identity from `/auth/me` on boot; clear on
  `/auth/logout`. A single `AuthProvider` exposes `user`, `username`, `profile`.
- **Capabilities.** Cache `/roles/can` results in an `AuthzProvider`, invalidated
  when roles change.
- **Normalized entities.** Posts, conversations, categories, tags, and profiles
  are referenced by id across many views; keep a normalized store so a reaction
  toggle or edit updates every place a post appears.
- **Optimistic updates** for reversible toggles: reactions, bookmarks, watch,
  mark-read, pin priority. Roll back on `{ error }`.
- **Cache invalidation map** (examples):

  | Mutation | Invalidate |
  | --- | --- |
  | `/threads/reply` | `/threads/get`, `/threads/list`, `/notifications/*` |
  | `/posts/edit` | the post node, `/revisions/list` |
  | `/reactions/add\|remove` | `/reactions/forTarget` for that target |
  | `/resolutions/accept` | `/resolutions/get`, thread view, feed badges |
  | `/trash/trash\|purge` | thread view, feeds, `/trash/list` |
  | `/roles/grant\|revoke` | every `/roles/can` cache entry for that user |

---

## 7. Real-time / refresh strategy

The API is request/response with no streaming endpoint, so:

- **Polling with backoff.** Poll `/notifications/unreadCount` and per-scope
  `/unread/count` on a slow cadence (e.g. 20–30s), faster while a thread is
  focused, paused when the tab is hidden (`visibilitychange`).
- **Focus/refetch.** Refetch the active `/threads/get` on window refocus and
  after any local mutation.
- **Mark-seen on view.** IntersectionObserver → `/unread/markSeen` so unread
  state converges without manual refresh.
- **Forward-compat:** isolate polling behind a `LiveUpdates` service so it can be
  swapped for SSE/WebSockets if the backend later adds a journal stream (the
  engine already has an action journal that event syncs react to).

---

## 8. Accessibility & resilient states

**Accessibility**

- The recursive reply tree should be a real ARIA `tree`/`treeitem` structure
  with arrow-key navigation and roving `tabindex`; collapse/expand exposed via
  `aria-expanded`.
- Server-rendered `rendered` HTML must be **sanitized** before injection and
  carry proper heading order; never trust it blindly even though it's
  server-produced.
- Notifications use an `aria-live="polite"` region for new arrivals; the bell
  badge has an accessible label ("3 unread notifications").
- All icon-only buttons (react, bookmark, flag, lock) need `aria-label`s and
  visible focus rings; reaction toggles expose `aria-pressed`.
- Composer autocomplete (`@`, `[[`) is an ARIA combobox with keyboard selection.

**Empty states**

| Screen | Empty copy / CTA |
| --- | --- |
| Latest feed (`/threads/list` empty) | "No conversations yet — start the first thread." |
| Thread with no replies | Invite to reply; show the root post prominently. |
| Notifications | "You're all caught up." |
| Bookmarks / Watching | Explain the star / watch affordances. |
| Flag queue empty | "No open flags. 🎉" |
| Trash empty | "Nothing in the trash." |
| Search no results | Offer to browse categories/tags instead. |
| Unclaimed forum | The onboarding "Claim this forum" card (§4.1). |

**Error states**

- Every SDK call returns either the payload or `{ error: string }` — never
  throws for backend/transport errors — so components branch on
  `"error" in result` and render inline, non-destructive error banners.
- **Authorization failures** (e.g. trashing without `moderate`, or an
  invalid/expired session) surface as `{ error }`; map "Invalid or expired
  session" to a re-login prompt, and capability errors to a quiet "you don't
  have permission" toast (the gating UI should have hidden the control anyway).
- **Lock conflicts:** replying to a now-locked thread returns an error → show a
  banner and refresh `/locks/isLocked`.
- **Optimistic rollback:** any failed reaction/bookmark/watch toggle reverts and
  toasts.
- **Loading skeletons** for thread trees and feeds; avoid layout shift by
  reserving space for avatars, badges, and reaction bars.

---

## 9. Notable gaps & follow-ups (frontend-driven backend asks)

These are places where the UI wants something the current endpoints don't
cleanly provide — worth raising as backend work:

1. **Search.** No `search` endpoint exists; discovery is composed client-side.
   A dedicated full-text endpoint over posts would replace the workaround in
   §4.7.
2. **Batch hydration.** Feeds need per-item resolved/pinned/unread state;
   today that's N calls. Batch query endpoints (or richer `/threads/list`
   payloads) would cut round-trips.
3. **Pagination/cursors.** `/threads/list`, `/posts/byAuthor`, and
   `/notifications/list` return full sets; infinite-scroll wants cursors.
4. **Live updates.** A server-push/journal stream would replace polling (§7).

None of these block a first version — the proposed UI is fully implementable on
the endpoints that exist today.

---

## 10. Suggested build order

1. **Shell + auth + onboarding** (`/auth/*`, bootstrap claim) — unblocks
   everything and exercises the unclaimed-forum path.
2. **Read path:** feeds (`/threads/list`) → thread view (`/threads/get`) with
   rendered HTML, reactions, backlinks.
3. **Write path:** composer for new threads/replies, `[[ ]]` + `@` autocomplete,
   edit/delete, revisions.
4. **Engagement:** notifications, unread tracking, subscriptions, bookmarks.
5. **Q&A:** resolutions (accept/clear) and resolved badges.
6. **Staff:** flag queue, locks, trash, pins, roles matrix.
7. **Polish:** categories/tags browsing, profiles, search, a11y pass, empty/
   error states, polling/refresh tuning.
