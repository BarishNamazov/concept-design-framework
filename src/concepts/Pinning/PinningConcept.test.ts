import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { setupTestDb } from "@utils/testing.ts";
import type { ID } from "@utils/types.ts";
import type { ForumErrorCode } from "../../sdk/error-codes.ts";
import PinningConcept from "./PinningConcept.ts";

const mongo = await setupTestDb();
const Pinning = new PinningConcept(mongo.db);

afterAll(() => mongo.stop());

beforeEach(async () => {
  await mongo.db.collection("Pinning.pins").deleteMany({});
});

/** Narrow a result union to its success branch, failing the test otherwise. */
function ok<T>(result: T | { error: ForumErrorCode; detail?: string }): T {
  if (result && typeof result === "object" && "error" in result) {
    throw new Error(`Expected success but got error: ${result.error}`);
  }
  return result as T;
}

const item = (s: string) => s as ID;
const scope = (s: string) => s as ID;

describe("Pinning", () => {
  test("principle: pinned items sort by priority and drop out when unpinned", async () => {
    const s = scope("board");
    const announcement = item("announcement");
    const notice = item("notice");
    ok(await Pinning.pin({ item: announcement, scope: s, priority: 1 }));
    ok(await Pinning.pin({ item: notice, scope: s, priority: 5 }));
    // higher priority sorts ahead in the listing
    expect(await Pinning._getPinned({ scope: s })).toEqual([
      { item: notice, priority: 5 },
      { item: announcement, priority: 1 },
    ]);
    expect(await Pinning._isPinned({ item: announcement, scope: s })).toEqual([
      { pinned: true },
    ]);
    // unpinning drops the item from the listing
    ok(await Pinning.unpin({ item: notice, scope: s }));
    expect(await Pinning._isPinned({ item: notice, scope: s })).toEqual([
      { pinned: false },
    ]);
    expect(await Pinning._getPinned({ scope: s })).toEqual([
      { item: announcement, priority: 1 },
    ]);
  });

  test("pin requires no existing pin for the item and scope", async () => {
    const s = scope("s1");
    const i = item("i1");
    const { pin } = ok(await Pinning.pin({ item: i, scope: s, priority: 0 }));
    expect(pin).toBeString();
    expect(
      await Pinning.pin({ item: i, scope: s, priority: 9 }),
    ).toHaveProperty("error");
  });

  test("the same item can be pinned in different scopes", async () => {
    const i = item("i2");
    const s1 = scope("s2");
    const s2 = scope("s3");
    ok(await Pinning.pin({ item: i, scope: s1, priority: 1 }));
    ok(await Pinning.pin({ item: i, scope: s2, priority: 2 }));
    expect(await Pinning._isPinned({ item: i, scope: s1 })).toEqual([
      { pinned: true },
    ]);
    expect(await Pinning._isPinned({ item: i, scope: s2 })).toEqual([
      { pinned: true },
    ]);
  });

  test("unpin requires an existing pin", async () => {
    const s = scope("s4");
    const i = item("i3");
    expect(await Pinning.unpin({ item: i, scope: s })).toHaveProperty("error");
    const { pin } = ok(await Pinning.pin({ item: i, scope: s, priority: 0 }));
    const removed = ok(await Pinning.unpin({ item: i, scope: s }));
    expect(removed.pin).toBe(pin);
  });

  test("setPriority requires an existing pin and reorders the listing", async () => {
    const s = scope("s5");
    const a = item("a");
    const b = item("b");
    expect(
      await Pinning.setPriority({ item: a, scope: s, priority: 3 }),
    ).toHaveProperty("error");
    const pinned = ok(await Pinning.pin({ item: a, scope: s, priority: 1 }));
    ok(await Pinning.pin({ item: b, scope: s, priority: 2 }));
    // b leads while it has the higher priority
    expect(await Pinning._getPinned({ scope: s })).toEqual([
      { item: b, priority: 2 },
      { item: a, priority: 1 },
    ]);
    // raising a's priority promotes it ahead of b
    const updated = ok(
      await Pinning.setPriority({ item: a, scope: s, priority: 10 }),
    );
    expect(updated.pin).toBe(pinned.pin);
    expect(await Pinning._getPinned({ scope: s })).toEqual([
      { item: a, priority: 10 },
      { item: b, priority: 2 },
    ]);
  });

  test("namespaces isolate duplicate concept instances", async () => {
    const Featured = new PinningConcept(mongo.db, "Featured");
    const Sticky = new PinningConcept(mongo.db, "Sticky");

    const i = item("shared");
    const s = scope("scope");
    ok(await Featured.pin({ item: i, scope: s, priority: 1 }));

    expect(await Featured._isPinned({ item: i, scope: s })).toEqual([
      { pinned: true },
    ]);
    expect(await Sticky._isPinned({ item: i, scope: s })).toEqual([
      { pinned: false },
    ]);
    expect(await Pinning._isPinned({ item: i, scope: s })).toEqual([
      { pinned: false },
    ]);
  });

  test("_getPinned is empty for a scope with no pins", async () => {
    expect(await Pinning._getPinned({ scope: scope("empty") })).toEqual([]);
  });
});
