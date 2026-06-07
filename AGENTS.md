# Instructions for LLM Agents

This is a concept-design application template running on **Bun** with **MongoDB**.
Concepts are independent, reusable units of functionality composed by declarative
synchronizations. Before writing any code, read the design rules and follow the
patterns established in this repo.

## First: Read the Design Rules

Before implementing anything, read these files in order:

1. `design/background/concept-design-overview.md` — what concepts are, independence, polymorphism, separation of concerns, composition by synchronization.
2. `design/background/concept-specifications.md` — how to write a concept spec (name, type params, purpose, principle, state, actions, queries).
3. `design/background/architecture.md` — project directory structure, Requesting as entrypoint, initialization flow.
4. `design/background/implementing-concepts.md` — TypeScript implementation conventions, MongoDB collections, ID management, error handling.
5. `design/background/implementing-synchronizations.md` — sync DSL, `when`/`where`/`then` pattern, frames, query helpers, `collectAs`.
6. `design/background/testing-concepts.md` — testing methodology with `setupTestDb`, isolated in-memory MongoDB.
7. `design/background/detailed/concept-rubric.md` — rubric for evaluating concept designs.
8. `design/background/detailed/concept-state.md` — detailed state design.

## Architecture Summary

```
src/
├── concepts/          # Independent concepts (one folder per concept)
│   ├── concepts.ts    # Registry + singleton instances (barrel: @concepts)
│   ├── Authenticating/
│   ├── Profiling/
│   ├── Requesting/    # HTTP server + endpoint definition DSL
│   ├── Roling/
│   └── Sessioning/
├── syncs/             # Synchronizations that wire concepts together
│   ├── app.ts         # Root composition + API contract type
│   ├── auth.sync.ts   # Auth endpoints + session guard
│   ├── authorization.ts  # Shared capability-gate helpers
│   ├── profiles.sync.ts  # Profile endpoints
│   └── roles.sync.ts     # Role management endpoints
├── engine/            # Sync engine (instrumentation, journal, matching)
├── sdk/               # Typed client SDK (generic, never edited per app)
├── utils/             # Database, types, testing helpers
└── main.ts            # Entry point
```

## Good Practices

### Concepts
- One class per concept at `src/concepts/{Name}/{Name}Concept.ts`.
- Concepts are fully independent — **never import another concept**.
- Every action takes a single dictionary argument and returns a dictionary.
- Error cases return `{ error: string }`, never throw except for truly exceptional cases.
- Queries are `_`-prefixed methods that always return **arrays** of rows.
- Use `ID` from `@utils/types.ts` for all identifiers. Use `freshID()` from `@utils/database.ts` when creating new entities.
- Override `_id` with `freshID()` on MongoDB inserts — never use ObjectId.
- Document each action with its signature, requires, and effects in JSDoc comments.
- When adding a new concept, register it in `src/concepts/concepts.ts` (both `conceptClasses` and the named export).

### Synchronizations
- Sync files go under `src/syncs/` with `.sync.ts` extension.
- Use `defineEndpoint(path, builder)` from `@concepts/Requesting/api.ts` for HTTP endpoints — this provides typed SDK contracts automatically.
- Use `Sync` (raw engine sync) for internal/cross-concept syncs not tied to an HTTP endpoint.
- Pattern: destructure variables in the sync function parameter, use `Actions(...)` for patterns.
- `when` patterns match on actions in the journal (same flow). `where` filters/enriches frames with queries. `then` fires actions once per surviving frame.
- Every endpoint needs request, response, and error syncs.
- Register all syncs in `src/syncs/app.ts` via the `api` tree — they are flattened by `syncMap`.
- Named exports from `app.ts` provide the typed `AppApi` contract used by the SDK.

### Requesting (HTTP Server)
- The server is provided by the `Requesting` concept. Every `POST` under the base URL (`/api/*`) becomes a `Requesting.request` action.
- Concept methods are never exposed as HTTP routes directly — endpoints are explicit syncs.
- The `path` field in `Requesting.request` is the URL path minus the base prefix (e.g., `/auth/login` not `/api/auth/login`).
- Respond with `Respond(...)` or reject with `Fail(...)`. Always bind the `request` id.
- Configure via `.env`: `PORT`, `REQUESTING_BASE_URL`, `REQUESTING_TIMEOUT`, `REQUESTING_SAVE_RESPONSES`, `REQUESTING_ALLOWED_DOMAIN`.

### Testing
- Concept tests: use `setupTestDb()` from `@utils/testing.ts` for isolated in-memory MongoDB. Test file lives next to the concept as `{Name}Concept.test.ts`.
- Sync integration tests: use `setupApp()` from `@utils/app_testing.ts` for the full app against in-memory Mongo.
- Every action should have tests confirming requires (rejection cases) and effects (state changes).
- Every concept should have a principle test demonstrating the archetypal scenario.
- Run all tests with `bun test`.
- Run typecheck with `bun run typecheck` (aliases `tsc --noEmit`).

### Code Quality
- Run `bun run format` (biome format), `bun run lint` (biome lint), `bun run check` (biome check) before committing.
- Follow existing patterns: avoid introducing new dependencies unless necessary.
- TypeScript strict mode is enabled. All code must typecheck.
- Use the `@engine`, `@concepts`, `@utils`, `@syncs` path aliases — never use relative imports across module boundaries.

### Adding a Feature
1. Write the concept spec (name, purpose, principle, state, actions, queries).
2. Implement the concept class under `src/concepts/{Name}/{Name}Concept.ts`.
3. Register the concept in `src/concepts/concepts.ts`.
4. Write concept tests in `src/concepts/{Name}/{Name}Concept.test.ts`.
5. Write syncs for the new endpoints in `src/syncs/{name}.sync.ts`.
6. Wire endpoints into `src/syncs/app.ts`.
7. Run `bun test`, `bun run typecheck`, `bun run check`.

### Environment
Copy `.env.template` to `.env` and fill in `MONGODB_URL` and `DB_NAME`.
Set `MONGODB_URL=memory` for development with an in-memory MongoDB.
Run with `bun run start`.
