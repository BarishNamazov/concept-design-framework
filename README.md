# Forum: a concept-design application on Bun

This repository implements a **forum application** using [**concept design**](design/background/concept-design-overview.md): functionality is decomposed into independent, reusable **concepts** that are composed with **synchronizations**. It runs on [Bun](https://bun.sh) with MongoDB for persistence.

> The `design/` directory contains the background reading and the living specifications for the app's concepts and synchronizations. The runnable application lives under `src/`.

## Setup

1. Install [Bun](https://bun.sh): `curl -fsSL https://bun.sh/install | bash`
2. Install dependencies: `bun install`
3. Copy `.env.template` to `.env` and fill in your MongoDB configuration:
   - `MONGODB_URL`: the MongoDB connection string
   - `DB_NAME`: the database name
   - `PORT` (optional): the port the server binds to, default `8000`
4. Generate the concept barrel files: `bun run build`
5. Start the server: `bun run start`

## Scripts

| Command | Description |
| --- | --- |
| `bun run build` | Scans `src/concepts` and regenerates the `@concepts` and `@test-concepts` barrel files. Run this after adding or renaming a concept. |
| `bun run start` | Starts the application server (`src/main.ts`). |
| `bun test` | Runs the test suite (engine + concept tests). |
| `bun run typecheck` | Type-checks the project with `tsc --noEmit`. |

## Architecture

Read [design/background/architecture.md](design/background/architecture.md) for the full picture. In short:

```
src/
├── concepts/       <-- Concept implementations (one folder per concept)
│   └── Requesting/  (provided: turns HTTP requests into concept actions)
├── syncs/          <-- Synchronizations (`*.sync.ts`)
├── engine/         <-- The concept + synchronization engine (framework)
├── utils/          <-- Database + helpers
├── sdk/            <-- Type-safe client SDK for a frontend
└── main.ts         <-- Entry point (configure logging here)
```

- **Concepts** are self-contained TypeScript classes that own their state (MongoDB collections) and expose **actions** (state mutators) and **queries** (methods prefixed with `_`). A concept never imports another concept.
- **Synchronizations** are declarative rules of the form *when … where … then …* that compose concepts. See [implementing-synchronizations.md](design/background/implementing-synchronizations.md).
- **Requesting** is the provided bootstrap concept that turns incoming HTTP requests into `Requesting.request` actions you can synchronize against. See its [README](src/concepts/Requesting/README.md).

## Building the application

The application is described under `design/`:

- `design/application/` — the overview, and links to all concepts and synchronizations.
- `design/concepts/` — one specification per concept.
- `design/background/` — reference material on concept design, implementation, and testing.
- `docs/` — design records and developer documentation for the implemented features:
  - [docs/ENGINE.md](docs/ENGINE.md) — the concept + synchronization engine.
  - [docs/REQUESTING.md](docs/REQUESTING.md) — the Bun.serve Requesting server.
  - [docs/SDK_OVERVIEW.md](docs/SDK_OVERVIEW.md) — how the SDK ties to the engine, server, and example client.
  - [docs/API_AND_SDK.md](docs/API_AND_SDK.md), [docs/CONCEPTS.md](docs/CONCEPTS.md), [docs/DESIGN_DECISIONS.md](docs/DESIGN_DECISIONS.md), [docs/SDK_AUTOGEN.md](docs/SDK_AUTOGEN.md).

To add a feature:

1. Specify the concept under `design/concepts/{Name}/{Name}.md`.
2. Implement it at `src/concepts/{Name}/{Name}Concept.ts`, with a colocated `{Name}Concept.test.ts`.
3. Wire it up with synchronizations under `src/syncs/`.
4. Add the feature to `src/syncs/app.ts`, run `bun run build`, then `bun test`.

## Frontend SDK

A self-contained Requesting client SDK lives under `src/sdk/`. The forum API type
is inferred from the typed sync composition in `src/syncs/app.ts` and passed to
`createClient<ForumApi>()`, so a frontend gets end-to-end type safety without a
generated SDK contract file. See [src/sdk/README.md](src/sdk/README.md).
