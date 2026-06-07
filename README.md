# Concept-Design Application Template

A **concept-design** application template running on [Bun](https://bun.sh) with MongoDB for persistence. Functionality is decomposed into independent, reusable **concepts** composed with declarative **synchronizations**.

This template provides authentication, user profiles, and role-based authorization out of the box. Use it as a starting point for building any web application.

> Read the [concept-design overview](design/background/concept-design-overview.md) to understand the methodology. The runnable application lives under `src/`. A Next.js frontend lives under `frontend/`.

## Setup

1. Install [Bun](https://bun.sh): `curl -fsSL https://bun.sh/install | bash`
2. Install dependencies: `bun install`
3. Copy `.env.template` to `.env` and fill in your MongoDB configuration:
   - `MONGODB_URL`: the MongoDB connection string (use `memory` for in-memory dev)
   - `DB_NAME`: the database name
   - `PORT` (optional): the port the server binds to, default `8000`
4. Start the server: `bun run start`

## Scripts

| Command | Description |
| --- | --- |
| `bun run start` | Starts the application server (`src/main.ts`). |
| `bun test` | Runs the test suite. |
| `bun run typecheck` | Type-checks the project with `tsc --noEmit`. |
| `bun run format` | Formats code with biome. |
| `bun run check` | Lints and checks code with biome. |

## Architecture

Read [design/background/architecture.md](design/background/architecture.md) for the full picture. In short:

```
src/
├── concepts/       ← Concept implementations (one folder per concept)
│   ├── concepts.ts ← Registry + singleton instances
│   ├── Authenticating/
│   ├── Profiling/
│   ├── Requesting/  (provided: turns HTTP requests into concept actions)
│   ├── Roling/
│   └── Sessioning/
├── syncs/          ← Synchronizations (`*.sync.ts`)
├── engine/         ← The concept + synchronization engine (framework)
├── utils/          ← Database + helpers
├── sdk/            ← Type-safe client SDK for a frontend
└── main.ts         ← Entry point
```

- **Concepts** are self-contained TypeScript classes that own their state (MongoDB collections) and expose **actions** (state mutators) and **queries** (methods prefixed with `_`). A concept never imports another concept.
- **Synchronizations** are declarative rules of the form *when … where … then …* that compose concepts. See [implementing-synchronizations.md](design/background/implementing-synchronizations.md).
- **Requesting** is the bootstrap concept that turns incoming HTTP requests into `Requesting.request` actions. See its [README](src/concepts/Requesting/README.md).

## Adding Features

1. Write the concept spec (name, purpose, principle, state, actions, queries).
2. Implement it at `src/concepts/{Name}/{Name}Concept.ts`, with a colocated `{Name}Concept.test.ts`.
3. Wire it up with synchronizations under `src/syncs/`.
4. Register the concept in `src/concepts/concepts.ts` (both `conceptClasses` and the named export).
5. Wire endpoints into `src/syncs/app.ts`.
6. Run `bun test`, `bun run typecheck`, `bun run check`.

The design rules live under `design/background/` — read them in order. The `AGENTS.md` and `CLAUDE.md` files at the repo root provide full LLM agent instructions.

## Frontend

The `frontend/` directory contains a Next.js 16 app with shadcn/ui, auth pages, profile settings, and a typed SDK client wired to the backend API contract. See `frontend/AGENTS.md` for frontend-specific agent instructions.

## SDK

A self-contained typed client SDK lives under `src/sdk/`. The API contract is inferred from the sync composition in `src/syncs/app.ts` and passed to `createClient<AppApi>()`, giving a frontend end-to-end type safety without code generation. See [src/sdk/README.md](src/sdk/README.md).
