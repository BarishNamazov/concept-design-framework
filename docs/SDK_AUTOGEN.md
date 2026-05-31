# Typed Requesting SDK contract

> Status: implemented. Replaces the generated `src/syncs/contract.generated.ts`
> design.

## Goal

The SDK runtime is a self-contained Requesting client. It does not import forum
concepts, syncs, generated files, or app-specific view types. The forum API type
is inferred from the server's typed Requesting endpoint declarations in
`src/syncs/app.ts`, then passed to the SDK generic:

```ts
import { createClient } from "../src/sdk/index.ts";
import type { ForumApi } from "../src/syncs/app.ts";

const api = createClient<ForumApi>({ baseUrl: "http://localhost:8000/api" });
```

This mirrors Eden Treaty’s shape: the server exports an app type, and the client
is a generic transport bound to that type by the caller.

## Design

- `src/concepts/Requesting/api.ts` provides `requestingEndpoint(path)`, a typed
  wrapper over the existing `actions(...)` DSL.
- `endpoint.request(...)` emits the real `Requesting.request` pattern and records
  request body keys as phantom TypeScript metadata.
- `endpoint.respond<Output>(...)` emits the real `Requesting.respond` action and
  records the success payload type. Error responders use `endpoint.error(...)`
  and remain part of the SDK `Result` envelope, not the success output.
- Sync files export normal engine sync functions, but each is created through its
  endpoint builder. The same syncs are used for runtime registration and API type
  inference.
- `src/syncs/app.ts` composes the endpoint groups into `api`, exports
  `syncs = syncMap(api)`, and exposes `type ForumApi = ContractOf<typeof api>`.

## Adding an endpoint

1. Create a path builder in the relevant sync file:
   `const login = requestingEndpoint("/auth/login")`.
2. Write syncs with `login.sync(...)`, `login.request(...)`, and
   `login.respond<LoginOutput>(...)`.
3. Add those syncs to the feature export via `login.define({ ... })`.
4. Include the feature in `src/syncs/app.ts` if it is a new feature group.

There is no generated SDK contract and no separate endpoint manifest to keep in
sync. Type-checking `ForumApi` is enough to catch API drift.

## Verification

- `bun run typecheck` checks the inferred `ForumApi`, SDK call inputs/outputs,
  and representative exact-type assertions.
- `src/syncs/endpoints.consistency.test.ts` introspects the endpoint groups and
  confirms every typed endpoint is backed by coherent `Requesting.request` paths
  and at least one `Requesting.respond` sync.
