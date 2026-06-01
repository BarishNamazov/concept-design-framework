# Frontend Ideas — A Design System & Interaction-Design Proposal

*A companion document for the concept-design forum backend. Where a feature catalog
asks "what can we build?", this document asks "how should it feel, look, and respond?"
Every proposal below is anchored to an endpoint that already exists in `src/syncs/*.sync.ts`.*

---

## 1. Grounding in the real API

The backend exposes a flat, verb-per-path HTTP surface (all `POST`, JSON in / JSON out).
Before proposing pixels, here is the contract the UI actually has to honor. These are the
endpoints I enumerated directly from the sync files.

| Domain | Endpoints (from `src/syncs/`) | UI surface it powers |
| --- | --- | --- |
| Auth / identity | `/auth/register`, `/auth/login`, `/auth/logout`, `/auth/me`, `/auth/changePassword` | Session bootstrap, account menu |
| Threads & posts | `/threads/create`, `/threads/reply`, `/threads/get`, `/threads/list`, `/posts/get`, `/posts/edit`, `/posts/delete`, `/posts/byAuthor` | Feed, thread tree, composer, post cards |
| Links / backlinks | `/links/backlinks`, `/links/forward` | `[[id]]` reference chips, "Referenced by" panel |
| Categories | `/categories/create`, `/categories/delete`, `/categories/assign`, `/categories/unassign`, `/categories/list`, `/categories/items`, `/categories/forItem` | Left-nav taxonomy, category picker |
| Tags | `/tags/create`, `/tags/add`, `/tags/remove`, `/tags/targets`, `/tags/forTarget` | Tag pills, tag filter |
| Roles / capabilities | `/roles/define`, `/roles/grant`, `/roles/revoke`, `/roles/forUser`, `/roles/can` | Permission-gated affordances, admin |
| Locking | `/locks/lock`, `/locks/unlock`, `/locks/isLocked`, `/locks/list` | Lock badge, disabled composer |
| Trash / soft-delete | `/trash/trash`, `/trash/restore`, `/trash/purge`, `/trash/isTrashed`, `/trash/list` | Tombstones, moderation queue |
| Resolutions | `/resolutions/accept`, `/resolutions/clear`, `/resolutions/get`, `/resolutions/isResolved` | "Accepted answer" banner |
| Flags | `/flags/raise`, `/flags/resolve`, `/flags/open`, `/flags/forTarget` | Flag dialog, triage inbox |
| Pins | `/pins/pin`, `/pins/unpin`, `/pins/setPriority`, `/pins/forScope`, `/pins/isPinned` | Pinned banner, ordered top-of-scope |
| Reactions | `/reactions/add`, `/reactions/remove`, `/reactions/forTarget` | Reaction bar |
| Bookmarks | `/bookmarks/save`, `/bookmarks/unsave`, `/bookmarks/list`, `/bookmarks/isSaved` | Save toggle, "Saved" view |
| Subscriptions | `/subscriptions/subscribe`, `/subscriptions/unsubscribe`, `/subscriptions/mine`, `/subscriptions/isSubscribed`, `/subscriptions/subscribers` | Watch toggle, watching list |
| Notifications | `/notifications/list`, `/notifications/unreadCount`, `/notifications/markRead`, `/notifications/markAllRead`, `/notifications/dismiss` | Notification center |
| Unread tracking | `/unread/list`, `/unread/count`, `/unread/markSeen`, `/unread/markAllSeen` | Unread dots, "N new posts" |
| Profiles | `/profiles/get`, `/profiles/setDisplayName`, `/profiles/setBio`, `/profiles/setAvatar` | Profile page, hover card |
| Revisions | `/revisions/list`, `/revisions/get`, `/revisions/latest` | Edit history diff |

### Six API truths that drive the design

1. **Everything is a `POST` with a `session` token.** There is no REST resource hierarchy
   to mirror in the URL bar, so the *frontend* router — not the API — owns information
   architecture. The design system must impose the structure the API declines to.
2. **Thread reads are pre-assembled and ordered.** `/threads/get` returns
   `{ thread: ThreadNode[] }` where each node already carries `node, item, parent, depth,
   post, rendered`, with trashed nodes filtered out. The client renders a tree from a flat,
   depth-annotated list — no client-side reassembly of `parent → children` is required, but
   `depth` *is* the indentation contract.
3. **Backlinks are authored, not inferred.** `/threads/reply` parses `[[<id>]]` tokens
   server-side (`parseLinkTargets`, regex `\[\[([^\]]+)\]\]`) and calls `Linking.setLinks`.
   Mentions are a *separate* syntax — `@username` (`parseMentions`, regex `@([a-zA-Z0-9_]+)`)
   — handled by the events layer. The composer therefore needs **two distinct autocomplete
   grammars** with different trigger characters.
4. **Locks gate writes, not reads.** `/threads/reply` filters on `Locking._isLocked === false`
   and otherwise fails with `"This thread is locked."`. The UI must reflect lock state
   *before* the user types, not after they submit.
5. **Two parallel "unread" systems exist.** `/unread/*` (per-item `Tracking`, scoped to a
   conversation) and `/notifications/*` (per-recipient `Notifying`). The design must visually
   separate "new content in threads I'm in" from "things that happened to me."
6. **Capabilities are queryable.** `/roles/can { user, context, capability }` lets the client
   *predict* whether a write will succeed. Moderation affordances should be capability-gated
   at render time, with the server as the final authority.

---

## 2. Design language

The product is text-dense, reference-heavy, and moderation-aware — closer to a knowledge
base than a chat app. The language is named **"Quarry"**: stone-solid structure, with
seams of light where references connect.

### 2.1 Layout grid

- **Three-zone shell:** a `nav` rail (categories, tags, saved, watching), a `main` reading
  column, and a contextual `aside` (backlinks, subscribers, revision history).
- **Base grid:** 12 columns, `8px` baseline. Reading column capped at **`68ch`** for prose
  legibility; the thread tree is allowed to exceed this only via indentation gutters.
- **Indentation budget:** thread `depth` maps to a gutter of `min(depth, 6) × 16px`. Beyond
  depth 6, replies "fold flat" with a `↳ continuing from @author` breadcrumb rather than
  marching off-screen. This keeps deep `/threads/get` trees mobile-survivable.
- **Density modes:** `Comfortable` (default) and `Compact` (moderator/triage) toggle row
  padding via a single `--density` multiplier. Triage views default to Compact.

```
┌───────────┬───────────────────────────────┬──────────────┐
│  nav rail │  reading column (≤68ch)       │  aside       │
│  64–240px │  thread tree / feed / composer│  backlinks…  │
└───────────┴───────────────────────────────┴──────────────┘
```

### 2.2 Typography

| Token | Role | Spec |
| --- | --- | --- |
| `--font-ui` | Chrome, labels, badges | Inter / system-ui, 14px base |
| `--font-prose` | Post bodies (rendered HTML from `Formatting`) | 16px / 1.6, optical sizing on |
| `--font-mono` | `[[ids]]`, code, revision diffs | ui-monospace, 13.5px |

- A **modular scale** of 1.2 (minor third): 12 · 14 · 16 · 19 · 23 · 28 · 33.
- Rendered post HTML is sandboxed inside a `.prose` scope with a hard reset so
  server-rendered markdown can never leak styles into the chrome.
- Monospace is reserved as a *semantic* cue: anything monospaced is a machine identifier
  (a `[[link target]]`, a post id, a revision number from `/revisions/get`).

### 2.3 Color & theming

Tokens are defined as HSL triplets so dark mode is a channel flip, not a second palette.

| Semantic token | Light | Dark | Used by |
| --- | --- | --- | --- |
| `--bg` | `0 0% 100%` | `222 18% 11%` | app background |
| `--surface` | `220 20% 98%` | `222 16% 15%` | cards, composer |
| `--text` | `222 20% 18%` | `220 16% 90%` | prose |
| `--accent` | `222 80% 52%` | `222 75% 66%` | links, primary actions |
| `--link-ref` | `265 60% 52%` | `265 70% 72%` | `[[backlink]]` chips |
| `--success` | `150 55% 40%` | `150 50% 55%` | accepted resolution |
| `--warning` | `38 92% 50%` | `38 90% 60%` | flags, pending triage |
| `--danger` | `0 72% 50%` | `0 70% 62%` | trash, purge, locked |
| `--muted` | `222 10% 46%` | `220 10% 58%` | timestamps, meta |

- **Dark mode** is the default-respecting `prefers-color-scheme`, with a manual override
  persisted in `localStorage` and exposed in the account menu.
- **State is never color-only.** Locked = `--danger` *plus* a padlock glyph *plus* the word
  "Locked"; accepted answer = `--success` *plus* a check *plus* a label (see §6, accessibility).
- A **"reference highlight"** accent (`--link-ref`, violet) is intentionally distinct from
  the action accent (blue), so an authored `[[id]]` never looks like a button.

### 2.4 Iconography

A single 1.5px-stroke, 24px line set (e.g. Lucide-style) for visual coherence. Mapped to
the domain so an icon always implies the same endpoint family:

| Icon | Meaning | Endpoint family |
| --- | --- | --- |
| 🔒 padlock | locked thread | `/locks/*` |
| 🗑 trash | soft-deleted / tombstone | `/trash/*` |
| 🚩 flag | flagged content | `/flags/*` |
| ✓ check-seal | accepted answer | `/resolutions/*` |
| 📌 pin | pinned in scope | `/pins/*` |
| 🔖 bookmark | saved | `/bookmarks/*` |
| 👁 eye | watching | `/subscriptions/*` |
| 🔗 link | `[[backlink]]` | `/links/*` |
| 🕘 history | revisions | `/revisions/*` |
| 🔔 bell | notifications | `/notifications/*` |

### 2.5 Component library

A headless-logic + styled-skin split so behavior is testable and theming is swappable.

- **`<PostCard>`** — avatar (`/profiles/get`), display name, `createdAt`/`editedAt`,
  rendered prose, a **status ribbon** (composes lock/trash/flag/accepted badges), a
  reaction bar (`/reactions/forTarget`), and an overflow `⋯` menu of capability-gated
  actions. The single most reused atom.
- **`<ThreadTree>`** — consumes the flat depth-annotated `ThreadNode[]` from `/threads/get`,
  draws connector rails, supports collapse/expand per subtree, and virtualizes long threads.
- **`<Composer>`** — markdown textarea with dual autocomplete (`[[` and `@`), live preview,
  draft autosave, and a lock-aware disabled state (§4.1).
- **`<NotificationCenter>`** — bell + dropdown panel backed by `/notifications/list` and
  `/notifications/unreadCount`; "Mark all read" maps to `/notifications/markAllRead`.
- **`<ModerationBadge>`** — a polymorphic badge (lock / trash / flag / pin / accepted)
  with consistent shape, tooltip, and `aria-label`.
- **`<RefChip>`** — renders a `[[id]]` as a hoverable chip that previews the target post
  via `/posts/get` and links into the thread.
- **`<BacklinkPanel>`** — the aside list of "Referenced by," fed by `/links/backlinks`.
- **`<FlagInbox>` / `<TrashQueue>`** — moderator data tables (Compact density) over
  `/flags/open` and `/trash/list`.
- **`<RevisionDiff>`** — side-by-side or inline diff from `/revisions/list` + `/revisions/get`.
- **`<TagPill>` / `<CategoryNavItem>` / `<RoleChip>`** — taxonomy and identity atoms.
- **`<Toast>` / `<UndoToast>`** — the backbone of optimistic updates and the lever that
  makes soft-delete feel safe (§4.2).

---

## 3. Information architecture & navigation

Because the API has no URL hierarchy, the client owns routing:

- `/c/:category` → `/categories/items`
- `/t/:conversation` → `/threads/get`
- `/u/:user` → `/profiles/get` + `/posts/byAuthor`
- `/saved` → `/bookmarks/list` · `/watching` → `/subscriptions/mine`
- `/mod/flags` → `/flags/open` · `/mod/trash` → `/trash/list` (capability-gated by `/roles/can`)

Pinned items (`/pins/forScope`, ordered by `setPriority`) render as a sticky band above
the feed within each scope; their ordering is the explicit `priority` value, not recency.

---

## 4. Key interaction flows (step by step)

### 4.1 Composing a reply with `[[backlinks]]` autocomplete

The composer carries **two grammars**, mirroring the backend's two parsers.

1. **Open.** `<Composer>` mounts under the target post. On mount, call `/locks/isLocked`
   for the conversation. If locked, render a disabled textarea with a 🔒 "This thread is
   locked" inline banner — *never* let the user type into a doomed submit.
2. **Type `[[`.** A popover opens. Keystrokes query a reference index (post titles/ids);
   selection inserts `[[<id>]]` as a styled `<RefChip>` token in `--link-ref`. This exactly
   matches the server regex `\[\[([^\]]+)\]\]`, so what the user composes is what
   `parseLinkTargets` will extract.
3. **Type `@`.** A *different* popover opens, filtered to usernames matching `[a-zA-Z0-9_]+`
   (the `parseMentions` grammar). Visual treatment differs from `[[ ]]` so users learn that
   mention = notify-a-person, backlink = connect-a-post.
4. **Preview.** A live pane renders the same markdown the server's `Formatting` concept will
   render, including chip and mention styling, so there are no submit-time surprises.
5. **Submit.** `POST /threads/reply { session, parent, content }`. Optimistically append the
   new node at `parent.depth + 1` with a "sending…" shimmer.
6. **Reconcile.** On success, swap in the real `{ post, node }`. The server has now created
   the links (`Linking.setLinks`) and queued mention/watcher notifications (events layer);
   refresh the aside `<BacklinkPanel>` for any post the new reply pointed at.
7. **Failure.** If the response is `"This thread is locked."` (a race), roll back the
   optimistic node and surface a toast with a "Copy your draft" affordance so nothing is lost.

> **Why two autocompletes matter:** the backend treats `[[id]]` and `@user` as semantically
> different. Collapsing them into one "mention" UX would mislead authors about whether they
> are *linking knowledge* or *pinging a human*.

### 4.2 Moderating: lock / trash / restore

Moderation actions are **capability-gated** and **reversible-by-default**.

1. **Gate.** Before rendering the `⋯` menu, call `/roles/can { user, context, capability }`
   (cache per context). Hide — don't merely disable — actions the user can't perform, to keep
   the surface honest.
2. **Lock.** `POST /locks/lock { session, target }`. Optimistically stamp the thread header
   with a 🔒 badge and disable every descendant composer in place. Unlock mirrors via
   `/locks/unlock`.
3. **Trash (soft-delete).** `POST /trash/trash { session, item }`. The post collapses into a
   **tombstone** ("Removed by moderator · Undo") rather than vanishing — consistent with the
   backend's soft-delete model where `/trash/restore` and `/trash/purge` still exist. Show an
   `<UndoToast>` for ~8s wired to `/trash/restore`.
4. **Restore.** `POST /trash/restore { session, item }` expands the tombstone back to a full
   `<PostCard>`. Because `/threads/get` filters trashed nodes server-side, a restore in the
   moderation queue triggers a thread refetch to re-thread the node at its `depth`.
5. **Purge.** `POST /trash/purge` is the only destructive, irreversible action. It requires a
   typed-confirmation modal ("type PURGE") and is styled exclusively in `--danger`. The events
   layer hard-deletes the post and cascades cleanup; the UI reflects this as a permanent
   removal with no undo.

| Action | Endpoint | Reversible? | UI affordance |
| --- | --- | --- | --- |
| Lock | `/locks/lock` | yes (`/locks/unlock`) | badge + disabled composers |
| Trash | `/trash/trash` | yes (`/trash/restore`) | tombstone + undo toast |
| Restore | `/trash/restore` | n/a | re-expand + refetch thread |
| Purge | `/trash/purge` | **no** | typed-confirm danger modal |

### 4.3 Accepting a resolution (best answer)

1. **Eligibility.** On a question-rooted thread, the asker (or a capability holder) sees an
   "Accept answer" affordance on each reply. Gate it with `/resolutions/isResolved { question }`
   so an already-resolved thread shows the current accepted answer instead.
2. **Accept.** `POST /resolutions/accept { session, question, answer }`. Optimistically:
   - pin a `✓ Accepted answer` banner (`--success`) to the chosen reply,
   - float that reply to the top of the answers under the question root,
   - badge the thread row in the feed so list views show resolution at a glance.
3. **Notify.** The events layer (`NotifyAcceptedAnswer`) notifies the answer's author; the
   notification center reflects it on next `/notifications/list`.
4. **Change of mind.** "Unaccept" → `POST /resolutions/clear { session, question }`, which
   removes the banner and restores natural ordering. Both accept and clear can fail with
   `"Not authorized…"`; on failure, roll back and toast.

### 4.4 Triaging flags

A dedicated, Compact-density moderator surface — *not* inline noise for everyone.

1. **Inbox.** `POST /flags/open { session }` lists targets with open flags. Render as a table:
   target preview · flag count · most-recent reason · age.
2. **Drill in.** Selecting a row calls `/flags/forTarget { target }` to show every reason and
   reporter, plus the target's current lock/trash state.
3. **Act.** From the row, a moderator can lock (`/locks/lock`), trash (`/trash/trash`), or
   resolve the flag directly.
4. **Resolve.** `POST /flags/resolve { session, target, outcome }` removes the item from the
   open queue. The decision (`outcome`) is shown as a resolution chip in an audit trail.
5. **Live count.** A 🚩 badge on the mod-nav item reflects `/flags/open` length and decrements
   optimistically as items are resolved, so the queue "drains" visibly.

### 4.5 Managing notifications & unread

Two distinct surfaces, deliberately separated:

- **Notification center (per-person events).** Bell badge polls `/notifications/unreadCount`
  (or subscribes if a stream exists). Opening the panel calls `/notifications/list`. Clicking
  an item marks it read (`/notifications/markRead`) and routes to the source post; "Mark all
  read" → `/notifications/markAllRead`; swipe/✕ → `/notifications/dismiss`. Read items fade to
  `--muted`; the badge clears optimistically.
- **Unread indicators (per-thread content).** Thread rows and in-tree posts show unread dots
  from `/unread/count` and `/unread/list { scope }`. Scrolling a post into view fires a
  debounced `/unread/markSeen { item }`; a thread-level "Mark all read" maps to
  `/unread/markAllSeen { scope }`. The "N new posts" jump-bar inside a thread is powered here,
  *not* by notifications.

---

## 5. Responsiveness, shortcuts, optimism & micro-interactions

### 5.1 Responsive / mobile

| Breakpoint | Shell behavior |
| --- | --- |
| `≥1200px` | full three-zone (nav · reading · aside) |
| `768–1199px` | aside collapses into tabs above the thread (Backlinks / History / Subscribers) |
| `<768px` | nav becomes a bottom tab bar; aside becomes a swipe-up sheet; thread gutters cap earlier (depth 4) and switch to "fold-flat" breadcrumbs |

- The composer becomes a **sticky bottom sheet** on mobile; autocomplete popovers dock above
  the keyboard.
- Moderation actions move into a long-press context sheet rather than a hover `⋯` menu.
- Touch targets ≥ 44×44px; reaction bar collapses to a single "react" trigger that expands.

### 5.2 Keyboard shortcuts

| Key | Action | Endpoint |
| --- | --- | --- |
| `j` / `k` | next / previous post in thread | — |
| `r` | reply to focused post | opens `<Composer>` → `/threads/reply` |
| `e` | edit own focused post | `/posts/edit` |
| `b` | bookmark toggle | `/bookmarks/save` · `/bookmarks/unsave` |
| `s` | subscribe/watch toggle | `/subscriptions/subscribe` · `/unsubscribe` |
| `a` | accept focused answer (if eligible) | `/resolutions/accept` |
| `m` | mark thread read | `/unread/markAllSeen` |
| `g` then `f` | go to flag inbox (mods) | `/flags/open` |
| `⌘/Ctrl+Enter` | submit composer | `/threads/create` · `/threads/reply` |
| `?` | shortcut cheat-sheet overlay | — |

`[[` and `@` inside the composer are *content* triggers, never global shortcuts, so authoring
never collides with navigation. A focus ring is always visible during keyboard navigation.

### 5.3 Optimistic updates

Default to optimistic for low-risk, reversible writes; pessimistic for destructive ones.

| Action | Strategy | Rollback signal |
| --- | --- | --- |
| Reaction add/remove | optimistic | server error → revert count |
| Bookmark / subscribe | optimistic | error → toast + revert toggle |
| Reply create | optimistic (shimmer node) | `"locked"` / error → remove node, keep draft |
| Trash / restore | optimistic + undo toast | error → re-expand/revert |
| Accept / clear resolution | optimistic banner | `"Not authorized"` → revert |
| Purge | **pessimistic** (await server) | spinner until confirmed |

Each optimistic mutation carries a client `requestId`; reconciliation matches the server
response to retire the placeholder, preventing duplicate nodes on slow networks.

### 5.4 Micro-interactions

- **Reaction pop:** spring-scale `1 → 1.25 → 1` with a count roll-up.
- **Backlink pulse:** when a new `[[id]]` lands, the *target* post (if on screen) briefly
  glows `--link-ref` — making the act of connecting knowledge visible.
- **Tombstone collapse:** trashed posts ease to half-height and desaturate rather than
  disappearing abruptly.
- **Accept seal:** the `✓` badge draws on with a check-stroke animation.
- **Unread dot:** fades, doesn't pop, when `/unread/markSeen` succeeds.
- All motion respects `prefers-reduced-motion` (crossfade-only fallback).

---

## 6. Accessibility (WCAG 2.2 AA)

- **Contrast:** all token pairs target ≥ 4.5:1 for text, ≥ 3:1 for UI/graphics, verified in
  both themes. `--muted` on `--surface` is held to 4.5:1, not just "looks gray enough."
- **Never color-only:** lock/trash/flag/accepted each combine color + icon + text label, so
  status survives color blindness and grayscale.
- **Thread tree semantics:** render as a `role="tree"` with `aria-level` = node `depth`,
  `aria-expanded` on collapsible subtrees, and roving `tabindex` for `j/k` navigation.
- **Composer:** the `[[` / `@` popovers follow the ARIA combobox pattern (`aria-activedescendant`,
  `aria-controls`); selections are announced via a polite live region.
- **Optimistic + async:** toasts and "sending…" states post to `aria-live="polite"`; errors to
  `assertive`. Notification count changes are announced, not silent.
- **Focus management:** modals (purge confirm, flag dialog) trap focus and restore it on close;
  skip-link jumps to the reading column.
- **Tap/keyboard parity:** every long-press mobile action has a keyboard equivalent.

---

## 7. Internationalization

- **Message catalogs**, not concatenation. Server strings like `"This thread is locked."` and
  `"Not authorized to resolve flags."` are mapped to client i18n keys (e.g.
  `error.thread.locked`) so the UI is never hostage to backend copy and can localize freely.
- **ICU plurals** for the many counts in this API — `/notifications/unreadCount`,
  `/unread/count`, flag counts, reaction counts ("1 reply" vs "5 replies").
- **Relative time** (`createdAt`, `editedAt`) localized via `Intl.RelativeTimeFormat`, with an
  absolute timestamp on hover/focus.
- **RTL:** logical CSS properties (`margin-inline-start`) so thread indentation gutters mirror
  correctly; connector rails flip side.
- **Identifier safety:** `[[id]]` and `@username` grammars are ASCII-bound on the backend
  (`[a-zA-Z0-9_]+`), so autocomplete must display localized labels while inserting the raw
  ASCII token the parser expects — never localize the token itself.

---

## 8. Performance budgets

| Budget | Target |
| --- | --- |
| First Contentful Paint (mid-tier mobile, 4G) | < 1.8 s |
| Time to Interactive | < 3.5 s |
| Initial JS (gzipped) | < 180 KB |
| Route-level chunk | < 60 KB |
| Interaction latency (optimistic action → paint) | < 100 ms |
| Long thread (`/threads/get`, 500+ nodes) scroll | 60 fps via virtualization |

Tactics tied to the API:

- **Virtualize `<ThreadTree>`** — `/threads/get` can return large flat arrays; render only the
  visible depth-window plus an overscan band.
- **Batch & cache capability checks** — `/roles/can` results are cached per `(user, context,
  capability)`; never call it per render of a `⋯` menu.
- **Coalesce `markSeen`** — debounce `/unread/markSeen` into batched intervals while scrolling
  instead of one request per post.
- **Prefetch on intent** — hovering a `<RefChip>` warms `/posts/get` for the target; hovering a
  thread row warms `/threads/get`.
- **Separate poll cadences** — `/notifications/unreadCount` and `/unread/count` poll on a slow
  background timer (or a single multiplexed stream), distinct from foreground reads.
- **Skeletons over spinners** for `<PostCard>` and `<ThreadTree>` so layout is stable and
  cumulative layout shift stays ≈ 0.

---

## 9. Two original, system-level ideas

1. **The Reference Graph aside.** Because backlinks are *authored* (`[[id]]` → `Linking`) and
   queryable both directions (`/links/backlinks`, `/links/forward`), the aside can render a
   tiny live force-graph of a post's neighborhood. It turns an invisible data relationship into
   a first-class navigational surface unique to this backend — most forums can't do this because
   they only infer links, they don't store them.

2. **A unified "Moderation Lens" overlay.** A single toggle (capability-gated via `/roles/can`)
   that re-skins the whole reading view into Compact density and surfaces every governance
   signal at once: lock state (`/locks/list`), trash tombstones (`/trash/list`), open flags
   (`/flags/open`), and pin priorities (`/pins/forScope`). Instead of five separate admin pages,
   moderation becomes a *mode* layered over the content moderators already know — one lens, four
   endpoints, zero context-switching.

---

*Every visual and interaction decision above traces back to a concrete endpoint in
`src/syncs/`. The throughline: this backend stores governance and references as
first-class, authored data — so the frontend's job is to make that structure feel
tangible, reversible, and humane.*
