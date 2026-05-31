# Forum client SDK

A **fully type-safe** client for the forum backend, in the
[Elysia Eden Treaty](https://elysiajs.com/eden/treaty/overview.html) style: a
static, generic Proxy-based client where property access builds the request path
and the terminal call performs a `POST`. Every input and output is inferred from
a single `ApiContract` that is **auto-generated from the synchronizations** and
itself **derived from the real backend concepts**, so the SDK breaks at compile
time if a backend response shape changes.

```
src/sdk/
├── client.ts     # createClient(): the static, generic Eden-Treaty-style Proxy
├── contract.ts   # ApiContract = the aggregated AppContract (re-exposed) + views
├── index.ts      # barrel: binds createClient() to ApiContract, re-exports types
└── README.md     # you are here

src/syncs/
├── <feature>.sync.ts    # syncs + co-located `endpoints` manifest & `Endpoints` type
├── contract.ts          # shared spec helpers (ActionOk / QueryRow / Prettify / ...)
└── contract.generated.ts # AppContract + endpointManifest, built by `bun run build`
```

The contract is **not** hand-maintained in one file. Each `*.sync.ts` feature
file co-locates its endpoint specs next to the syncs that implement them, and
`bun run build` aggregates every feature's `Endpoints` into one `AppContract`.
See [`../../docs/SDK_AUTOGEN.md`](../../docs/SDK_AUTOGEN.md) for the full design.

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

The contract does not hand-write response shapes. Each feature file's `Endpoints`
type derives them from the concept methods its syncs actually call, and the
input field names come from a co-located runtime `endpoints` manifest. For
example `/posts/get` (in `src/syncs/threads.sync.ts`) is the `Posting._getPost`
record plus `Formatting._getRendered`:

```ts
import type { PostingConcept, FormattingConcept } from "@concepts";
import type { QueryRow, Prettify } from "./contract.ts";

type PostRecord = QueryRow<PostingConcept, "_getPost">["post"];
type RenderedRow = QueryRow<FormattingConcept, "_getRendered">;

// Endpoints entry: { input: ...; output: { post: Prettify<PostRecord & RenderedRow> } }
```

`bun run build` aggregates every feature's `Endpoints` into the generated
`src/syncs/contract.generated.ts` (`AppContract`), which `contract.ts` re-exposes
as `ApiContract` — imported **as a type only**, so the SDK has no runtime
dependency on the backend.

Ids use the branded `ID` type from `@utils/types.ts` on output (preserving the
backend's guarantees), while inputs accept plain `string` for ergonomics. If a
concept's result shape changes, the specs — and therefore every call site —
fail to type-check. That is the point: there is one source of truth, and it lives
with the syncs.

A runtime consistency test (`src/syncs/endpoints.consistency.test.ts`) further
enforces that every declared endpoint path corresponds to a responding sync (and
vice-versa) and that the declared input field names match the real
`Requesting.request` patterns — so the specs cannot silently drift from the
syncs.

## Adding an endpoint

Write the syncs for the new `path` in a `*.sync.ts` feature file, add the path to
that file's `endpoints` manifest (with its input field names) and an `Endpoints`
entry (with its concept-derived output), then run `bun run build`. The new path
is automatically part of `ApiContract` and `createClient()` — no central file is
edited. See [`../../docs/SDK_AUTOGEN.md`](../../docs/SDK_AUTOGEN.md).

## Public exports

From `./sdk`:

- `createClient(options?)` → the typed client, bound to `ApiContract`.
- Types: `Client<C>`, `ClientOptions`, `Endpoint<C, P>`, `ContractShape`,
  `HeadersOption`, `ApiContract`, `ApiPath`, `Input<P>`, `Output<P>`,
  `Result<P>`, `ApiError`, `ID`, and the derived `PostView` / `ThreadNode` view
  shapes. The client types are generic over the contract; `createClient()` fixes
  them to `ApiContract`, so callers never pass a type argument.

## Tests

`client.test.ts` runs the SDK end-to-end over real HTTP against the full app on
an in-memory Mongo (via `startTestServer()` in `src/utils/app_testing.ts`),
covering auth, profiles, threads/posts, reactions, tags, unread, links, and an
error path — using both call styles — plus compile-time assertions that inputs
and outputs are inferred from `ApiContract`.

```
bun run build && bun test src/sdk/client.test.ts
```
