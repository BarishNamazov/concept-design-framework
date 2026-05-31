# Concept-Design Fidelity Audit

**Scope.** Current source under `src/engine`, `src/concepts`, `src/syncs`,
`src/sdk`, and the current methodology/reference docs under `design/background`
and `docs`.

**Headline.** The codebase still follows the core concept-design shape:
concepts are independent state machines, cross-concept behavior lives in syncs,
and the HTTP/SDK surface is expressed through explicit Requesting endpoints. The
remaining concerns are mostly boundary exceptions and enforcement gaps rather
than concept-design violations.

## Summary

| # | Finding | Severity | Location |
| --- | --- | --- | --- |
| M1 | `Requesting._awaitResponse` has query shape but waits, mutates pending state, and can throw. | Medium | `src/concepts/Requesting/RequestingConcept.ts` |
| M2 | `src/concepts/Requesting/api.ts` is sync/SDK glue living inside a concept folder and importing `@concepts`. | Medium | `src/concepts/Requesting/api.ts` |
| L1 | The engine relies on convention for concept-design invariants; it does not enforce query purity or concept import boundaries. | Low | `src/engine/*` |
| L2 | The Requesting module contains both the concept class and Bun HTTP server helper. | Low | `RequestingConcept.ts` |
| L3 | Some endpoint sync sets are not total over all reachable states, so a dropped frame can become a 504 timeout. | Low | `src/syncs/*.sync.ts` |
| L4 | `Sessioning.expire` is implemented but no scheduler or sync drives it. | Low | `SessioningConcept.ts` |
| L5 | Root thread creation does not derive links, while replies and edits do. | Low | `threads.sync.ts` |

## What Holds Well

- **Concept independence:** concept classes import MongoDB, utilities, and local
  rendering libraries, but not sibling concepts.
- **Polymorphic IDs:** concepts compare opaque branded IDs; they do not inspect
  IDs created by other concepts.
- **Composition through syncs:** threading, rendering, unread registration,
  authorization, link derivation, and cascades are sync behavior.
- **Reusable concepts:** several concept actions are not exposed as endpoints,
  but they are coherent reusable surface, not dead domain coupling.
- **Typed API surface:** `requestingEndpoint(...)` keeps runtime sync patterns
  and `ForumApi` type inference together.

## Detailed Findings

### M1. `_awaitResponse` Is A Non-Standard Query

Queries normally return arrays, do not mutate state, and do not throw for normal
misses. `_awaitResponse` is the bootstrap exception: it waits on an in-memory
promise, deletes the pending request when done, and maps timeouts into HTTP
errors through the server helper.

This is acceptable as framework glue, but should remain documented as an
exception so authors do not copy it for ordinary concepts. A cleaner split would
move the waiting primitive into the server helper and leave only a pure
`_getResponse` query on the concept.

### M2. The Endpoint Builder Is In A Concept Folder

`src/concepts/Requesting/api.ts` provides `requestingEndpoint`, `defineApi`, and
contract inference. It is not a concept, and it is used by every sync file. Its
location makes `src/concepts/Requesting/` contain both concept code and
sync/SDK glue.

The pragmatic path is to document this as Requesting infrastructure. The cleaner
path is to move the generic builder to a neutral sync/API module and have syncs
import it from there.

### L1. Invariants Are Mostly Conventional

The engine assumes:

- `_` methods are pure queries;
- concepts do not import each other;
- action success outputs are non-empty when `{ error }` is also possible;
- `when` clauses provide output patterns.

These are documented conventions, not compile-time checks. A small structural
test or lint step could catch the highest-risk violations: concept-to-concept
imports and malformed `when` clauses.

### L2. Requesting Mixes Concept And Transport In One Module

`RequestingConcept.ts` contains the concept class plus `startRequestingServer`
with routing, CORS, JSON parsing, and status mapping. The class itself remains
focused, but a separate `server.ts` would make the module boundary cleaner.

### L3. Some Requests Can Still Time Out Instead Of Erroring

`Frames.query(...)` has inner-join semantics: zero rows drop the frame. That is
correct engine behavior, but endpoint sync sets must be total. List endpoints use
`aggregate(...)` to preserve an empty-list response; single-result endpoints and
multi-step secondary actions need explicit not-found/error responders.

Known shapes to keep checking: `/auth/me` if a valid session has no profile,
post edit/delete for nonexistent posts, and required secondary actions such as
formatting or unread registration.

### L4. `Sessioning.expire` Has No Driver

`Sessioning.expire` exists as a system cleanup action, but no scheduler invokes
it. Expiry is currently lazy: queries report expired sessions inactive, but
expired documents are not swept. Either add a timer/TTL-index model or document
sessions as lazy-expiring.

### L5. Link Derivation Is Incomplete For Root Posts

Reply and edit flows parse `[[<id>]]` references and update `Linking`. Thread
creation does not. If root-post backlinks matter before first edit, add a
`ThreadCreateDerivesLinks` sync.

## Verification Notes

- Concept member coverage is summarized in [CONCEPTS.md](CONCEPTS.md).
- Endpoint and SDK coverage is summarized in [API_AND_SDK.md](API_AND_SDK.md).
- Risk-level engineering issues are tracked in [CODE_SMELLS.md](CODE_SMELLS.md).
