# Example client — a tiny browser demo of the forum SDK

A **super-simple** browser client that drives the forum backend
**through the project's own type-safe SDK** (`createClient` from
[`src/sdk`](../src/sdk)), making **real HTTP requests** to a running server.

It is a *demonstration*, not a frontend: one small `index.html` plus one
`app.ts` module. Every call goes through the SDK — there is **no hand-rolled
`fetch`** — so the whole flow exercises the same end-to-end type safety a real
frontend would get.

## What it demonstrates

A coherent minimal flow, each step a single SDK call, logged on the page:

| Step | SDK call | Endpoint |
| --- | --- | --- |
| Register | `api.auth.register({ username, password, displayName })` | `/auth/register` |
| Login | `api.auth.login({ username, password })` | `/auth/login` |
| **Error path** | login with a wrong password → `{ error }` envelope | `/auth/login` |
| Who am I | `api.auth.me({ session })` | `/auth/me` |
| Create a thread | `api.threads.create({ session, content })` | `/threads/create` |
| List threads | `api.threads.list({})` | `/threads/list` |
| Open a thread | `api.threads.get({ conversation })` | `/threads/get` |
| Reply | `api.threads.reply({ session, parent, content })` | `/threads/reply` |

The error path shows that SDK methods **never throw**: a failed login resolves
to `{ error: "Invalid username or password." }`, which the demo discriminates
with `"error" in res` (the same pattern as the success branches).

> Note: a reply attaches to a **node** id, not a conversation id. The demo uses
> the opened thread's root node (from `/threads/get`) as the reply target.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | The minimal, lightly-styled UI and the `<script src="./app.ts">` entry. |
| `app.ts` | Wires the DOM to the SDK; imports `createClient` from `../src/sdk`. |
| `server.ts` | A tiny `Bun.serve` static server that bundles/transpiles the page (and the SDK TypeScript) for the browser. |
| `tsconfig.json` | Local TS config (adds the DOM lib) so the demo can be type-checked on its own. |

## Run it

### 1. Start the backend

The backend needs MongoDB and an `.env` (see the [root README](../README.md)):

```bash
# from the repo root
cp .env.template .env      # set MONGODB_URL and DB_NAME
bun run start              # starts the API on http://localhost:8000  (POST /api/*)
```

**CORS.** The browser demo runs on a different origin
(`http://localhost:3000`) than the API (`http://localhost:8000`), so the
backend must allow it. The `Requesting` server sets its
`Access-Control-Allow-Origin` from the **`REQUESTING_ALLOWED_DOMAIN`**
environment variable, which **defaults to `*`** (any origin) — so the demo
works out of the box. If you pin it, allow the demo origin:

```bash
REQUESTING_ALLOWED_DOMAIN=http://localhost:3000 bun run start
```

### 2. Start the demo client

```bash
# from the repo root
bun run example-client
# or:  bun run example-client/server.ts
```

Open <http://localhost:3000> and click through Register → Login → Create →
List → open a thread → Reply. The **Base URL** field at the top is the SDK
`baseUrl`; it defaults to `http://localhost:8000/api` (the SDK's own default)
and can be re-pointed at any backend without reloading. Use a different demo
port with `EXAMPLE_CLIENT_PORT=4000 bun run example-client`.

## How the SDK works in the browser

`server.ts` imports `index.html`, and Bun's HTML bundling transpiles the
`<script type="module" src="./app.ts">` entry **and the SDK TypeScript it
imports** to browser JavaScript on the fly — no separate build step, no bundler
config, no extra dependencies. Only the SDK's runtime (`client.ts`, a pure,
app-agnostic `fetch` Proxy) is shipped to the browser. The forum contract
(`ForumApi` from `src/syncs/app.ts`) is imported with `import type` and fully
erased, so the backend is never pulled in at runtime.

## Type-checking

This folder is **intentionally outside** the root `tsconfig.json` `include`
(which is just `src`/`sdk`), because browser code needs the `DOM` lib that the
backend config deliberately omits. So `bun run typecheck` at the repo root does
**not** cover the demo and is unaffected by it. To type-check the demo itself
(it extends the root config to inherit the `@`-path aliases and adds the DOM
libs):

```bash
bun x tsc -p example-client
```

## Caveats

- You need a **running backend + MongoDB** to see live data. Without a backend,
  the page still loads and the SDK still resolves/bundles, but each call resolves
  to a transport `{ error }` (which is itself a nice demonstration of the
  never-throw error handling).
- This is a demo: no persistence of the session beyond the page, no routing,
  minimal styling — by design.
