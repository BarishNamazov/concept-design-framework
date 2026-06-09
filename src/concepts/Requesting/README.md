# Requesting

The Requesting concept reifies external requests as concept actions so the wire
boundary is expressible as concept behavior. It records request inputs, tracks
pending responses, and lets synchronizations complete requests with
`Requesting.respond`.

The Bun HTTP adapter in `server.ts` turns every `POST` under the configured base
URL into a `Requesting.request` action. There are no direct concept passthrough
routes.

## Setup

1. Include the `Requesting` source folder as `src/concepts/Requesting` (already
   done in this repository).
2. Configure any environment variables you want in `.env`.
3. Run `bun run start`.

## Configuration

The following environment variables are available to the concept:

- `REQUESTING_TIMEOUT`: the timeout for requests, default `10000` ms.
- `REQUESTING_SAVE_RESPONSES`: whether to persist responses, default `true`.

The following environment variables are available to the HTTP adapter:

- `PORT`: the port the server binds, default `8000`.
- `REQUESTING_BASE_URL`: the base URL prefix for API requests, default `/api`.
- `REQUESTING_ALLOWED_DOMAIN`: the CORS allowed origin, default `*`.

## Requesting Routes

A request to:

```txt
POST /api/threads/create
```

with a JSON object body:

```json
{
  "session": "s123",
  "content": "Hello world"
}
```

is translated to:

```ts
Requesting.request({
  path: "/threads/create",
  session: "s123",
  content: "Hello world",
});
```

The `path` parameter does not include the base URL. Syncs match
`"/threads/create"`, not `"/api/threads/create"`.

The HTTP request then waits for a synchronization to call:

```ts
Requesting.respond({ request, post, conversation, node });
```

The response fields are returned as the HTTP JSON body.

## Synchronizing Against Requests

`Requesting.request` and `Requesting.respond` take flat records. In TypeScript,
endpoint syncs are declared with the typed Requesting helper:

```ts
const createThread = defineEndpoint("/threads/create", ({
  Sync,
  Actions,
  Request,
  Respond,
}) => ({
  ThreadCreateRequest: Sync(({ session, content, user }) => ({
    when: Actions(Request({ session, content })),
    where: async (frames) =>
      await frames.query(Sessioning._getUser, { session }, { user }),
    then: Actions([Posting.create, { author: user, content }]),
  })),

  ThreadCreateResponse: Sync(({ post, conversation, node }) => ({
    when: Actions(
      [Posting.create, {}, { post }],
      [Conversing.start, {}, { conversation, node }],
    ),
    then: Actions(Respond<CreateThreadOutput>({ post, conversation, node })),
  })),
}));
```

The helper emits normal engine action patterns for runtime behavior and records
endpoint input/output types for the SDK contract. Each endpoint sync is
request-scoped automatically; `Request(...)` is only needed when the sync reads
HTTP body fields, and `Respond(...)`/`Fail(...)` bind the request id implicitly.
See
[`src/syncs/app.ts`](../../syncs/app.ts) and the
[HTTP API](../../../docs/ARCHITECTURE.md#http-api-and-endpoint-set) for the forum endpoint set.
