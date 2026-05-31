# Auto-generating the SDK contract from the synchronizations

> Status: implemented. Supersedes the hand-maintained `src/sdk/contract.ts`.

## Problem

The SDK used to expose a single, exhaustive, **hand-written** file
(`src/sdk/contract.ts`) mapping every endpoint `path` to an `{ input; output }`
pair. The output types were cleverly _derived_ from the real `@concepts` return
types (`ActionOk` / `QueryRow` / `Prettify`), so the contract stayed bound to the
backend at compile time — a genuinely good property. But the **enumeration** of
endpoints lived in one central file, decoupled from the syncs that implement
each endpoint. Adding or changing a sync required a human to remember to edit
`contract.ts`. The single source of truth (the syncs) and the SDK could silently
drift.

## Goal

Make the synchronizations the single source of truth, in the spirit of
[Elysia Eden Treaty](https://elysiajs.com/eden/treaty/overview.html): the client
_code_ is static and generic, and the client _type_ is inferred from an
aggregated "App" type that the framework assembles automatically. Concretely:

1. Endpoint type info lives **with** the syncs, co-located in each
   `src/syncs/*.sync.ts` feature file.
2. Output types remain **derived** from the real `@concepts` return types, so a
   change to a concept's result shape breaks the SDK at compile time.
3. The aggregation into one `AppContract` type is **generated** by the existing
   `bun run build` barrel mechanism — adding a feature file flows through
   automatically, with **no** edit to any central enumeration.
4. `src/sdk/client.ts` is a **static, generic** Proxy client parameterised by the
   contract type. It is never edited when endpoints change.

## Design

### 1. Per-feature endpoint specs (co-located with the syncs)

Each `src/syncs/<feature>.sync.ts` exports two co-located members next to the
syncs that implement them:

- a runtime `endpoints` manifest listing each path and its **input field names**:

  ```ts
  export const endpoints = {
    "/auth/login": { input: ["username", "password"] },
    // ...
  } as const satisfies EndpointInputs;
  ```

- an `Endpoints` **type** whose `input` is _derived from the manifest_ and whose
  `output` is _derived from the concepts_:

  ```ts
  export type Endpoints = {
    "/auth/login": {
      input: InputShape<(typeof endpoints)["/auth/login"]["input"]>;
      output: Prettify<
        & ActionOk<SessioningConcept, "start">
        & ActionOk<AuthenticatingConcept, "authenticate">
      >;
    };
    // ...
  };
  ```

The shared toolkit (`src/syncs/contract.ts`) keeps the original derivation
helpers — `ActionOk`, `QueryRow`, `Prettify`, the `ApiError` envelope — plus
`InputShape` (turn a `readonly string[]` of field names into `{ field: string }`)
and the `EndpointInputs` constraint. Inputs accept ids as plain `string`; outputs
preserve the backend's branded `ID` because they are projected straight from the
concept return types.

Why a runtime tuple for inputs instead of a hand-written `input` type? Because it
gives us **one** place per endpoint for the input field names, _and_ a runtime
value the consistency test can compare against the real `Requesting.request`
patterns (see §4). The input _type_ is then mechanically derived from that tuple,
so the two cannot disagree within a file.

### 2. Automatic aggregation (the "App" type)

`src/utils/generate_imports.ts` (run by `bun run build`) already discovers every
`*.sync.ts` file. It now additionally detects which of those files export an
endpoint spec (a regex check for `export const endpoints` / `export type
Endpoints`) and emits a new generated barrel,
`src/syncs/contract.generated.ts`:

```ts
import type { Endpoints as E_auth } from "./auth.sync.ts";
import { endpoints as e_auth } from "./auth.sync.ts";
// ...one pair per feature file with an endpoint spec...

export type AppContract = Prettify<E_auth & E_threads & /* ... */>;

export const endpointManifest = { ...e_auth, ...e_threads, /* ... */ } as const;
```

Because the per-feature paths are disjoint, intersecting the `Endpoints` maps
yields a single record whose keys are the union of all paths — the aggregated
`AppContract`. The runtime `endpointManifest` mirrors it for the consistency
test. The file is git-ignored like the other generated barrels.

### 3. Static, generic client

`src/sdk/client.ts` is now generic over the contract type
(`createClient<C extends ContractShape>(): Client<C>`), with the Proxy runtime,
both calling styles (grouped `api.auth.login` and indexed `api["/auth/login"]`),
the `then`-guard, and the "never throw; normalise to `{ error }`" semantics
unchanged. It imports **nothing** app-specific.

`src/sdk/contract.ts` binds the generic machinery to the app by importing the
aggregated type **as a type only**:

```ts
import type { AppContract } from "../syncs/contract.generated.ts";
export type ApiContract = AppContract;
```

`import type` is fully erased, so the SDK never loads the backend at runtime —
it stays a pure client that is only _type_-coupled to the concepts, exactly as
before. `src/sdk/index.ts` exposes the familiar zero-argument
`createClient()` bound to `ApiContract`, plus `Input`, `Output`, `Result`,
`ApiError`, `ID`, and the derived view types `PostView` / `ThreadNode` (now
projected from the aggregated contract, e.g.
`Output<"/threads/get">["thread"][number]`).

### 4. Keeping the spec and the syncs from drifting

The declared specs and the real syncs are linked at two levels:

- **Within a file**: the `input` _type_ is derived from the `endpoints` _tuple_,
  so they can't disagree.
- **Across the system** (`src/syncs/endpoints.consistency.test.ts`): a runtime
  test introspects every registered sync by invoking it with the engine's
  `$vars` proxy and inspecting the resulting `when` / `then` patterns. From the
  real syncs it computes, by reference-identity against `Requesting.request` /
  `Requesting.respond`:
  - the set of paths that actually **respond** (the real endpoints), and
  - the set of **input field names** each path's `Requesting.request` patterns
    bind.

  It then asserts:
  - every declared path has a responding sync and vice-versa (no orphans, no
    missing specs), and
  - the declared input field names equal the real ones, per path.

  A compile-time `Equal<keyof AppContract, keyof typeof endpointManifest>`
  assertion additionally proves the generated type and runtime manifest agree.

Why a runtime test rather than pure type-level magic? The engine is intentionally
**dynamically typed**: logic variables are `symbol`s and action inputs are
`Mapping = Record<string, unknown>`. The `when` patterns therefore carry no
literal type information about the `path` or the input field names, so deriving
those at the type level would require re-typing the whole engine with literal
generics — high risk for little gain. Introspecting the same patterns at
**runtime** gives the same guarantee (the test fails the build on drift) while
keeping the engine untouched.

## Adding a new endpoint

1. In the relevant `src/syncs/<feature>.sync.ts` (or a new one), write the syncs
   that match `Requesting.request` for the new `path` and answer with
   `Requesting.respond`, as usual.
2. Add the path to that file's `endpoints` manifest with its input field names,
   and add an `Endpoints` entry whose `output` is derived from the concept
   method(s) the success-path sync responds with.
3. Run `bun run build`. The new path is automatically aggregated into
   `AppContract`, so `createClient()` immediately offers `api.<feature>.<method>`
   and `api["/feature/method"]`, fully typed. No central file is edited.
4. `bun test` runs the consistency test, which fails if the spec and the syncs
   disagree.

Adding a whole new **feature file** is the same: drop in `foo.sync.ts` with its
`endpoints` / `Endpoints` exports and run `bun run build`. The generator picks it
up with no edit to any enumeration.

## Tradeoffs considered

- **Sibling `*.endpoints.ts` files vs co-location in `*.sync.ts`.** A sibling
  file would make discovery trivial (scan for `*.endpoints.ts`). We chose
  co-location because it keeps each endpoint's spec literally next to the syncs
  that implement it — the strongest "single source of truth" signal — at the cost
  of a small content scan in the generator.
- **Runtime input tuples vs hand-written input types.** Hand-written input types
  read marginally nicer but give the consistency test nothing to check against at
  runtime and reintroduce in-file duplication. The tuple is the single source for
  input names and doubles as test data.
- **Type-level link vs runtime test.** Pure type-level enforcement was rejected
  as high-risk given the dynamically typed engine (see §4). The runtime test
  delivers the same anti-drift guarantee at build time.
- **Generated file coupling.** The SDK imports the aggregated type with
  `import type`, so there is no runtime coupling and the client remains
  publishable on its own.
