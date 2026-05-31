# The Requesting server

This document describes the **Bun-native HTTP server** that turns incoming
requests into concept actions: `src/concepts/Requesting/RequestingConcept.ts`
(the concept + `startRequestingServer`) and
`src/concepts/Requesting/passthrough.ts` (the passthrough allow/deny lists).

It complements the concept's own
[`src/concepts/Requesting/README.md`](../src/concepts/Requesting/README.md),
which explains the *passthrough model* and the request/respond cycle from a
concept author's perspective. This page focuses on the **server mechanics** and
how they connect to the [engine](ENGINE.md) and the [SDK](SDK_OVERVIEW.md). Where
the two overlap, the concept README is the source of truth — we cross-reference
rather than duplicate it.

> Source: `src/concepts/Requesting/{RequestingConcept.ts,passthrough.ts}`.

## What Requesting is

`Requesting` is the provided **bootstrap concept**: it reifies HTTP requests as
concept actions so the rest of the app can stay pure concepts + synchronizations.
It exposes two actions and one query:

| Member | Kind | Role |
| --- | --- | --- |
| `request({ path, ... })` | action | Create a `Request`, returning `{ request }`. Triggered by an incoming HTTP request. |
| `respond({ request, ... })` | action | Attach a response to a pending `Request`; resolves the awaiting HTTP handler. |
| `_awaitResponse({ request })` | query | Wait (up to a timeout) for the `Request` to be responded to, returning `[{ response }]`. |

`Requesting.requests` is the MongoDB collection that persists request documents
for logging/auditing. Pending in-flight requests are tracked **in memory** only
(a `Map<RequestID, { promise, resolve, reject }>`), since a promise can't be
persisted.

## From HTTP request to `Requesting.request`

`startRequestingServer(concepts, options?)` starts `Bun.serve`. Its `fetch`
handler:

1. Answers CORS preflight (`OPTIONS`) immediately with `204` and the CORS headers.
2. For a `POST` whose pathname starts with `REQUESTING_BASE_URL`:
   - if the full path is a registered **passthrough** route, handle it directly
     (see below);
   - otherwise call `handleRequesting`.
3. Everything else gets `404`.

`handleRequesting` is the core bridge:

```ts
const actionPath = pathname.slice(REQUESTING_BASE_URL.length); // strip "/api"
const inputs = { ...body, path: actionPath };

const { request } = await Requesting.request(inputs);          // 1. reify
const responseArray = await Requesting._awaitResponse({ request }); // 2. await
return json(responseArray[0].response);                        // 3. reply
```

Key points:

- The JSON body must be an object; an empty body is allowed, a non-object body is
  rejected with `400`.
- The **`path` matched by syncs excludes the base URL**. A request to
  `POST /api/auth/login` becomes `Requesting.request({ path: "/auth/login", ... })`
  — so sync patterns match `"/auth/login"`, not `"/api/auth/login"`. (See the
  concept README's closing note.)
- All other body fields are spread in flat alongside `path`, exactly as the
  endpoint's syncs expect.

## How `_awaitResponse` bridges the async response

`Requesting.request` creates a `Promise` and stashes its `resolve`/`reject` in the
in-memory `pending` map keyed by the request id. The HTTP handler then calls
`_awaitResponse`, which **races** that promise against a timeout:

```ts
const response = await Promise.race([pendingRequest.promise, timeoutPromise]);
```

- If a sync calls `Requesting.respond({ request, ... })`, `respond` looks up the
  pending entry and calls `resolve(response)` — unblocking `_awaitResponse`,
  which returns `[{ response }]` and the server writes it back as the HTTP body.
- If no sync responds within `REQUESTING_TIMEOUT`, the timeout promise rejects;
  `handleRequesting` maps a "timed out" error to HTTP `504`, other errors to
  `500`. Either way the `finally` block clears the timer and deletes the pending
  entry.

So the lifecycle is: **HTTP in → `request` (reify) → syncs do work → `respond`
(resolve) → `_awaitResponse` returns → HTTP out.** The engine's
[flow](ENGINE.md#flows) ties every action in that chain together. For the full
sync trace of a single endpoint, see the
[`/auth/login` worked example](ENGINE.md#worked-example-post-authlogin).

## How syncs answer: `Requesting.respond`

Both `request` and `respond` take **any** parameters as a flat record alongside
`path:` / `request:`. A success response is just a `then` clause:

```ts
then: actions([Requesting.respond, { request, session, user }]);
```

Domain logic answers via explicit syncs — one success sync and (typically) one
error sync per endpoint — so the response shape is whatever the endpoint's syncs
choose. See [`src/syncs/auth.sync.ts`](../src/syncs/auth.sync.ts) and the
endpoint catalogue in [`docs/API_AND_SDK.md`](API_AND_SDK.md).

## The passthrough route mechanism

By default, `startRequestingServer` walks every instantiated concept (excluding
`Requesting`, `client`, `db`, `Engine`) and registers a route for each of its
methods at:

```
{REQUESTING_BASE_URL}/{ConceptName}/{methodName}
```

A `POST` to such a route, when registered, is handled by `handlePassthrough`,
which reads the JSON body (default `{}`), calls `concept[method](body)` directly,
and returns the result as JSON — **bypassing the request/respond cycle entirely**.

### Inclusions and exclusions (`passthrough.ts`)

Every discovered route is classified at startup against `passthrough.ts`:

- **`exclusions: string[]`** — routes that should *not* be passthrough. They are
  skipped during registration, so a `POST` to them falls through to
  `handleRequesting` and fires `Requesting.request` like any other endpoint. No
  justification needed (this is the intended behavior).
- **`inclusions: Record<string, string>`** — routes intentionally exposed as
  passthrough, each mapped to a written justification (e.g. `"this is a public
  query"`).
- Any discovered route that is **neither** included nor excluded is still
  registered but logged as a `WARNING - UNVERIFIED ROUTE`, and the server prints a
  `FIX: Please verify routes in: …/passthrough.ts` reminder. This is a prompt to
  consciously classify each route, not a hard failure.

Both lists key on the **full** route including the base prefix (e.g.
`"/api/LikertSurvey/createSurvey"`), unlike sync `path` patterns which omit it.

### Why this app uses explicit syncs instead of passthrough

Passthrough is a convenient default that says "anyone can call my concepts
directly". This forum deliberately does **not** use it for domain logic — every
endpoint is an explicit sync — because reifying the request lets us:

- **authorize** (resolve a `session` to a `user` and reject invalid sessions)
  before doing anything;
- **fan out** across multiple concepts in one flow (e.g. create a post → render
  markdown → start a conversation → register for unread tracking);
- **shape** the response and emit a uniform `{ error }` envelope on failure;
- **log/track** all behavior for an endpoint under one flow.

See the concept README's "Including and Excluding Passthrough Routes" section for
the reasoning, and [`docs/API_AND_SDK.md`](API_AND_SDK.md) ("How the API is
exposed") for how that shapes the endpoint set.

## CORS

Every response carries CORS headers built once at startup:

```ts
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": REQUESTING_ALLOWED_DOMAIN, // default "*"
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
```

The allowed origin comes from **`REQUESTING_ALLOWED_DOMAIN`** (default `*`, any
origin), so a cross-origin browser client works out of the box. Pin it in
production:

```bash
REQUESTING_ALLOWED_DOMAIN=https://app.example.com bun run start
```

The [`example-client/`](../example-client/README.md) demo runs on a different
origin from the API and relies on this default — see its README for the CORS note.

## Environment variables

Bun loads `.env` automatically. The server reads:

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `8000` | Port `Bun.serve` binds (overridable via the `options.port` argument, which tests use with `0` to pick a free port). |
| `REQUESTING_BASE_URL` | `/api` | Path prefix for all API requests; stripped before sync matching. |
| `REQUESTING_TIMEOUT` | `10000` (ms) | How long `_awaitResponse` waits for a `respond` before timing out (→ HTTP `504`). |
| `REQUESTING_SAVE_RESPONSES` | `true` | Whether `respond` persists the response onto the request document (set `"false"` to skip the DB write). |
| `REQUESTING_ALLOWED_DOMAIN` | `*` | `Access-Control-Allow-Origin` value (CORS). |

> The values above are what the **server code** uses. The concept README quotes a
> couple of defaults from an earlier configuration (e.g. it lists `PORT` default
> `10000`); when in doubt, the defaults in this table reflect the current
> `RequestingConcept.ts` source.

## See also

- [`src/concepts/Requesting/README.md`](../src/concepts/Requesting/README.md) —
  the passthrough model and request/respond cycle (concept author's view).
- [`docs/ENGINE.md`](ENGINE.md) — how `Requesting.request` flows through syncs and
  back to `Requesting.respond`.
- [`docs/API_AND_SDK.md`](API_AND_SDK.md) — the endpoint set and why domain logic
  uses explicit syncs.
- [`docs/SDK_OVERVIEW.md`](SDK_OVERVIEW.md) — how a typed client calls these
  endpoints.
