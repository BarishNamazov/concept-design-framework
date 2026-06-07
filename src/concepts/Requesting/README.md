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
`"/auth/login"`, not `"/api/auth/login"`.

The HTTP request then waits for a synchronization to call:

```ts
Requesting.respond({ request, user, session });
```

The response fields are returned as the HTTP JSON body.

## Synchronizing Against Requests

`Requesting.request` and `Requesting.respond` take flat records. In TypeScript,
endpoint syncs are declared with the typed Requesting helper:

```ts
const authLogin = defineEndpoint("/auth/login", ({
  Sync,
  Actions,
  Request,
  Respond,
}) => ({
  LoginRequest: Sync(({ username, password }) => ({
    when: Actions(Request({ username, password })),
    then: Actions([
      Authenticating.authenticate,
      { username, password },
    ]),
  })),

  LoginResponse: Sync(({ user, session }) => ({
    when: Actions(
      [Authenticating.authenticate, {}, { user }],
      [Sessioning.start, {}, { session }],
    ),
    then: Actions(Respond<LoginOutput>({ user, session })),
  })),
}));
```

The helper emits normal engine action patterns for runtime behavior and records
endpoint input/output types for the SDK contract. Each endpoint sync is
request-scoped automatically; `Request(...)` is only needed when the sync reads
HTTP body fields, and `Respond(...)`/`Fail(...)` bind the request id implicitly.
See [`src/syncs/app.ts`](../../syncs/app.ts) for the full endpoint set.
