# Synchronization Catalogue

The application syncs are implemented under `src/syncs/` and composed by
`src/syncs/app.ts`.

| File | API Area |
| --- | --- |
| `auth.sync.ts` | registration, login, logout, current user, password changes |
| `profiles.sync.ts` | profile reads and updates |
| `threads.sync.ts` | threads, posts, rendering, unread registration, link derivation, cascades |
| `reactions.sync.ts` | add/remove reactions and reaction summaries |
| `tags.sync.ts` | create/apply/remove tags and tag lookups |
| `unread.sync.ts` | unread list/count and mark-seen operations |
| `links.sync.ts` | forward links and backlinks |

The endpoint list and SDK contract are documented in the
[HTTP API](../../docs/ARCHITECTURE.md#http-api-and-endpoint-set) and
[typed SDK](../../docs/ARCHITECTURE.md#the-typed-sdk) sections.
