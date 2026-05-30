# Forum client SDK

A **fully type-safe** client for the forum backend, in the
[Elysia Eden Treaty](https://elysiajs.com/eden/treaty/overview.html) style: a
Proxy-based client where property access builds the request path and the
terminal call performs a `POST`. Every input and output is inferred from a
single API contract that is itself **derived from the real backend concepts**,
so the SDK breaks at compile time if a backend response shape changes.

```
src/sdk/
├── contract.ts   # ApiContract: path -> { input; output }, derived from @concepts
├── client.ts     # createClient(): the Eden-Treaty-style typed Proxy
├── index.ts      # barrel re-exporting the public surface
└── README.md     # you are here
```

## Install / import

The SDK ships as source within this repo (no build step, Bun/web-standard
`fetch` only). Import it from the barrel:

```ts
import { createClient } from "./sdk"; // adjust the relative path
import type { ApiContract, Result } from "./sdk";

const api = createClient({
  baseUrl: "http://localhost:8000/api", // default; override per environment
});
```

`createClient` options:

| option    | type                                              | default                       |
| --------- | ------------------------------------------------- | ----------------------------- |
| `baseUrl` | `string`                                          | `http://localhost:8000/api`   |
| `fetch`   | `typeof fetch`                                    | global `fetch`                |
| `headers` | `Record<string,string>` or `() => headers` (sync/async) | `{}`                    |

## Two call styles (both fully typed)

Every endpoint is reachable two equivalent ways. The input is the endpoint's
request body; the result is the success payload **or** an `{ error }`.

```ts
// grouped — property access mirrors the path segments
const login = await api.auth.login({ username: "alice", password: "pw" });
const root = await api.threads.create({ session, content: "# Hello" });
const mine = await api.posts.byAuthor({ author });

// indexed — the full path as a single key
const same = await api["/auth/login"]({ username: "alice", password: "pw" });
```

Both styles resolve to the same `Result<path>` type.

## Error handling

Methods **never throw**. Each resolves to `Result<P> = Output<P> | ApiError`,
where `ApiError = { error: string }`:

- Backend domain errors (invalid session, not found, duplicate, ...) come back
  as the backend's own `{ error }` envelope, unchanged.
- Transport failures (network down, non-JSON body, a non-2xx response without an
  error body) are normalized into the **same** `{ error }` shape.

Discriminate with `"error" in result`:

```ts
const res = await api.auth.me({ session });
if ("error" in res) {
  console.error(res.error); // string
} else {
  console.log(res.username, res.profile.displayName); // fully typed success
}
```

A small helper is convenient in app code:

```ts
function unwrap<T>(r: T | { error: string }): T {
  if (r && typeof r === "object" && "error" in r) throw new Error(r.error);
  return r as T;
}
```

## How the types stay bound to the backend

`contract.ts` does not hand-write response shapes. Instead it derives them from
the concept methods each synchronization actually calls. For example
`/posts/get` is the `Posting._getPost` record plus `Formatting._getRendered`:

```ts
import type { PostingConcept, FormattingConcept } from "@concepts";

type PostRecord = Awaited<ReturnType<PostingConcept["_getPost"]>>[number]["post"];
type Rendered = Awaited<ReturnType<FormattingConcept["_getRendered"]>>[number];

// contract entry: { post: PostRecord & Rendered }
```

Ids use the branded `ID` type from `@utils/types.ts` on output (preserving the
backend's guarantees), while inputs accept plain `string` for ergonomics. If a
concept's result shape changes, `contract.ts` — and therefore every call site —
fails to type-check. That is the point: there is one source of truth.

## Public exports

From `./sdk`:

- `createClient(options?)` → the typed client.
- Types: `Client`, `ClientOptions`, `Endpoint`, `HeadersOption`,
  `ApiContract`, `ApiPath`, `Input<P>`, `Output<P>`, `Result<P>`, `ApiError`,
  `ID`, and the derived `PostView` / `ThreadNode` view shapes.

## Tests

`client.test.ts` runs the SDK end-to-end over real HTTP against the full app on
an in-memory Mongo (via `startTestServer()` in `src/utils/app_testing.ts`),
covering auth, profiles, threads/posts, reactions, tags, unread, links, and an
error path — using both call styles — plus compile-time assertions that inputs
and outputs are inferred from `ApiContract`.

```
bun run build && bun test src/sdk/client.test.ts
```
