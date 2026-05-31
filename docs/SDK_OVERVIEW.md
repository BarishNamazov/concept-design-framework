# SDK overview

This page ties together how the **client SDK** relates to the rest of the system:
the [engine](ENGINE.md), the [Requesting server](REQUESTING.md), the
auto-generated contract, and the live [`example-client/`](../example-client/)
demo. It is a map, not a manual — the details live in two existing documents,
which this page cross-links rather than repeats:

- [`docs/SDK_AUTOGEN.md`](SDK_AUTOGEN.md) — the design for **auto-generating the
  SDK contract from the synchronizations** (the authoritative reference).
- [`src/sdk/README.md`](../src/sdk/README.md) — the **usage guide**: call styles,
  error handling, options, public exports.

> If anything here appears to conflict with `SDK_AUTOGEN.md`, that document wins.

## Where the SDK sits

```
browser / frontend
   │  api.auth.login({ username, password })        ← typed call
   ▼
src/sdk  (createClient): a generic fetch Proxy
   │  POST {baseUrl}/auth/login   { username, password }
   ▼
Requesting server  (Bun.serve)                       ← docs/REQUESTING.md
   │  Requesting.request({ path: "/auth/login", ... })
   ▼
engine  (when / where / then over the action journal) ← docs/ENGINE.md
   │  Authenticating.authenticate → Sessioning.start → Requesting.respond
   ▼
Requesting._awaitResponse resolves → JSON body back to the SDK call
```

The SDK is a **pure client**. Its runtime (`src/sdk/client.ts`) is a static,
generic Proxy over web-standard `fetch` and imports nothing app-specific. Its
*types* are bound to the backend, but only through `import type`, which is fully
erased at runtime — so the SDK never pulls the concepts or engine into the
browser.

## The three layers of type safety

1. **Concepts define the truth.** Action/query return types live in the concept
   classes (`@concepts`). See [`docs/CONCEPTS.md`](CONCEPTS.md).
2. **Syncs define the endpoints.** Each `src/syncs/<feature>.sync.ts` co-locates,
   next to the syncs that implement an endpoint, a runtime `endpoints` manifest
   (input field names) and an `Endpoints` type whose `output` is *derived from
   the concepts* (`ActionOk` / `QueryRow` / `Prettify`). `bun run build`
   aggregates every feature's `Endpoints` into the generated `AppContract`
   (`src/syncs/contract.generated.ts`). This is the part documented in full by
   [`docs/SDK_AUTOGEN.md`](SDK_AUTOGEN.md).
3. **The SDK consumes the contract.** `src/sdk/contract.ts` re-exposes
   `AppContract` as `ApiContract` (as a type only); `createClient()` is fixed to
   it, so every call's `input`/`output` is inferred from the syncs — and breaks
   at compile time if a concept's result shape changes.

A runtime consistency test
(`src/syncs/endpoints.consistency.test.ts`) additionally proves the declared
specs match the real `Requesting.request` / `Requesting.respond` patterns, so the
contract cannot silently drift from the syncs.

## How a call maps onto the server

The SDK's two call styles both resolve to one HTTP request:

```ts
await api.auth.login({ username, password });   // grouped
await api["/auth/login"]({ username, password }); // indexed
// both → POST {baseUrl}/auth/login  with that JSON body
```

`baseUrl` defaults to `http://localhost:8000/api` — the
[Requesting server](REQUESTING.md)'s default `PORT` + `REQUESTING_BASE_URL`. The
server strips the base prefix and fires `Requesting.request({ path: "/auth/login",
... })`; the matching syncs do the work and answer with `Requesting.respond`;
`_awaitResponse` resolves and the JSON comes back to the SDK call. For the full
trace see the [`/auth/login` worked example](ENGINE.md#worked-example-post-authlogin).

SDK methods **never throw**: every call resolves to `Output<P> | { error: string }`
(both backend domain errors and transport failures are normalized to the same
`{ error }` shape). Discriminate with `"error" in result`. See
[`src/sdk/README.md`](../src/sdk/README.md#error-handling).

## Live usage: `example-client/`

[`example-client/`](../example-client/README.md) is a tiny browser demo that
drives the backend **through this SDK** (no hand-rolled `fetch`), making real
HTTP requests to a running server. It walks a coherent minimal flow — register →
login → (error path) → me → create thread → list → open → reply — each step a
single typed SDK call. It's the easiest way to see the
SDK + Requesting + engine stack working end to end, including:

- the **never-throw** error envelope (a wrong-password login resolves to
  `{ error }`), and
- **CORS** in practice (the demo runs on a different origin and relies on
  `REQUESTING_ALLOWED_DOMAIN`'s `*` default — see
  [`docs/REQUESTING.md#cors`](REQUESTING.md#cors)).

Bun's HTML bundling transpiles the demo's TypeScript *and the SDK it imports* for
the browser on the fly; only the SDK runtime is shipped, the contract is erased
via `import type`. Run it with `bun run example-client` against a running backend.

## Adding an endpoint (one-line summary)

Write the syncs, add the path to that feature file's `endpoints` manifest and
`Endpoints` type, run `bun run build`. The path is automatically part of
`ApiContract` and `createClient()`; no central file is edited. Full steps:
[`docs/SDK_AUTOGEN.md`](SDK_AUTOGEN.md#adding-a-new-endpoint).

## See also

- [`docs/SDK_AUTOGEN.md`](SDK_AUTOGEN.md) — contract auto-generation design.
- [`src/sdk/README.md`](../src/sdk/README.md) — SDK usage guide.
- [`docs/API_AND_SDK.md`](API_AND_SDK.md) — endpoint set and SDK strategy.
- [`docs/REQUESTING.md`](REQUESTING.md) / [`docs/ENGINE.md`](ENGINE.md) — the
  server and the engine the SDK calls into.
