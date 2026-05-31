# Forum API & Type-Safe SDK Architecture

This document defines the HTTP API surface of the forum backend and the strategy
for the end-to-end type-safe client SDK. It guides the synchronization and SDK
implementation.

## How the API is exposed

The browser talks to the backend only through the `Requesting` concept. Each API
endpoint is a `POST {REQUESTING_BASE_URL}{path}` request whose JSON body is the
endpoint input. A synchronization matches `Requesting.request` for that `path`,
performs the work across concepts, and answers with `Requesting.respond`.

We do **not** use passthrough routes for domain logic — every endpoint is an
explicit sync so we can authorize via session, fan out across concepts (e.g.
render markdown + register for unread tracking when a post is created), and shape
responses. Passthrough stays disabled for concept actions (see `passthrough.ts`).

## Endpoint set (v1)

Paths are given without the `/api` base prefix (sync patterns match the
unprefixed path, per the Requesting README). Inputs that require a logged-in user
carry a `session` token; the sync resolves it to a `user` via `Sessioning._getUser`
and returns an error response if the session is invalid.

### Authentication & session
- `POST /auth/register` `{ username, password, displayName }` → `{ user }`
  (registers credentials **and** creates a profile in one flow)
- `POST /auth/login` `{ username, password }` → `{ session, user }`
- `POST /auth/logout` `{ session }` → `{ ok }`
- `POST /auth/me` `{ session }` → `{ user, username, profile }`
- `POST /auth/changePassword` `{ session, oldPassword, newPassword }` → `{ user }`

### Profiles
- `POST /profiles/get` `{ user }` → `{ profile }`
- `POST /profiles/setDisplayName` `{ session, displayName }` → `{ user }`
- `POST /profiles/setBio` `{ session, bio }` → `{ user }`
- `POST /profiles/setAvatar` `{ session, avatar }` → `{ user }`

### Threads / posts / conversation
- `POST /threads/create` `{ session, content }` → `{ post, conversation, node }`
  (creates a post, starts a conversation rooted at it, renders markdown, and
  registers the post for unread tracking in the conversation scope)
- `POST /threads/reply` `{ session, parent, content }` → `{ post, node }`
  (`parent` is a Conversing node; creates a post, attaches it as a reply,
  renders markdown, registers for unread tracking, and records cross-post links)
- `POST /threads/get` `{ conversation }` → `{ thread }`  (ordered nodes, each with
  post content, author, rendered html, reply/backlink metadata)
- `POST /posts/get` `{ post }` → `{ post }`  (author, content, rendered html, timestamps)
- `POST /posts/edit` `{ session, post, content }` → `{ post }`  (author-only; re-renders + updates links)
- `POST /posts/delete` `{ session, post }` → `{ post }`  (author-only; cascades)
- `POST /posts/byAuthor` `{ author }` → `{ posts }`

### Reactions
- `POST /reactions/add` `{ session, target, kind }` → `{ reaction }`
- `POST /reactions/remove` `{ session, target, kind }` → `{ ok }`
- `POST /reactions/forTarget` `{ target }` → `{ reactions }`  (counts per kind)

### Tags
- `POST /tags/create` `{ session, name }` → `{ tag }`
- `POST /tags/add` `{ session, target, tag }` → `{ target }`
- `POST /tags/remove` `{ session, target, tag }` → `{ target }`
- `POST /tags/targets` `{ tag }` → `{ targets }`
- `POST /tags/forTarget` `{ target }` → `{ tags }`

### Unread (Tracking)
- `POST /unread/list` `{ session, scope }` → `{ items }`
- `POST /unread/count` `{ session, scope }` → `{ count }`
- `POST /unread/markSeen` `{ session, item }` → `{ item }`
- `POST /unread/markAllSeen` `{ session, scope }` → `{ user }`

### Links
- `POST /links/backlinks` `{ target }` → `{ sources }`
- `POST /links/forward` `{ source }` → `{ targets }`

## Cross-concept synchronization highlights

- **Post lifecycle**: creating/editing a post triggers `Formatting.setSource` so a
  sanitized HTML rendering is always available, and `Linking.setLinks` derived
  from `[[post:<id>]]`-style references found in the content.
- **Threading**: a top-level post `start`s a `Conversing` conversation; a reply
  `reply`s under the parent node. The conversation id is the unread `scope`.
- **Unread**: when a post joins a conversation it is `Tracking.register`ed in the
  conversation scope (unread for everyone); viewing marks it seen.
- **Cascade**: deleting a post removes its Conversing node (when childless),
  Formatting document, Tracking item, reactions, tags, and links.

## Type-safe SDK strategy

The SDK runtime lives under `src/sdk/` and is generic. The forum API contract
lives with the server composition in `src/syncs/app.ts`:

```ts
export const api = defineApi({ auth, threads, posts });
export type ForumApi = ContractOf<typeof api>;
```

Each endpoint is declared through `requestingEndpoint(path)`, so the same syncs
that implement `Requesting.request` / `Requesting.respond` also carry the input
and output types. Success outputs are still derived from concept method
signatures where possible (`ActionOk`, `QueryRow`, `Prettify`).

The frontend binds the generic client to the server type:

```ts
import { createClient } from "../src/sdk/index.ts";
import type { ForumApi } from "../src/syncs/app.ts";

const api = createClient<ForumApi>({ baseUrl: "http://localhost:8000/api" });
const { session } = await api["/auth/login"]({ username, password });
```

There is no generated SDK contract file; `bun run typecheck` evaluates the
contract directly from `src/syncs/app.ts`.
