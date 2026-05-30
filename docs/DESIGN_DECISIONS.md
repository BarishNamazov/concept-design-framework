# Design Decisions & Assumptions

This document records the high-level decisions behind the forum application's
concept decomposition. It is the canonical reference for how the requested
features map onto independent concepts, and the assumptions made along the way.

## Requested features → concepts

| Feature | Concept(s) | Notes |
| --- | --- | --- |
| Authenticating | `Authenticating` (+ `Sessioning`) | Username/password registration & login. `Sessioning` is added as a supporting concept so synchronizations can authorize requests via a session token, matching the architecture examples. |
| UserProfiling | `Profiling` | Display name, bio, avatar — a separate *view* of a user from auth credentials (separation of concerns). |
| Posting | `Posting` | Authored textual content over a generic target/author. Owns the raw content only. |
| Conversing | `Conversing` | Owns **conversational structure**: threads and reply (parent/child) relationships over generic items. Keeps structure independent of content (`Posting`). |
| Reacting | `Reacting` | Polymorphic reactions (e.g. emoji/like) by users on generic targets, preventing duplicates. |
| Tagging | `Tagging` | Polymorphic labels applied to generic targets. |
| Unreading | `Tracking` (a.k.a. unread markers) | Generalized as tracking per-user *seen/unseen* state of generic items, so "unread" is a derived query. |
| Linking | `Linking` | Maintains a reference graph from a source item to target items, enabling **backlinks** (who links to X). Rendering is left to the frontend; the backend exposes the graph. |
| Markdown Formatting | `Formatting` | Associates raw markdown with a rendered, sanitized HTML output per item; re-renders when content changes. |

## Key decisions and tradeoffs

1. **Sessioning is included alongside Authenticating.** The feature list only
   named "Authenticating", but real login flows and request authorization need a
   session token. Keeping them separate follows concept design's separation of
   concerns (credentials vs. live sessions).

2. **Conversing owns structure, Posting owns content.** A forum thread is a tree
   of replies. Rather than baking parent links into `Posting`, `Conversing`
   manages threads and the reply relation polymorphically over an `Item` type.
   A post is linked into a conversation via a synchronization. This keeps both
   concepts reusable (Posting could back a blog; Conversing could thread chat
   messages).

3. **"Unreading" generalized to `Tracking`.** The generic concept underlying
   unread markers is tracking which items a user has seen. "Unread" is then the
   complement of "seen" within a scope, computed by a query. This is more
   reusable than a bespoke unread-flag concept.

4. **Linking is a generic reference graph.** `Linking` records directed
   references between items and answers both "what does X link to" and "what
   links to X" (backlinks). Pretty rendering of an embedded link is a frontend
   concern fed by these queries plus `Posting`/`Formatting` data.

5. **Formatting is a concept, not just a helper.** Markdown rendering is modeled
   as a concept that stores raw source and its sanitized HTML rendering per
   target, so the rendered output is part of queryable state and is recomputed
   when the source changes.

6. **Polymorphism everywhere.** `Posting`, `Conversing`, `Reacting`, `Tagging`,
   `Tracking`, `Linking`, and `Formatting` are all polymorphic over the identity
   types they relate (User, Target, Item), making no assumptions about content.

## Out of scope (for now)

- No frontend (only the backend + a type-safe SDK).
- Authorization policy beyond "author of a resource" / "valid session" is kept
  minimal and expressed in synchronizations.
