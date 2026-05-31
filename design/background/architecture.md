# Architecture Overview

The application is structured around two fundamental building blocks:

1. **Concepts**: self-contained, modular increments of functionality, such as
   `Sessioning`, `Posting`, and `Conversing`.
2. **Synchronizations**: rules that orchestrate interactions between concepts,
   such as "when a post is deleted, remove its formatting, reactions, tags, and
   links."

## Directory Structure

Feature work usually belongs in `src/concepts`, `src/syncs`, and the
documentation files that describe their public surface.

```txt
design/
src/
├── concepts/
│   ├── Sessioning/
│   │   └── SessioningConcept.ts
│   ├── Posting/
│   │   └── PostingConcept.ts
│   └── ...
├── syncs/
│   ├── app.ts
│   ├── auth.sync.ts
│   ├── threads.sync.ts
│   └── ...
├── sdk/
├── engine/
├── utils/
└── main.ts
```

## Requesting As The Entrypoint

The HTTP server is provided by the `Requesting` concept. `Requesting` is the
boundary where HTTP becomes concept actions.

When a request hits the server, it becomes a `Requesting.request` action. Public
endpoints are explicit synchronizations; concept methods are not exposed
directly as HTTP routes.

For example, `POST /api/threads/create` with body
`{ "content": "Hello world!", "session": "s123" }` becomes:

```ts
Requesting.request({
  path: "/threads/create",
  content: "Hello world!",
  session: "s123",
});
```

The actual syncs use the typed Requesting endpoint builder so the runtime sync
and SDK contract are declared together:

```ts
const threadCreate = requestingEndpoint("/threads/create");

export const ThreadCreateRequest = threadCreate.sync((
  { request, session, content, user },
) => ({
  when: threadCreate.actions(
    threadCreate.request({ session, content }, { request }),
  ),
  where: async (frames) =>
    await frames.query(Sessioning._getUser, { session }, { user }),
  then: threadCreate.actions([Posting.create, { content, author: user }]),
}));
```

Follow-up syncs start the conversation, render Markdown, register unread state,
and respond to the request.

## Initialization

1. Configure environment variables in `.env` (`MONGODB_URL`, `DB_NAME`, and
   optionally `PORT`).
2. Run `bun run start` to register `@syncs` and start the Requesting server.
