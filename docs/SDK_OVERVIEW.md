# SDK overview

The SDK is split into two pieces:

- `src/sdk` is the self-contained Requesting client runtime.
- `src/syncs/app.ts` is the forum server API value and type contract.

```
browser / frontend
   │  createClient<ForumApi>().auth.login(...)
   ▼
src/sdk  (generic Proxy fetch client)
   │  POST {baseUrl}/auth/login
   ▼
Requesting server
   │  Requesting.request({ path: "/auth/login", ... })
   ▼
syncs from src/syncs/app.ts
   │  Authenticating.authenticate → Sessioning.start → Requesting.respond
   ▼
JSON response back to the SDK call
```

`src/sdk` imports no backend code. The frontend imports the app contract as a
type only:

```ts
import { createClient } from "../src/sdk/index.ts";
import type { ForumApi } from "../src/syncs/app.ts";

const api = createClient<ForumApi>({ baseUrl });
```

## Type Flow

1. Sync files declare Requesting endpoints with
   `requestingEndpoint("/path")`.
2. Each endpoint sync uses the same builder for runtime patterns and type
   metadata: `endpoint.request(...)`, `endpoint.respond<Output>(...)`, and
   `endpoint.error(...)`.
3. `src/syncs/app.ts` composes the endpoint groups and exports
   `type ForumApi = ContractOf<typeof api>`.
4. The generic SDK uses `ForumApi` to infer path, input, and output types.

There is no generated SDK contract file. `bun run typecheck` evaluates the
contract directly.

## Error Handling

SDK methods resolve to `Output<P> | { error: string }` and do not throw for
normal backend or transport failures. Callers check `"error" in result`.

## See Also

- [`docs/SDK_AUTOGEN.md`](SDK_AUTOGEN.md) — typed Requesting contract details.
- [`docs/REQUESTING.md`](REQUESTING.md) — HTTP bridge and Requesting lifecycle.
- [`src/sdk/README.md`](../src/sdk/README.md) — SDK usage.
