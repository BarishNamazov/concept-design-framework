# Frontend product ideas for the concept-design forum

This backend is not just a message board API; it is a composable discussion system with threads, posts, rendered markdown, `[[post-id]]` links/backlinks, notifications, subscriptions, accepted answers, flags, locks, pins, categories, tags, roles/capabilities, soft-delete trash, revisions, bookmarks, reactions, and unread tracking. A strong frontend should make those concepts feel like one coherent community workflow rather than a pile of controls.

## Product thesis

Build a forum that feels like a **living knowledge workspace**:

- Threads are conversations, but also durable answers and reference nodes.
- `[[backlinks]]` turn useful posts into a lightweight knowledge graph.
- Moderation is visible, calm, and procedural: report, triage, lock, trash, restore.
- Roles/capabilities let a small team bootstrap the forum and delegate trust over time.

The frontend should optimize for three outcomes:

1. **A new member can safely ask or answer within minutes.**
2. **A returning contributor can catch up without scanning everything.**
3. **Moderators/admins can keep the space healthy without leaving the product.**

## Grounding: actual HTTP surface

All endpoints appear to be POST-style `defineEndpoint` routes.

| Area | Key endpoints the UI should use |
| --- | --- |
| Auth/session | `/auth/register`, `/auth/login`, `/auth/logout`, `/auth/me`, `/auth/changePassword` |
| Profiles | `/profiles/get`, `/profiles/setDisplayName`, `/profiles/setBio`, `/profiles/setAvatar` |
| Threads/posts | `/threads/create`, `/threads/reply`, `/threads/get`, `/threads/list`, `/posts/get`, `/posts/edit`, `/posts/delete`, `/posts/byAuthor` |
| Knowledge links | `/links/backlinks`, `/links/forward` |
| Notifications/unread | `/notifications/list`, `/notifications/unreadCount`, `/notifications/markRead`, `/notifications/markAllRead`, `/notifications/dismiss`, `/unread/list`, `/unread/count`, `/unread/markSeen`, `/unread/markAllSeen` |
| Subscriptions/bookmarks | `/subscriptions/subscribe`, `/subscriptions/unsubscribe`, `/subscriptions/mine`, `/subscriptions/isSubscribed`, `/subscriptions/subscribers`, `/bookmarks/save`, `/bookmarks/unsave`, `/bookmarks/list`, `/bookmarks/isSaved` |
| Resolution/Q&A | `/resolutions/accept`, `/resolutions/clear`, `/resolutions/get`, `/resolutions/isResolved` |
| Curation | `/categories/create`, `/categories/delete`, `/categories/assign`, `/categories/unassign`, `/categories/list`, `/categories/items`, `/categories/forItem`, `/tags/create`, `/tags/add`, `/tags/remove`, `/tags/targets`, `/tags/forTarget`, `/pins/pin`, `/pins/unpin`, `/pins/setPriority`, `/pins/forScope`, `/pins/isPinned` |
| Trust and safety | `/flags/raise`, `/flags/resolve`, `/flags/open`, `/flags/forTarget`, `/locks/lock`, `/locks/unlock`, `/locks/isLocked`, `/locks/list`, `/trash/trash`, `/trash/restore`, `/trash/purge`, `/trash/list`, `/trash/isTrashed` |
| Roles/admin | `/roles/define`, `/roles/grant`, `/roles/revoke`, `/roles/forUser`, `/roles/can` |
| History/social context | `/revisions/list`, `/revisions/get`, `/revisions/latest`, `/reactions/add`, `/reactions/remove`, `/reactions/forTarget` |

Notable backend behavior the frontend should respect:

- `/threads/get` returns an ordered, enriched thread with rendered content and hides soft-deleted posts.
- `/threads/list` is newest-first and hides soft-deleted root posts.
- `/threads/reply` fails when the conversation is locked.
- `/posts/edit` and `/posts/delete` are author-only; `/posts/delete` fails if the post has replies.
- `[[id]]` references are parsed into forward links/backlinks on replies and edits via `/links/forward` and `/links/backlinks`.
- `@username` mentions, replies, subscribed thread replies, and accepted answers create notifications.
- Admin/moderation gates are capability-based: `administer`, `moderate`, and scoped `pin` are important UI permission checks via `/roles/can`.
- A bootstrap rule exists: before anyone has global `administer` capability in forum context, privileged admin actions are open so the first operator can claim the forum.

## Target personas and jobs-to-be-done

| Persona | Core jobs | Product promise |
| --- | --- | --- |
| New member | Create an account, understand norms, ask a first question, know if anyone responded | “I can participate without learning forum mechanics first.” |
| Active contributor | Track replies/mentions, answer questions, link prior discussions, build reputation through useful posts | “I can move fast from notification to useful contribution.” |
| Moderator | See reported content, inspect context, resolve flags, lock or trash content, restore mistakes | “I can keep order with a clear paper trail and minimal drama.” |
| Admin | Bootstrap roles, define capabilities, create categories, delegate moderators, maintain structure | “I can shape the community safely as it grows.” |

## Information architecture

### Primary navigation

1. **Home / Latest**
   - Backed by `/threads/list`.
   - Cards show title-like first line, author, age, category from `/categories/forItem`, tags from `/tags/forTarget`, resolved state from `/resolutions/isResolved`, lock/pin state from `/locks/isLocked` and `/pins/isPinned`.

2. **Categories**
   - `/categories/list` for the directory.
   - Category page uses `/categories/items`, then hydrates each item with `/posts/get` or maps items back to conversations where possible.
   - Pin board per category/scope with `/pins/forScope`.

3. **Inbox**
   - Notification feed from `/notifications/list` and badge from `/notifications/unreadCount`.
   - “Unread in my spaces” from `/unread/list` and `/unread/count` scoped to a conversation/category.

4. **Knowledge graph**
   - A post detail sidebar with “References” from `/links/forward` and “Mentioned by” from `/links/backlinks`.
   - Later: visual graph, but MVP can be a compact bidirectional list.

5. **Saved**
   - `/bookmarks/list`; save affordance via `/bookmarks/save` and `/bookmarks/unsave`.

6. **Moderation**
   - Flag queue from `/flags/open`.
   - Trash queue from `/trash/list`.
   - Locked threads list from `/locks/list`.

7. **Admin**
   - Role/capability studio via `/roles/define`, `/roles/grant`, `/roles/revoke`, `/roles/forUser`, `/roles/can`.
   - Category management via `/categories/create` and `/categories/delete`.

### Thread page layout

- **Center:** hierarchical conversation from `/threads/get`.
- **Top rail:** subscribe, bookmark, category, tags, resolved status, lock status.
- **Composer:** markdown editor with previews, `@mention` hints, and `[[post-id]]` link helper.
- **Right sidebar:** backlinks, forward links, revisions, reactions, moderation controls when authorized.
- **Footer controls:** mark thread seen with `/unread/markAllSeen`, subscribe/unsubscribe, related posts.

## Journey 1: onboarding and first post

### User story

A new member arrives from a shared link, registers, fills in a lightweight profile, browses a few recent threads, and posts a first question.

### Flow

1. **Register** with `/auth/register` using `username`, `password`, and `displayName`.
2. Immediately call `/auth/login` if registration does not return a session, then cache `session` client-side.
3. Confirm identity with `/auth/me` and prompt for optional profile polish through `/profiles/setBio` and `/profiles/setAvatar`.
4. Show “Start here” latest threads from `/threads/list` plus category chips from `/categories/list`.
5. Create first post with `/threads/create`.
6. Let the user optionally categorize or tag it:
   - `/categories/assign`
   - `/tags/create` if needed, then `/tags/add`
7. Offer “notify me about replies” using `/subscriptions/subscribe` on the returned `conversation`.

### Product ideas

- **First-post coach:** a composer checklist: “clear title in first line,” “what have you tried,” “expected vs actual,” “add `[[related-post-id]]` if this builds on something.”
- **Identity confidence:** after `/auth/register`, show the generated profile card and let them edit before posting.
- **Soft permission hints:** before showing category admin controls, check `/roles/can` for `administer` or `moderate`.

### Success metrics

| Metric | Why it matters |
| --- | --- |
| Registration-to-first-post conversion | Measures whether onboarding is lightweight enough. |
| First post completion time | Detects composer/profile/category friction. |
| Percent of first posts with category/tag | Measures whether users can place content correctly. |
| Reply rate to first posts | Measures newcomer activation and community health. |

## Journey 2: daily catch-up through notifications and unread state

### User story

An active contributor opens the forum for ten minutes and wants to know exactly where they are needed.

### Flow

1. Badge the nav with `/notifications/unreadCount`.
2. Load actionable inbox items from `/notifications/list`.
3. Group notifications by kind: `reply`, `mention`, `accepted`, and subscription updates.
4. Deep-link each notification to `/posts/get` or the containing thread via `/threads/get` if the client can resolve the conversation.
5. Provide batch controls:
   - `/notifications/markRead`
   - `/notifications/markAllRead`
   - `/notifications/dismiss`
6. For spaces the user follows, show unread counts via `/unread/count` and “catch up” lists via `/unread/list`.
7. When a user reads a post, call `/unread/markSeen`; when they finish a thread/scope, call `/unread/markAllSeen`.

### Product ideas

- **Triage inbox, not activity feed:** tabs for “Needs me” (`@mention`, direct reply), “Following,” and “Resolved/accepted.”
- **One-click closure:** a notification card can mark read after the user expands the post preview, not only after navigation.
- **Catch-up digest:** “3 replies in threads you follow, 1 answer accepted, 2 mentions.”

### Success metrics

| Metric | Why it matters |
| --- | --- |
| Notification open-to-action rate | Shows whether inbox cards lead to replies/reads. |
| Median unread age | Should fall as catch-up improves. |
| Mark-all-read usage without immediate re-open | Indicates users trust the inbox grouping. |
| Subscription retention | Shows if following threads remains useful instead of noisy. |

## Journey 3: deep discussion with `[[backlinks]]`

### User story

A contributor is answering a recurring question and wants to connect the answer to prior discussions so the forum becomes smarter over time.

### Flow

1. User opens a thread via `/threads/get`.
2. Composer supports `[[post-id]]` references; backend parses them on `/threads/reply` and `/posts/edit`.
3. After posting, hydrate the post sidebar:
   - `/links/forward` for referenced posts.
   - `/links/backlinks` for posts that cite this one.
4. Show original and rendered content through `/posts/get` and revisions through `/revisions/list` or `/revisions/latest`.
5. Let users save important nodes with `/bookmarks/save` and react via `/reactions/add`.

### Product ideas

- **Backlink preview cards:** when typing `[[`, offer recently viewed posts and bookmarked posts; show a preview before insert.
- **“This has been discussed” rail:** backlinks become a non-judgmental duplicate detector.
- **Answer trails:** for any accepted answer, show “cited by” backlinks to reveal whether it became canonical.
- **Version trust:** a small “edited” affordance opens `/revisions/list`, making living answers safe to improve.

### Current backend gap and coping strategy

There is no search endpoint, no “recently viewed” endpoint, and no endpoint to look up posts by text/title. The UI can cope in MVP by:

- Letting users paste exact post IDs inside `[[...]]`.
- Offering references from local browser history, current thread posts, `/bookmarks/list`, and `/posts/byAuthor` for the current profile.
- Adding a client-side filter over already loaded `/threads/list` and `/threads/get` results.

Longer term, add backend search for posts, users, tags, and categories.

### Success metrics

| Metric | Why it matters |
| --- | --- |
| Percent of replies with `[[...]]` references | Measures knowledge-graph adoption. |
| Backlink click-through rate | Shows whether links help discovery. |
| Duplicate-question deflection | If measurable, shows discussions are being reused. |
| Revision views on linked answers | Indicates users audit evolving canonical content. |

## Journey 4: getting a question resolved

### User story

A member asks a question, receives several replies, and marks the best one as accepted so future readers can find the answer quickly.

### Flow

1. Thread creator posts question through `/threads/create`.
2. Replies arrive through `/threads/reply`; asker and subscribers receive notifications.
3. UI calls `/resolutions/isResolved` and `/resolutions/get` to display current state.
4. The asker or authorized user accepts an answer with `/resolutions/accept` using `question` and `answer`.
5. Backend sends an accepted-answer notification to the answer author.
6. If the answer is no longer correct, clear with `/resolutions/clear`.

### Product ideas

- **Question mode:** a composer toggle that labels the thread as “needs answer” and makes the accept control prominent. Since the backend does not have a thread type endpoint, MVP can infer this through tags such as `question` via `/tags/add`.
- **Accepted-answer banner:** pin the accepted reply visually at the top while preserving chronological thread order below.
- **Resolution nudge:** if a thread has replies but no resolution after a few days, show the author a private prompt.
- **Contributor celebration:** accepted notification should feel rewarding, not transactional.

### Success metrics

| Metric | Why it matters |
| --- | --- |
| Question resolution rate | Core Q&A health metric. |
| Time to accepted answer | Tracks usefulness of contributor activity. |
| Accepted-answer notification engagement | Measures whether recognition brings contributors back. |
| Clear/reaccept rate | Indicates whether accepted answers stay accurate. |

## Journey 5: reporting and triaging content with flags

### User story

A member sees problematic content, reports it, and moderators process the report with context and consistent outcomes.

### Flow

1. Member raises a report from a post menu using `/flags/raise` with `target` and `reason`.
2. The post’s report state can be shown with `/flags/forTarget`.
3. Moderators open the queue via `/flags/open`.
4. Queue cards hydrate context using `/posts/get`, `/threads/get`, `/profiles/get`, `/revisions/list`, `/links/backlinks`, and `/reactions/forTarget`.
5. Moderator chooses an outcome with `/flags/resolve`.
6. If needed, moderator uses adjacent tools:
   - `/locks/lock` to stop escalation.
   - `/trash/trash` to soft-delete content.
   - `/trash/restore` if the action was wrong.
   - `/trash/purge` for permanent removal.

### Product ideas

- **Report drawer:** reporting should not require leaving the thread. Include reason presets plus free text.
- **Moderator case file:** one page combining post, author profile, revision history, backlinks, existing flags, and lock/trash status.
- **Outcome language:** standard choices like “no violation,” “edited by author,” “removed,” “locked thread,” “spam purge.” Store actual text in `outcome`.
- **Transparency without pile-ons:** regular users see “reported” only if they reported it; moderators see aggregate reports.

### Success metrics

| Metric | Why it matters |
| --- | --- |
| Flag resolution time | Primary moderation SLA. |
| Percent of flags resolved without trash/lock | Helps tune norms and false-positive rates. |
| Repeat flags on same target after resolution | Detects poor outcomes. |
| Restore-after-trash rate | Measures moderation reversibility and mistakes. |

## Journey 6: moderation and admin bootstrap

### User story

A brand-new forum operator claims the space, creates roles, delegates moderators, sets categories, then uses locks/trash to manage risk.

### Flow

1. First operator registers/logs in through `/auth/register` and `/auth/login`.
2. Because the backend bootstrap gate is open until an admin exists, the operator defines an admin role through `/roles/define` with `capabilities: ["administer", "moderate"]`.
3. Grant that role to themselves in global `forum` context via `/roles/grant`.
4. Confirm with `/roles/can` for `administer` and `/roles/forUser`.
5. Create initial categories through `/categories/create`.
6. Define a moderator role with `moderate` and grant it via `/roles/grant`.
7. Moderators can curate:
   - Assign categories with `/categories/assign` and `/categories/unassign`.
   - Lock/unlock with `/locks/lock` and `/locks/unlock`.
   - Trash/restore/purge with `/trash/trash`, `/trash/restore`, `/trash/purge`.
8. Use `/locks/list` and `/trash/list` as operational dashboards.

### Product ideas

- **Claim-this-forum wizard:** if `/roles/can` or `/roles/forUser` suggests no admin setup, show a guarded first-run wizard explaining that the first admin claim is permanent in practice.
- **Capability recipes:** instead of raw arrays first, offer templates: Admin (`administer`, `moderate`), Moderator (`moderate`), Curator (`pin` in selected scope).
- **Danger zones with recovery:** trash is reversible; purge is permanent. The UI should make `/trash/trash` the default and hide `/trash/purge` behind a second confirmation.
- **Lock banner:** locked threads should clearly say why replying is unavailable, especially because `/threads/reply` will fail with “This thread is locked.”

### Success metrics

| Metric | Why it matters |
| --- | --- |
| Successful first admin claim | Validates bootstrap UX. |
| Number of moderator actions per resolved flag | Measures moderation efficiency. |
| Accidental purge count | Should be near zero. |
| Category coverage of active threads | Shows whether the forum is navigable. |

## Feature prioritization

### MVP: make the forum usable and coherent

| Priority | Feature | Backend support |
| --- | --- | --- |
| P0 | Register/login/session profile | `/auth/register`, `/auth/login`, `/auth/me`, `/profiles/get` |
| P0 | Latest thread list and thread detail | `/threads/list`, `/threads/get`, `/posts/get` |
| P0 | Create thread, reply, edit own posts | `/threads/create`, `/threads/reply`, `/posts/edit` |
| P0 | Notifications inbox | `/notifications/list`, `/notifications/unreadCount`, `/notifications/markRead` |
| P0 | Resolved answer display/action | `/resolutions/get`, `/resolutions/isResolved`, `/resolutions/accept` |
| P1 | Categories/tags on threads | `/categories/list`, `/categories/assign`, `/tags/forTarget`, `/tags/add` |
| P1 | Backlink sidebar | `/links/backlinks`, `/links/forward` |
| P1 | Flag/report content | `/flags/raise`, `/flags/open`, `/flags/resolve` |
| P1 | Admin bootstrap basics | `/roles/define`, `/roles/grant`, `/roles/can` |

### Later: make it delightful and defensible

| Feature | Why later | Backend support / gap |
| --- | --- | --- |
| Search and typeahead | Needs backend search for scale | Gap: no `/search` endpoint |
| Rich user directory | Helpful for mentions/admin grants | Gap: no users list endpoint |
| Graph visualization | Useful once backlinks exist | Supported by `/links/backlinks` and `/links/forward`, but needs client composition |
| Advanced moderation analytics | Needs audit/event querying | Gap: no moderation audit log endpoint |
| Drafts | Important for long answers | Gap: no draft endpoint; use local storage initially |
| Real-time updates | Improves inbox/thread presence | Gap: no websocket/SSE; poll counts initially |
| Full-text duplicate suggestions | High value for question quality | Gap: no search/similarity endpoint |

## Backend gaps a great frontend will feel

| Gap | Impact | UI coping strategy |
| --- | --- | --- |
| No search endpoint | Hard to find old answers, users, tags, or categories | Client-side filter loaded latest threads; use bookmarks/history; encourage exact `[[id]]` references |
| No user directory or username lookup endpoint | Mention autocomplete and role grants are awkward | Use profiles only when user id is known; cache users encountered in threads/notifications |
| No conversation lookup by post id | Notifications link to posts, but thread navigation may need containing conversation | Store conversation ids client-side when loaded; after post link, show standalone `/posts/get` if thread unknown |
| No title field for threads | Latest list may rely on first content line | UI derives title from first markdown line; later add title metadata |
| No pagination parameters visible on list endpoints | Large forums could overload `/threads/list`, `/notifications/list`, `/trash/list` | MVP limits rendering client-side; later add cursor/limit endpoints |
| No draft/preview endpoint | Long-form editing can lose work; rendering only comes after save | Local drafts and client markdown preview; trust backend rendered HTML after save |
| No public audit log | Moderation transparency is limited | Show local action confirmations and current state; later add audit/event feed |
| No endpoint to list all tags | Tag discovery is weak | Derive tag cloud from loaded posts; later add `/tags/list` |
| Pin capability is scoped but role UI is global by default | Admins may not understand context-specific pinning | Explain scope field and provide category/thread pickers for context |

## Product details that would make it feel original

- **“Discussed elsewhere” badges:** if `/links/backlinks` returns sources, show a badge on the post and let readers jump into related debate.
- **“Answer became canonical” trail:** combine `/resolutions/get` and `/links/backlinks` to show accepted answers that are referenced by many later posts.
- **“Quiet moderation” mode:** after `/flags/raise`, the reporter gets a private status; the public thread does not become a spectacle.
- **“Claimed forum” indicator:** in admin settings, explain whether bootstrap mode is still open or whether `administer` is enforced.
- **“Lock with next step” composer replacement:** locked thread UI should offer “subscribe for updates,” “bookmark,” or “view related backlinks,” not just a dead end.
- **“Revision confidence” timeline:** when a post is edited, `/revisions/list` lets readers inspect how an accepted answer changed.

## Suggested MVP screens

1. **Auth + profile setup**
2. **Latest threads** with category/tag/resolution/lock badges
3. **Thread detail** with reply composer, accepted answer banner, notifications/read state, backlinks sidebar
4. **Inbox** for notifications and unread catch-up
5. **Create/edit post** markdown composer with `[[id]]` and `@mention` guidance
6. **Flag modal** and **moderator flag queue**
7. **Admin bootstrap wizard** with roles and categories
8. **Profile page** showing bio/avatar and `/posts/byAuthor`

## North-star metrics

- **Activation:** new members who register and create or reply within 24 hours.
- **Knowledge reuse:** posts with backlinks, backlink clicks, accepted answers cited later.
- **Responsiveness:** median time to first reply, median time to accepted answer.
- **Healthy attention:** unread age, notification action rate, subscription retention.
- **Safety:** flag resolution time, repeat flags, restore-after-trash rate, locked-thread reply failure rate.
- **Admin readiness:** time from first login to claimed admin role and first category created.

## Closing recommendation

Start with the workflows the backend already models best: create/read/reply, notifications, accepted answers, backlinks, and reversible moderation. Avoid making the first frontend a generic Discourse clone. Its differentiator should be that discussions naturally become a connected knowledge base, while the administrative surface makes trust and safety feel like part of the product rather than an afterthought.
