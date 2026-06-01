# Frontend ideas for the concept-design forum

This backend is not a generic REST resource server; it is a typed command/query surface assembled from composable forum concepts. The frontend should lean into that: model UI state around threads, posts, links, moderation, and user capabilities, while hiding the fact that every HTTP operation is a `POST` behind a generated, typed client.

## What the backend actually exposes

The sync layer exports a `ForumApi` contract from `src/syncs/app.ts`, with `Input<P>`, `Output<P>`, `Result<P>`, `ThreadNode`, and `PostView` types. The generic SDK in `src/sdk/client.ts` already supports:

```ts
const api = createClient<ForumApi>({ baseUrl: "/api" });
await api.auth.login({ username, password });
await api["/threads/get"]({ conversation });
```

Every endpoint returns either its success payload or `{ error: string }`; the SDK normalizes transport failures into the same shape.

### Endpoint catalog

| Area | Endpoint paths | Request -> response shape |
| --- | --- | --- |
| Auth/session | `POST /auth/register`, `/auth/login`, `/auth/logout`, `/auth/me`, `/auth/changePassword` | Register: `{ username, password, displayName } -> { user }`; login: `{ username, password } -> { session, user }`; me: `{ session } -> { user, username, profile }`; logout/change password return `{ ok }` or `{ user }`. |
| Profiles | `POST /profiles/get`, `/profiles/setDisplayName`, `/profiles/setBio`, `/profiles/setAvatar` | Profile lookup is `{ user } -> { profile }`; edits are session-scoped and return `{ user }`. |
| Threads/posts | `POST /threads/create`, `/threads/reply`, `/threads/get`, `/threads/list`, `/posts/get`, `/posts/edit`, `/posts/delete`, `/posts/byAuthor` | Thread creation is `{ session, content } -> { post, conversation, node }`; replies are `{ session, parent, content } -> { post, node }`; `/threads/get` returns `{ thread: ThreadNode[] }`; `/threads/list` returns root `conversations`; post reads include raw post fields plus `rendered` HTML. |
| Links/backlinks | `POST /links/backlinks`, `/links/forward` | `{ target } -> { sources }` and `{ source } -> { targets }`; targets are parsed from `[[id]]` references in post markdown. |
| Categories | `POST /categories/create`, `/categories/delete`, `/categories/assign`, `/categories/unassign`, `/categories/list`, `/categories/items`, `/categories/forItem` | Single-home categorization: categories list publicly; create/delete/assign require `{ session, ... }`; lookup by category or item returns item/category ids. |
| Tags | `POST /tags/create`, `/tags/add`, `/tags/remove`, `/tags/targets`, `/tags/forTarget` | Reusable labels; mutation is session-scoped, reads map target ids to tag ids/names and vice versa. |
| Reactions | `POST /reactions/add`, `/reactions/remove`, `/reactions/forTarget` | `{ session, target, kind } -> { reaction }` or `{ ok }`; reads return `{ reactions }`. |
| Bookmarks | `POST /bookmarks/save`, `/bookmarks/unsave`, `/bookmarks/list`, `/bookmarks/isSaved` | User-private saved items keyed by session. |
| Subscriptions | `POST /subscriptions/subscribe`, `/subscriptions/unsubscribe`, `/subscriptions/mine`, `/subscriptions/isSubscribed`, `/subscriptions/subscribers` | Follow/watch targets for notifications. |
| Unread tracking | `POST /unread/list`, `/unread/count`, `/unread/markSeen`, `/unread/markAllSeen` | Session + scope/item driven read-state. |
| Notifications | `POST /notifications/list`, `/notifications/unreadCount`, `/notifications/markRead`, `/notifications/markAllRead`, `/notifications/dismiss` | Inbox, unread count, read/dismiss mutations. |
| Roles/capabilities | `POST /roles/define`, `/roles/grant`, `/roles/revoke`, `/roles/forUser`, `/roles/can` | Contextual authorization: roles carry capabilities; frontend should query `/roles/can` for privileged controls. |
| Moderation | `POST /flags/raise`, `/flags/resolve`, `/flags/open`, `/flags/forTarget`, `/locks/lock`, `/locks/unlock`, `/locks/isLocked`, `/locks/list`, `/trash/trash`, `/trash/restore`, `/trash/purge`, `/trash/isTrashed`, `/trash/list` | Flags surface review queues; locks freeze targets; trash supports soft-delete/restore plus purge. |
| Resolutions | `POST /resolutions/accept`, `/resolutions/clear`, `/resolutions/get`, `/resolutions/isResolved` | Q&A accepted-answer state: `{ question, answer }` links a root/question post to an answer post. |
| Pins | `POST /pins/pin`, `/pins/unpin`, `/pins/setPriority`, `/pins/forScope`, `/pins/isPinned` | Scope-level pinning with numeric priority. |
| Revisions | `POST /revisions/list`, `/revisions/get`, `/revisions/latest` | Auditable item history. |

The concepts underneath clarify the product language:

- `Posting` stores author/content/timestamps; `Formatting` stores sanitized rendered HTML.
- `Conversing` gives each post item a node with `conversation`, `parent`, `depth`, and `createdAt`.
- `Linking` maintains directed links so `[[post-id]]` creates forward links and backlinks.
- `Tracking`, `Subscribing`, and `Notifying` are distinct: seen-state, standing interest, and inbox delivery.
- `Roling`, `Locking`, `Flagging`, `Trashing`, and `Revisioning` support staff workflows.

## Recommended stack

| Layer | Recommendation | Why | Tradeoff |
| --- | --- | --- | --- |
| Framework | **Next.js App Router + React 19 + TypeScript** | Good nested layouts for forum shell, server components for public reads, route handlers if the API base URL needs proxying. | More framework conventions than a pure Vite SPA. |
| Routing | App Router route groups: `(public)`, `(auth)`, `(forum)`, `(moderation)`, `(settings)` | Mirrors the domain and allows separate loading/error boundaries. | Need care to keep client-only session state out of server-only components. |
| Data fetching/cache | **TanStack Query** for all endpoint calls | Backend is RPC-like POST-only; query keys can encode endpoint + input, mutations can invalidate related keys. | Duplicates some Next cache ideas, but is clearer for authenticated/sessionful data. |
| Forms | **React Hook Form + Zod** | Fast forms, validation schemas can mirror endpoint inputs and be shared with component tests. | Zod schemas must be manually maintained unless generated later. |
| Styling | **Tailwind CSS + shadcn/ui** | Forum UI needs dense lists, chips, menus, modals, toasts; shadcn remains locally editable. | Design system discipline is needed to avoid ad-hoc variants. |
| Rendering markdown | Use backend `rendered` HTML for posts; sanitize again defensively with DOMPurify before `dangerouslySetInnerHTML` | Formatting concept already sanitizes; double-sanitizing is a defense-in-depth browser boundary. | Must ensure link rewriting preserves `[[id]]` affordances. |
| Testing | Vitest + React Testing Library + MSW; Playwright for core flows | MSW can mock `POST /api/...` endpoint shapes; Playwright covers thread/reply/auth/moderation flows. | Requires a maintained fixture catalog. |

If the frontend is independent from this repo, use Vite + React Router instead. If it lives beside the backend and can import `src/syncs/app.ts`, Next.js with path aliases gives the strongest type story.

## Frontend architecture

```txt
frontend/
  app/
    (public)/login/page.tsx
    (forum)/page.tsx
    (forum)/c/[category]/page.tsx
    (forum)/t/[conversation]/page.tsx
    (forum)/u/[user]/page.tsx
    (forum)/search/backlinks/[post]/page.tsx
    (moderation)/flags/page.tsx
    (moderation)/trash/page.tsx
    settings/profile/page.tsx
  src/
    api/
      client.ts
      contracts.ts
      errors.ts
      keys.ts
      hooks/
        useAuth.ts
        useThread.ts
        useModeration.ts
        useTaxonomy.ts
    components/
      post/
      thread/
      graph/
      moderation/
      shell/
    features/
      composer/
      notifications/
      permissions/
    lib/
      session.ts
      optimistic.ts
      html.ts
```

### Typed API client layer

Use the existing contract as the source of truth:

```ts
import type { ApiPath, ForumApi, Input, Output, Result } from "@/backend/src/syncs/app";
import { createClient } from "@/backend/src/sdk";

export const api = createClient<ForumApi>({
  baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api",
});

export type EndpointInput<P extends ApiPath> = Input<P>;
export type EndpointOutput<P extends ApiPath> = Output<P>;
export type EndpointResult<P extends ApiPath> = Result<P>;
```

Then wrap raw calls with a small `unwrap` helper for UI code:

```ts
export async function call<P extends ApiPath>(
  path: P,
  input: Input<P>,
): Promise<Output<P>> {
  const result = await api[path](input);
  if ("error" in result) throw new ApiError(result.error, path);
  return result;
}
```

Generate query keys mechanically:

```ts
export const qk = {
  me: (session: string | null) => ["auth", "me", session] as const,
  thread: (conversation: string) => ["/threads/get", { conversation }] as const,
  backlinks: (target: string) => ["/links/backlinks", { target }] as const,
  unreadCount: (session: string, scope: string) => ["/unread/count", { session, scope }] as const,
};
```

This is enough for strongly typed hooks:

```ts
export function useThread(conversation: string) {
  return useQuery({
    queryKey: qk.thread(conversation),
    queryFn: () => call("/threads/get", { conversation }),
  });
}
```

Longer term, add a tiny codegen script that imports `ForumApi`, emits `endpointMap.ts`, and groups paths into `auth`, `threads`, `posts`, `links`, etc. The backend already does this type-level grouping; codegen mainly creates discoverable names and cache invalidation metadata.

## Data fetching and caching strategy

### Query keys

Because all endpoints are `POST`, cache identity must come from semantic endpoint + input:

- `["/threads/list", {}]` for the home feed.
- `["/threads/get", { conversation }]` for a thread tree.
- `["/posts/get", { post }]`, `["/revisions/list", { item: post }]`, `["/links/backlinks", { target: post }]` for post detail side panels.
- `["/categories/items", { category }]`, `["/pins/forScope", { scope }]`, `["/unread/count", { session, scope }]` for scoped feeds.

### Invalidation

| Mutation | Invalidate/update |
| --- | --- |
| `/threads/create` | Invalidate `/threads/list`, category item list for selected category, current user `/posts/byAuthor`. |
| `/threads/reply` | Invalidate `/threads/get` for the conversation, `/notifications/unreadCount` for affected users when visible, `/subscriptions/subscribers` if showing watcher count. |
| `/posts/edit` | Invalidate `/posts/get`, `/threads/get`, `/revisions/list`, `/links/forward`, `/links/backlinks` for old and new `[[id]]` references. |
| `/posts/delete`, `/trash/trash`, `/trash/restore` | Invalidate thread, trash list, feed, category/tag views. |
| `/reactions/add/remove` | Optimistically update `/reactions/forTarget`. |
| `/bookmarks/save/unsave` | Optimistically update `/bookmarks/isSaved` and `/bookmarks/list`. |
| `/notifications/markRead/dismiss/markAllRead` | Update inbox list and unread count locally. |
| `/roles/grant/revoke`, `/locks/lock/unlock`, `/pins/*` | Invalidate capability checks, lock status, pin lists, affected feed scopes. |

### Loading, empty, and error states

- Use route-level skeletons for feed/thread pages; component-level shimmer rows for side panels like backlinks and reactions.
- Show empty states tied to concepts: "No conversations in this category", "No backlinks yet", "No unresolved flags", "No unread items in this scope".
- Surface `{ error }` as structured toasts plus inline retry panels. The SDK never throws, but the frontend `call()` wrapper can throw typed `ApiError` for React Query error boundaries.
- For permission errors, hide controls after `/roles/can` says no, but still handle backend denial gracefully.

## Auth and session handling

The backend session is an opaque id returned by `POST /auth/login` and used as a `session` input for most mutations and private reads.

Recommended approach:

1. Store the session id in an HttpOnly, SameSite cookie via a frontend route handler or BFF proxy, not in localStorage.
2. Expose `useSession()` that calls `POST /auth/me` with the cookie-derived session.
3. Keep public pages usable without a session; conditionally enable private queries like `/notifications/list`, `/bookmarks/list`, `/unread/count`.
4. On logout, call `POST /auth/logout` and clear the cookie, then remove all session-scoped TanStack Query caches.
5. On password change via `/auth/changePassword`, refresh `/auth/me` and keep the session if the backend accepts it.

If there is no BFF layer, localStorage is workable for a prototype, but it weakens XSS posture. The forum renders HTML, so an HttpOnly cookie is worth the small proxy layer.

## Rendering the thread tree

`POST /threads/get` returns a flat `thread: ThreadNode[]` where each node includes the conversing fields plus `{ post, rendered }`. Build a client-side tree:

```ts
type UiThreadNode = ThreadNode & { children: UiThreadNode[] };
```

Algorithm:

1. Sort by `depth`, then `createdAt`.
2. Index nodes by `node`.
3. Attach each node to `parent` or treat it as root.
4. Render with a virtualized recursive tree for large conversations:
   - Root post uses a wider article layout.
   - Replies use depth guides, collapse controls, and "reply to this" composer anchored by node id.
   - Deleted/trashed posts render as tombstones unless the viewer has restore/purge capability.

The composer should submit `/threads/create` for new topics and `/threads/reply` for replies. After successful reply, insert the returned `{ post, node }` optimistically into the tree, then refetch `/threads/get` to pick up rendered HTML, links, notifications, and revision records created by event syncs.

## Rendering the `[[backlink]]` graph

The backend parses `[[<id>]]` out of post markdown and syncs those references into `Linking`.

Frontend ideas:

- While composing, detect `[[...]]` tokens and show an autocomplete popover backed by recent posts, `/posts/get`, and possibly `/posts/byAuthor`.
- In rendered posts, rewrite recognized wiki-link text into internal post links. If the backend's `rendered` HTML leaves `[[id]]` as text, post-process text nodes after sanitization and replace them with `<Link href="/p/{id}">[[id]]</Link>`.
- Add a "References" side panel on thread and post pages:
  - `POST /links/forward { source: post } -> { targets }`
  - `POST /links/backlinks { target: post } -> { sources }`
- For graph view, fetch one hop around the current post, then lazily expand neighbors. Use React Flow or a lightweight SVG graph:
  - Current post is centered.
  - Forward links point outward.
  - Backlinks point inward.
  - Color nodes by category/tag/resolution state.
- Cache each adjacency list independently; graph expansion should not invalidate the whole thread.

## Major views mapped to endpoints

### Home / latest conversations

- `POST /threads/list {}` for root conversation cards.
- `POST /pins/forScope { scope: "global" }` to float announcements.
- Optional enrichment: `/categories/forItem`, `/tags/forTarget`, `/resolutions/isResolved`, `/locks/isLocked`, `/trash/isTrashed`.

### Category page

- `POST /categories/list {}` for sidebar/nav.
- `POST /categories/items { category }` for item ids.
- For each item, hydrate via `/posts/get` or thread summaries from `/threads/list` cache.
- Scope pins with `/pins/forScope { scope: category }`.

### Thread page

- `POST /threads/get { conversation }` for tree.
- Per visible post: `/reactions/forTarget`, `/tags/forTarget`, `/bookmarks/isSaved`, `/links/backlinks`, `/links/forward`, `/resolutions/get`, `/locks/isLocked`, `/trash/isTrashed`.
- Mutations: `/threads/reply`, `/posts/edit`, `/posts/delete`, `/reactions/add`, `/bookmarks/save`, `/subscriptions/subscribe`, `/flags/raise`, `/resolutions/accept`.

### Post permalink page

- `POST /posts/get { post }`.
- `POST /revisions/list { item: post }`.
- `POST /links/backlinks { target: post }` and `/links/forward { source: post }`.
- Use the `Conversing` node from `/threads/get` when the conversation id is known; otherwise link back from surrounding search/feed context.

### User profile

- `POST /profiles/get { user }`.
- `POST /posts/byAuthor { author: user }`.
- Viewer-owned extras: `/bookmarks/list`, `/subscriptions/mine`, `/unread/list`.
- Settings write through `/profiles/setDisplayName`, `/profiles/setBio`, `/profiles/setAvatar`.

### Notifications inbox

- `POST /notifications/list { session }`.
- `POST /notifications/unreadCount { session }`.
- Actions: `/notifications/markRead`, `/notifications/markAllRead`, `/notifications/dismiss`.

### Moderation dashboard

- Queue: `POST /flags/open { session }`, then `/flags/forTarget { target }`.
- Actions: `/flags/resolve`, `/locks/lock`, `/trash/trash`, `/trash/restore`, `/trash/purge`.
- Audit: `/revisions/list`, `/revisions/get`, `/trash/list`, `/locks/list`.
- Capability gates: `/roles/can { user, context, capability }`.

### Admin roles and taxonomy

- Roles: `/roles/define`, `/roles/grant`, `/roles/revoke`, `/roles/forUser`.
- Categories: `/categories/create`, `/categories/delete`, `/categories/assign`, `/categories/unassign`.
- Tags: `/tags/create`, `/tags/add`, `/tags/remove`.
- Pins: `/pins/pin`, `/pins/setPriority`, `/pins/unpin`.

## Product ideas enabled by the concept model

- **Backlink-aware reading:** Every post gets "mentions this" and "mentioned by" tabs. This makes the forum feel more like a knowledge base than a linear message board.
- **Resolution-first thread summaries:** If `/resolutions/get` returns an answer, show the accepted answer directly under the root post with a "jump to context" link.
- **Soft-delete transparency:** Trashed replies appear as collapsible tombstones. Moderators can restore from the same location; purge stays in the dashboard.
- **Watch levels:** Present subscriptions as "watch this thread/category" even though the backend only sees generic targets.
- **Capability explanations:** When a disabled action is hidden by `/roles/can`, a tooltip can explain "Requires moderator in this category".
- **Revision diff drawer:** Use `/revisions/list` and `/revisions/get` to render a side-by-side markdown diff for edited posts.

## Incremental delivery plan

### Milestone 1: Read-only forum shell

- Import `ForumApi` and wire `createClient<ForumApi>()`.
- Implement global layout, home feed using `/threads/list`, thread page using `/threads/get`, and post renderer using backend `rendered`.
- Add empty/error/loading states and MSW fixtures for `/threads/list`, `/threads/get`, `/posts/get`.

### Milestone 2: Authentication and composition

- Add login/register/logout using `/auth/login`, `/auth/register`, `/auth/logout`, `/auth/me`.
- Add new thread and reply composers with optimistic updates.
- Add profile display names via `/profiles/get`.

### Milestone 3: Navigation and organization

- Add categories, tags, pins, and bookmarks.
- Build category pages from `/categories/list` and `/categories/items`.
- Add saved-items page with `/bookmarks/list`.

### Milestone 4: Engagement and inbox

- Add reactions, subscriptions, unread counts, and notifications.
- Implement notification dropdown and inbox with mark-read/dismiss flows.
- Add read-state updates with `/unread/markSeen` and `/unread/markAllSeen`.

### Milestone 5: Backlink graph and knowledge features

- Render `[[id]]` links in posts and composer autocomplete.
- Add backlinks/forward-links panels.
- Build one-hop graph visualization from `/links/backlinks` and `/links/forward`.

### Milestone 6: Moderation and admin

- Add flags, locks, trash/restore, revisions, role/capability gates, category/tag admin, and pin priority controls.
- Add Playwright coverage for flag -> resolve, trash -> restore, lock -> unlock, and role-gated UI.

## Implementation principles

- Treat backend ids as opaque strings; never infer entity type from id shape.
- Keep endpoint names visible in hook names and query keys so backend sync changes are easy to trace.
- Prefer optimistic UI only when the mutation response gives enough identity (`/threads/reply`, `/reactions/add`, `/bookmarks/save`); otherwise refetch.
- Use server-provided `rendered` HTML, but never bypass frontend sanitization and link rewriting.
- Keep concept boundaries visible in the UI code: `features/notifications` should not directly own unread tracking, and moderation should compose flags/locks/trash/revisions rather than inventing a single fake resource.
