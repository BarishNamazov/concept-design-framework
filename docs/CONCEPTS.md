# Concepts Reference

This is the current catalogue of concept classes under `src/concepts/`. Concepts
own their own state, never import one another, and relate other concepts' objects
only through opaque branded `ID` strings.

| Concept | Type Params | Purpose | Actions | Queries | Collections |
| --- | --- | --- | --- | --- | --- |
| `Authenticating` | owns `User` | Establish and prove persistent identity. | `register`, `authenticate`, `changePassword`, `changeUsername`, `unregister` | `_getById`, `_getByUsername`, `_existsByUsername` | `Authenticating.users` |
| `Sessioning` | `[User]` | Keep a user signed in across requests. | `start`, `startWithExpiry`, `end`, `endAllForUser`, `expire` | `_getUser`, `_getSessionsForUser`, `_isActive` | `Sessioning.sessions` |
| `Profiling` | `[User]` | Store a public display name, bio, and avatar. | `createProfile`, `setDisplayName`, `setBio`, `setAvatar`, `deleteProfile` | `_getProfile`, `_getDisplayName`, `_getByDisplayName` | `Profiling.profiles` |
| `Posting` | `[Author]` | Store authored textual content. | `create`, `edit`, `delete` | `_getPost`, `_getContent`, `_getByAuthor`, `_getAuthor`, `_exists` | `Posting.posts` |
| `Conversing` | `[Item]` | Organize items into threaded conversations. | `start`, `reply`, `remove` | `_getConversations`, `_getNodeByItem`, `_getItem`, `_getConversation`, `_getRoot`, `_getThread`, `_getReplies`, `_getParent`, `_getAncestors` | `Conversing.conversations`, `Conversing.nodes` |
| `Reacting` | `[User, Target]` | Record named reactions by users on targets. | `react`, `unreact`, `clearTarget` | `_getReactionsForTarget`, `_getReactionsByUser`, `_countByKind`, `_hasReacted` | `Reacting.reactions` |
| `Tagging` | `[Target]` | Apply shared labels to targets. | `createTag`, `addTag`, `removeTag`, `deleteTag`, `clearTarget` | `_getTags`, `_getTargets`, `_getTagByName`, `_getAllTags` | `Tagging.tags`, `Tagging.targets` |
| `Tracking` | `[User, Item, Scope]` | Track seen/unseen state; unread is derived. | `register`, `unregister`, `markSeen`, `markUnseen`, `markAllSeen` | `_getUnread`, `_getUnreadCount`, `_getSeen`, `_isSeen`, `_getItemsInScope` | `Tracking.items`, `Tracking.seenMarks` |
| `Linking` | `[Item]` | Maintain directed links and backlinks. | `link`, `unlink`, `setLinks`, `clearLinks` | `_getForwardLinks`, `_getBacklinks`, `_hasLink`, `_getOutgoingCount`, `_getBacklinkCount` | `Linking.links` |
| `Formatting` | `[Target]` | Store sanitized HTML renderings of Markdown sources. | `setSource`, `clear` | `_getRendered`, `_getSource`, `_getDocument` | `Formatting.targets` |
| `Requesting` | none | Reify HTTP requests as actions for syncs. | `request`, `respond` | `_awaitResponse` | `Requesting.requests` |

## Conventions

- Actions take one object argument and return one object result.
- Normal action failures return `{ error: string }`; they are not thrown.
- Queries are methods prefixed with `_` and return arrays of rows.
- `Requesting._awaitResponse` is the bootstrap exception: it has query shape but
  waits on an in-memory pending request and can time out.
- Concepts are complete beyond the forum's current endpoints. Some actions are
  reusable concept surface that the app does not expose directly.
- Cross-concept behavior, including authorization, rendering, threading,
  unread registration, link derivation, and cascades, belongs in `src/syncs/`.
