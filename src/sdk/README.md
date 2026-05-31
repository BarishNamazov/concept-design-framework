# Requesting client SDK

`src/sdk` is a self-contained, generic Requesting client. It contains only the
Proxy/fetch runtime and reusable client types; it does not import the forum
backend, generated files, or app-specific view types.

```ts
import { createClient } from "./sdk";
import type { ForumApi, Result } from "./syncs/app.ts";

const api = createClient<ForumApi>({
  baseUrl: "http://localhost:8000/api",
});
```

The forum binds the SDK to its API in `src/syncs/app.ts`:

- `api` is the typed Requesting endpoint tree.
- `syncs` is the runtime sync map registered by the engine.
- `ForumApi = ContractOf<typeof api>` is the contract passed to
  `createClient<ForumApi>()`.

## Calls

Both call styles are fully typed from the contract:

```ts
await api.auth.login({ username: "alice", password: "pw" });
await api["/auth/login"]({ username: "alice", password: "pw" });
```

Methods resolve to the endpoint success payload or `{ error: string }`; they do
not throw for backend or transport errors. Discriminate with `"error" in result`.

## Public exports

From `src/sdk`:

- `createClient<C>(options?)`
- `Client<C>`, `Endpoint<C, P>`, `GroupedClient<C>`, `IndexedClient<C>`
- `ClientOptions`, `HeadersOption`, `ContractShape`, `ApiError`

App-specific exports such as `ForumApi`, `Input<P>`, `Output<P>`, `Result<P>`,
`ID`, `PostView`, and `ThreadNode` live in `src/syncs/app.ts`.

## Tests

```bash
bun run build
bun run typecheck
bun test src/sdk/client.test.ts
```
