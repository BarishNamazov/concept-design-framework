import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { freshID } from "@utils/database.ts";
import { setupTestDb } from "@utils/testing.ts";
import type { ID } from "@utils/types.ts";
import LinkingConcept from "./LinkingConcept.ts";

const mongo = await setupTestDb();
const Linking = new LinkingConcept(mongo.db);

afterAll(() => mongo.stop());

beforeEach(async () => {
  await mongo.db.collection("Linking.links").deleteMany({});
});

/** Narrow a result union to its success branch, failing the test otherwise. */
function ok<T>(result: T | { error: string }): T {
  if (result && typeof result === "object" && "error" in result) {
    throw new Error(`Expected success but got error: ${result.error}`);
  }
  return result as T;
}

const id = () => freshID() as ID;

describe("Linking", () => {
  test("principle: a link appears in forward links and backlinks; unlink drops both", async () => {
    const a = id();
    const b = id();
    ok(await Linking.link({ source: a, target: b }));

    expect(await Linking._getForwardLinks({ source: a })).toEqual([
      { target: b },
    ]);
    expect(await Linking._getBacklinks({ target: b })).toEqual([{ source: a }]);

    ok(await Linking.unlink({ source: a, target: b }));
    expect(await Linking._getForwardLinks({ source: a })).toEqual([]);
    expect(await Linking._getBacklinks({ target: b })).toEqual([]);
  });

  test("link requires no existing link for the pair", async () => {
    const a = id();
    const b = id();
    ok(await Linking.link({ source: a, target: b }));
    expect(await Linking.link({ source: a, target: b })).toHaveProperty(
      "error",
    );
  });

  test("unlink requires an existing link", async () => {
    const a = id();
    const b = id();
    expect(await Linking.unlink({ source: a, target: b })).toHaveProperty(
      "error",
    );
  });

  test("setLinks replaces the full target set (additive + removal)", async () => {
    const a = id();
    const b = id();
    const c = id();
    const d = id();
    ok(await Linking.link({ source: a, target: b }));

    ok(await Linking.setLinks({ source: a, targets: [c, d] }));
    const targets = (await Linking._getForwardLinks({ source: a }))
      .map((r) => r.target)
      .sort();
    expect(targets).toEqual([c, d].sort());
    expect(await Linking._hasLink({ source: a, target: b })).toEqual([
      { linked: false },
    ]);
    expect(await Linking._getOutgoingCount({ source: a })).toEqual([
      { count: 2 },
    ]);
  });

  test("setLinks to empty removes all, and preserves links not re-listed", async () => {
    const a = id();
    const b = id();
    const c = id();
    ok(await Linking.setLinks({ source: a, targets: [b, c] }));
    ok(await Linking.setLinks({ source: a, targets: [b] }));
    expect(await Linking._getForwardLinks({ source: a })).toEqual([
      { target: b },
    ]);
    ok(await Linking.setLinks({ source: a, targets: [] }));
    expect(await Linking._getForwardLinks({ source: a })).toEqual([]);
  });

  test("clearLinks removes every link from a source", async () => {
    const a = id();
    const b = id();
    const c = id();
    ok(await Linking.setLinks({ source: a, targets: [b, c] }));
    ok(await Linking.clearLinks({ source: a }));
    expect(await Linking._getOutgoingCount({ source: a })).toEqual([
      { count: 0 },
    ]);
  });

  test("queries: hasLink, outgoing and backlink counts", async () => {
    const a = id();
    const b = id();
    const c = id();
    ok(await Linking.link({ source: a, target: c }));
    ok(await Linking.link({ source: b, target: c }));

    expect(await Linking._hasLink({ source: a, target: c })).toEqual([
      { linked: true },
    ]);
    expect(await Linking._hasLink({ source: a, target: b })).toEqual([
      { linked: false },
    ]);
    expect(await Linking._getOutgoingCount({ source: a })).toEqual([
      { count: 1 },
    ]);
    expect(await Linking._getBacklinkCount({ target: c })).toEqual([
      { count: 2 },
    ]);
  });
});
