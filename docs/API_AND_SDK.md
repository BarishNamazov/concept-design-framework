# Forum API And Type-Safe SDK

This document is the current HTTP API and SDK contract reference for the forum
backend. The source of truth is `src/syncs/app.ts`, which composes every typed
Requesting endpoint into `api` and exports `type ForumApi`.

## How The API Is Exposed

The browser talks to the backend only through the `Requesting` concept. Each API
endpoint is a `POST {REQUESTING_BASE_URL}{path}` request whose JSON body is the
endpoint input. A synchronization matches `Requesting.request` for that path,
performs the work across concepts, and answers with `Requesting.respond`.

There are no direct concept passthrough routes. Every public endpoint is an
explicit Requesting sync, which keeps authorization, fan-out across concepts,
response shaping, and SDK typing in one declared API surface.

Paths below are shown without the `/api` base prefix because syncs match the
unprefixed `path` value.

## Endpoint Set

### Authentication And Session

- `POST /auth/register` `{ username, password, displayName }` -> `{ user }`
  Registers credentials and creates a profile.
- `POST /auth/login` `{ username, password }` -> `{ session, user }`
- `POST /auth/logout` `{ session }` -> `{ ok }`
- `POST /auth/me` `{ session }` -> `{ user, username, profile }`
- `POST /auth/changePassword` `{ session, oldPassword, newPassword }` ->
  `{ user }`

### Profiles

- `POST /profiles/get` `{ user }` -> `{ profile }`
- `POST /profiles/setDisplayName` `{ session, displayName }` -> `{ user }`
- `POST /profiles/setBio` `{ session, bio }` -> `{ user }`
- `POST /profiles/setAvatar` `{ session, avatar }` -> `{ user }`

### Threads And Posts

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

### Reactions

- `POST /reactions/add` `{ session, target, kind }` -> `{ reaction }`
- `POST /reactions/remove` `{ session, target, kind }` -> `{ ok }`
- `POST /reactions/forTarget` `{ target }` -> `{ reactions }`

### Tags

- `POST /tags/create` `{ session, name }` -> `{ tag }`
- `POST /tags/add` `{ session, target, tag }` -> `{ target }`
- `POST /tags/remove` `{ session, target, tag }` -> `{ target }`
- `POST /tags/targets` `{ tag }` -> `{ targets }`
- `POST /tags/forTarget` `{ target }` -> `{ tags }`

### Unread

- `POST /unread/list` `{ session, scope }` -> `{ items }`
- `POST /unread/count` `{ session, scope }` -> `{ count }`
- `POST /unread/markSeen` `{ session, item }` -> `{ item }`
- `POST /unread/markAllSeen` `{ session, scope }` -> `{ user }`

### Links

- `POST /links/backlinks` `{ target }` -> `{ sources }`
- `POST /links/forward` `{ source }` -> `{ targets }`

## Cross-Concept Synchronization Highlights

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

## SDK Contract

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
