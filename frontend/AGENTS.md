<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Mandatory: all checks green — zero errors, zero warnings

Before pushing or declaring work done, run every check. No exceptions for warnings.

```bash
bun run typecheck   # TypeScript type-checking
bun run lint        # Lint (eslint)
bun run test        # Unit/static tests (scoped to src/)
npx biome check src/ --write  # Format (frontend biome config)
```

### Common mistakes

| Wrong | Right |
|-------|-------|
| `bun test` (tests everything) | `bun run test` (uses scoped npm script) |
| `biome format .` | `npx biome check src/ --write` (frontend config) |
| `biome lint .` | `bun run lint` (eslint, not biome) |
| Skip warnings | Zero warnings required |
