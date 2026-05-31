# Requesting

The Requesting concept is the HTTP entrypoint for an application built with
concepts and synchronizations. It encapsulates Bun's server, CORS, request
logging, response persistence, and request timeouts, while the application keeps
its behavior in explicit synchronizations.

Every `POST` under the configured base URL becomes a `Requesting.request`
action. There are no direct concept passthrough routes.

## Setup

1. Include the `Requesting` source folder as `src/concepts/Requesting` (already
   done in this repository).
2. Configure any environment variables you want in `.env`.
3. Run `bun run start`.

## Configuration

The following environment variables are available:

- `PORT`: the port the server binds, default `8000`.
- `REQUESTING_BASE_URL`: the base URL prefix for API requests, default `/api`.
- `REQUESTING_TIMEOUT`: the timeout for requests, default `10000` ms.
- `REQUESTING_SAVE_RESPONSES`: whether to persist responses, default `true`.
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
const createThread = requestingEndpoint("/threads/create")
  .request<{ session: ID; content: string }>()
  .respond<CreateThreadOutput>();
```

That builder emits normal engine action patterns for runtime behavior and also
records endpoint input/output types for the SDK contract. See
[`src/syncs/app.ts`](../../syncs/app.ts) and the
[HTTP API](../../../docs/ARCHITECTURE.md#http-api-and-endpoint-set) for the forum endpoint set.

