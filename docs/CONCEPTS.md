# Concepts Reference

A concise reference of every concept in the forum backend, for implementer / SDK
agents. Each concept is independent and relates other concepts' objects only through
its polymorphic type parameters. MongoDB collections are prefixed with the concept
name (e.g. `Posting.posts`), as shown by the bootstrap `Requesting` concept.

| Concept | Type params | Purpose | Key actions | Key queries | MongoDB collections |
| --- | --- | --- | --- | --- | --- |
| **Authenticating** | — (owns `User`) | Establish and prove a persistent identity. | `register`, `authenticate`, `changePassword`, `changeUsername`, `unregister` | `_getById`, `_getByUsername`, `_existsByUsername` | `Authenticating.users` |
| **Sessioning** | `[User]` | Keep a user signed in across requests. | `start`, `startWithExpiry`, `end`, `endAllForUser`, `expire` (system) | `_getUser`, `_getSessionsForUser`, `_isActive` | `Sessioning.sessions` |
| **Profiling** | `[User]` | Give each user a public display name, bio and avatar. | `createProfile`, `setDisplayName`, `setBio`, `setAvatar`, `deleteProfile` | `_getProfile`, `_getDisplayName`, `_getByDisplayName` | `Profiling.users` |
| **Posting** | `[Author]` | Publish persistent, revisable textual content. | `create`, `edit`, `delete` | `_getPost`, `_getContent`, `_getByAuthor`, `_getAuthor`, `_exists` | `Posting.posts` |
| **Conversing** | `[Item]` | Organize items into threaded conversations (reply tree). | `start`, `reply`, `remove` | `_getNodeByItem`, `_getThread`, `_getReplies`, `_getParent`, `_getAncestors`, `_getRoot`, `_getConversation` | `Conversing.conversations`, `Conversing.nodes` |
| **Reacting** | `[User, Target]` | Record named reactions (like/emoji) to gauge sentiment. | `react`, `unreact` | `_getReactionsForTarget`, `_getReactionsByUser`, `_countByKind`, `_hasReacted` | `Reacting.reactions` |
| **Tagging** | `[Target]` | Classify targets with shared, reusable labels. | `createTag`, `addTag`, `removeTag`, `deleteTag` | `_getTags`, `_getTargets`, `_getTagByName`, `_getAllTags` | `Tagging.tags`, `Tagging.targets` |
| **Tracking** | `[User, Item, Scope]` | Remember which items each user has seen (unread = unseen). | `register`, `unregister`, `markSeen`, `markUnseen`, `markAllSeen` | `_getUnread`, `_getUnreadCount`, `_getSeen`, `_isSeen`, `_getItemsInScope` | `Tracking.items`, `Tracking.seenMarks` |
| **Linking** | `[Item]` | Maintain a directed reference graph with backlinks. | `link`, `unlink`, `setLinks`, `clearLinks` | `_getForwardLinks`, `_getBacklinks`, `_hasLink`, `_getOutgoingCount`, `_getBacklinkCount` | `Linking.links` |
| **Formatting** | `[Target]` | Keep a sanitized HTML rendering in sync with raw Markdown. | `setSource`, `clear` | `_getRendered`, `_getSource`, `_getDocument` | `Formatting.targets` |
| **Requesting** | — | Reify HTTP requests as actions for syncs (provided bootstrap). | `request`, `respond` | `_awaitResponse` | `Requesting.requests` |

## Notes for implementers

- **Generic IDs.** All parameter types (`User`, `Author`, `Target`, `Item`, `Scope`)
  are branded `ID` strings; they are allocated by whichever concept owns them and
  passed in. Concepts that *create* identities (`Authenticating` for users; `Posting`
  for posts; `Conversing` for conversations/nodes; `Reacting`/`Linking`/`Tagging` for
  their own records) mint fresh IDs with `freshID()`.
- **Error overloads.** Actions with a `: (error: String)` overload must return a
  non-empty success dict and `{ error }` on failure, so syncs can distinguish the
  cases. Queries never error — they return an array (possibly empty).
- **Queries return arrays.** Every `_query` returns an array of dicts, even when at
  most one result is expected (e.g. `_getByUsername`) or a single derived value is
  returned (e.g. `_getUnreadCount`, `_isActive`).
- **Confirmability.** Every action's effects are observable through the listed
  queries (e.g. `Conversing.reply` is confirmed via `_getReplies`/`_getThread`;
  `Tracking.markSeen` via `_getUnread`/`_isSeen`; `Formatting.setSource` via
  `_getRendered`).
- **Cross-concept wiring** (threading a post into a conversation, rendering a post,
  registering it for unread tracking, deriving links from content, authorizing by
  session) is done in synchronizations, never inside a concept.
