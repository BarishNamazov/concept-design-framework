# Agent Rules

## Mandatory: all checks must be green

Before committing or declaring work done, run every check below. Zero errors, zero warnings.

### Backend (root)

```bash
bun run typecheck   # TypeScript type-checking
bun run lint        # Lint (biome)
bun run test        # Tests (scoped to src/)
```

### Frontend

```bash
cd frontend
bun run typecheck   # TypeScript type-checking
bun run lint        # Lint (eslint)
bun run test        # Unit/static tests (scoped to src/)
npx biome check src/ --write  # Format (frontend biome config)
```

### Common pitfalls

| What | Wrong | Right |
|------|-------|-------|
| Running tests | `bun test` (tests everything) | `bun run test` (uses scoped npm script) |
| Frontend format | `biome check .` (root biome config) | `npx biome check src/ --write` (frontend config) |
| Lint | Skip if "only warnings" | Zero warnings required |

### Pre-push checklist

1. `bun run typecheck` — backend TS
2. `bun run lint` — backend biome
3. `bun run test` — backend tests
4. `cd frontend && bun run typecheck` — frontend TS
5. `cd frontend && bun run lint` — frontend eslint
6. `cd frontend && bun run test` — frontend unit tests
7. `cd frontend && npx biome check src/ --write` — frontend format
