# Application Overview

This backend is a threaded discussion forum built from independent concepts and
synchronizations. Members register, sign in, maintain a public profile, write
Markdown posts, start threads, reply, react, tag posts, follow unread state, and
link to other posts with backlinks.

There is no production frontend in this repository. The backend exposes a typed
Requesting API and a generic SDK that clients can bind to `ForumApi`.

## Functional Decomposition

- `Authenticating` owns credentials and user IDs.
- `Sessioning` owns live session handles used by syncs for authorization.
- `Profiling` owns public display information.
- `Posting` owns raw authored content.
- `Conversing` owns conversation and reply-tree structure.
- `Formatting` owns Markdown-to-sanitized-HTML renderings.
- `Reacting` owns named reactions.
- `Tagging` owns shared labels.
- `Tracking` owns seen/unseen state; unread lists and counts are derived.
- `Linking` owns directed links and backlinks.
- `Requesting` turns HTTP requests into actions that syncs can handle.

A typical thread-create flow is:

1. `POST /api/threads/create` becomes `Requesting.request`.
2. A sync resolves `session` to a user.
3. `Posting.create` creates the root post.
4. Syncs start a `Conversing` conversation, render with `Formatting`, register
   unread state with `Tracking`, and respond through `Requesting.respond`.

The current concept catalogue is [docs/CONCEPTS.md](../../docs/CONCEPTS.md), and
the endpoint contract is [docs/API_AND_SDK.md](../../docs/API_AND_SDK.md).
