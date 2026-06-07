# Requesting client SDK

`src/sdk` is a self-contained, generic Requesting client. It contains only the
Proxy/fetch runtime and reusable client types; it does not import the app
backend implementation or app-specific view types.

```ts
import { createClient } from "./sdk";
import type { AppApi, Result } from "./syncs/app.ts";

const api = createClient<AppApi>();
```

When `baseUrl` is omitted, the SDK uses `REQUESTING_API_BASE_URL`, then
same-origin `/api`. The configured URL should include the API prefix, for
example `http://localhost:8000/api`.

The app binds the SDK to its API in `src/syncs/app.ts`:

- `api` is the typed Requesting endpoint tree.
- `syncs` is the runtime sync map registered by the engine.
- `AppApi = ContractOf<typeof api>` is the contract passed to
  `createClient<AppApi>()`.

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

App-specific exports such as `AppApi`, `Input<P>`, `Output<P>`, `Result<P>` and
`ID` live in `src/syncs/app.ts`.

## Tests

```bash
bun run typecheck
bun test src/sdk/client.test.ts
```
