# Application Overview

## What the application is

This is the backend for a **threaded discussion forum**. Members register and sign
in, give themselves a public profile, and write posts. Posts are organized into
**conversations**: a top-level post starts a thread, and further posts attach as
replies, forming a reply tree that readers can follow. Members can react to posts
(likes / emoji), classify them with shared tags, write in Markdown that is rendered
to safe HTML, cross-reference other posts via links (with backlinks surfaced), and
see at a glance which posts in a thread they have not yet read.

The application is built entirely out of **independent concepts** composed by
**synchronizations**, following the concept-design method. There is no frontend in
scope here; the backend exposes each concept's actions and queries (through the
`Requesting` concept's API server) and a type-safe SDK is generated for clients.

## Functional design

The forum's functionality is decomposed so that each concern is owned by exactly one
concept, and concepts never reference one another — they relate other concepts'
objects only through polymorphic type parameters, and are wired together by syncs.

- **Identity & access.** `Authenticating` owns credentials (username/password) and is
  the source of user identities. `Sessioning` keeps a signed-in user across requests
  via a session handle. Syncs over the `Requesting` entrypoint use a session to
  authorize actions (e.g. only a post's author may edit it).
- **Presence.** `Profiling` holds each user's display name, bio and avatar — a public
  *view* of a user kept separate from their credentials.
- **Content vs. structure.** `Posting` owns the raw authored content of a post.
  `Conversing` owns the *structure* — which post is the root of a thread and which
  posts are replies to which — over generic items. A new post is woven into a
  conversation by a sync, keeping content and threading reusable in isolation.
- **Engagement.** `Reacting` records named reactions (like/emoji) by users on targets,
  one per user per kind. `Tagging` applies shared labels to targets so all posts under
  a tag can be retrieved together.
- **Reading state.** `Tracking` remembers which items each user has seen, so a thread
  can show each member their **unread** posts and unread counts. New items default to
  unread.
- **References.** `Linking` maintains a directed graph between posts and exposes both
  forward links and **backlinks** (who links to a post). Links are typically derived
  from a post's content by a sync.
- **Rendering.** `Formatting` stores each post's raw Markdown and a sanitized HTML
  rendering, recomputing the rendering whenever the source changes.
- **Entrypoint.** `Requesting` (provided) reifies incoming HTTP requests as actions so
  that syncs can authenticate, authorize, fan out to multiple concepts, and respond.

A typical flow: a member signs in (`Authenticating` → `Sessioning`); posts a Markdown
reply in a thread, which syncs create the `Posting` content, place it in the
`Conversing` tree as a reply, render it via `Formatting`, register it in `Tracking`,
and record any `Linking` references found in the content; other members then see the
new post in the thread, mark it read, react, and tag it.

The concrete decisions behind this decomposition are recorded in
[DESIGN_DECISIONS.md](../../docs/DESIGN_DECISIONS.md). The individual concept
specifications are listed in [all-concepts.md](./all-concepts.md), and a quick
reference table is in [CONCEPTS.md](../../docs/CONCEPTS.md).
