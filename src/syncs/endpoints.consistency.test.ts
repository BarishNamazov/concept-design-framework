/**
 * Spec ⇄ sync consistency test.
 *
 * The SDK contract is aggregated from the per-feature endpoint specs co-located
 * in the `*.sync.ts` files (their `endpoints` manifest and `Endpoints` type).
 * This test enforces that those declared specs cannot silently drift from the
 * synchronizations that actually implement them.
 *
 * It introspects every registered sync by invoking it with the engine's `$vars`
 * proxy and inspecting the resulting `when` / `then` patterns. Comparing pattern
 * actions by reference against `Requesting.request` / `Requesting.respond`, it
 * derives, straight from the real syncs:
 *   - the set of paths that actually respond (the real endpoints), and
 *   - the input field names each path's `Requesting.request` patterns bind,
 * then checks them against the generated `endpointManifest`.
 *
 * Because the engine is dynamically typed (logic variables are `symbol`s, action
 * inputs are `Record<string, unknown>`), this link cannot be expressed purely at
 * the type level without re-typing the engine; the runtime check gives the same
 * anti-drift guarantee at build time. See `docs/SDK_AUTOGEN.md`.
 */
import { beforeAll, expect, test } from "bun:test";
import { setupApp, type TestApp } from "@utils/app_testing.ts";
import { $vars } from "../engine/vars.ts";
import type { ActionPattern, SyncFunction } from "../engine/types.ts";
import type { AppContract } from "./contract.generated.ts";

type ManifestType = typeof import("./contract.generated.ts")["endpointManifest"];

let app: TestApp;
let syncs: Record<string, SyncFunction>;
let endpointManifest: ManifestType;
let requestAction: unknown;
let respondAction: unknown;

beforeAll(async () => {
  app = await setupApp();
  const Requesting = app.concepts.Requesting as Record<string, unknown>;
  requestAction = Requesting.request;
  respondAction = Requesting.respond;
  syncs = (await import("@syncs")).default as Record<string, SyncFunction>;
  // Imported dynamically (after `setupApp` set the DB env) because the generated
  // barrel pulls in the `*.sync.ts` files, which import the `@concepts` singletons.
  endpointManifest = (await import("./contract.generated.ts")).endpointManifest;
});

// This suite deliberately does not stop the shared app: the in-memory Mongo
// singleton is owned by the integration suite's single-shot teardown (see
// `app_testing.ts`), and closing it here would break other test files sharing
// the process.

interface Introspection {
  /** Paths whose syncs answer with `Requesting.respond` — the real endpoints. */
  respondPaths: Set<string>;
  /** Per path, the union of input field names bound by its request patterns. */
  inputFields: Map<string, Set<string>>;
}

/** Derive the real endpoint surface by inspecting every sync's when/then. */
function introspectSyncs(): Introspection {
  const respondPaths = new Set<string>();
  const inputFields = new Map<string, Set<string>>();

  for (const fn of Object.values(syncs)) {
    const decl = fn($vars);
    const when = decl.when as ActionPattern[];
    const then = decl.then as ActionPattern[];

    let path: string | undefined;
    const fields = new Set<string>();
    for (const pattern of when) {
      if (pattern.action !== requestAction) continue;
      const p = pattern.input.path;
      if (typeof p !== "string") continue;
      path = p;
      for (const key of Object.keys(pattern.input)) {
        if (key !== "path") fields.add(key);
      }
    }
    if (path === undefined) continue;

    const existing = inputFields.get(path) ?? new Set<string>();
    for (const f of fields) existing.add(f);
    inputFields.set(path, existing);

    if (then.some((pattern) => pattern.action === respondAction)) {
      respondPaths.add(path);
    }
  }

  return { respondPaths, inputFields };
}

const sorted = (xs: Iterable<string>): string[] => [...xs].sort();

test("every declared endpoint path corresponds to a responding sync and vice-versa", () => {
  const { respondPaths } = introspectSyncs();
  const declaredPaths = Object.keys(endpointManifest);
  expect(sorted(respondPaths)).toEqual(sorted(declaredPaths));
});

test("declared input field names match the Requesting.request patterns", () => {
  const { inputFields } = introspectSyncs();
  for (const [path, spec] of Object.entries(endpointManifest)) {
    const declared = sorted(spec.input as readonly string[]);
    const real = sorted(inputFields.get(path) ?? new Set<string>());
    expect({ path, fields: real }).toEqual({ path, fields: declared });
  }
});

// Compile-time assertion: the generated type and the runtime manifest agree on
// the set of paths. Fails the build if they ever diverge.
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true
    : false;
type Expect<T extends true> = T;
type _PathsAgree = Expect<
  Equal<keyof AppContract, keyof typeof endpointManifest>
>;
const _pathsAgree: _PathsAgree = true;
void _pathsAgree;
