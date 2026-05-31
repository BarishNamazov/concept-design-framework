import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { setupTestDb } from "@utils/testing.ts";
import type { ID } from "@utils/types.ts";
import FlaggingConcept from "./FlaggingConcept.ts";

const mongo = await setupTestDb();
const Flagging = new FlaggingConcept(mongo.db);

afterAll(() => mongo.stop());

beforeEach(async () => {
  await mongo.db.collection("Flagging.flags").deleteMany({});
});

/** Narrow a result union to its success branch, failing the test otherwise. */
function ok<T>(result: T | { error: string }): T {
  if (result && typeof result === "object" && "error" in result) {
    throw new Error(`Expected success but got error: ${result.error}`);
  }
  return result as T;
}

const user = (s: string) => s as ID;
const target = (s: string) => s as ID;

describe("Flagging", () => {
  test("principle: community flags surface a target, staff resolution clears the queue", async () => {
    const t = target("post1");
    const alice = user("alice");
    const bob = user("bob");
    // two reporters flag the same target with their reasons
    ok(await Flagging.flag({ reporter: alice, target: t, reason: "spam" }));
    ok(await Flagging.flag({ reporter: bob, target: t, reason: "abuse" }));
    // the target appears in the staff review queue with both its flags
    expect(await Flagging._getOpenTargets()).toEqual([{ target: t, count: 2 }]);
    expect(await Flagging._hasFlagged({ reporter: alice, target: t })).toEqual([
      { flagged: true },
    ]);
    // staff uphold the flags, resolving the target
    ok(await Flagging.resolve({ target: t, outcome: "upheld" }));
    // it leaves the open queue and is no longer flagged
    expect(await Flagging._getOpenTargets()).toEqual([]);
    expect(await Flagging._hasFlagged({ reporter: alice, target: t })).toEqual([
      { flagged: false },
    ]);
    expect(await Flagging._hasFlagged({ reporter: bob, target: t })).toEqual([
      { flagged: false },
    ]);
  });

  test("flag requires no existing open flag by the same reporter", async () => {
    const t = target("post2");
    const u = user("carol");
    const { flag } = ok(
      await Flagging.flag({ reporter: u, target: t, reason: "off-topic" }),
    );
    expect(flag).toBeString();
    expect(
      await Flagging.flag({ reporter: u, target: t, reason: "again" }),
    ).toHaveProperty("error");
  });

  test("a reporter may flag again once their prior flag is resolved", async () => {
    const t = target("post3");
    const u = user("dave");
    ok(await Flagging.flag({ reporter: u, target: t, reason: "first" }));
    ok(await Flagging.resolve({ target: t, outcome: "dismissed" }));
    // the earlier flag is closed, so a new open flag is allowed
    const { flag } = ok(
      await Flagging.flag({ reporter: u, target: t, reason: "second" }),
    );
    expect(flag).toBeString();
    expect(await Flagging._hasFlagged({ reporter: u, target: t })).toEqual([
      { flagged: true },
    ]);
  });

  test("resolve requires a valid outcome", async () => {
    const t = target("post4");
    ok(await Flagging.flag({ reporter: user("erin"), target: t, reason: "x" }));
    expect(
      await Flagging.resolve({ target: t, outcome: "pending" }),
    ).toHaveProperty("error");
    // the flag remains open after an invalid outcome
    expect(await Flagging._getOpenTargets()).toEqual([{ target: t, count: 1 }]);
  });

  test("resolve requires at least one open flag on the target", async () => {
    const t = target("post5");
    expect(
      await Flagging.resolve({ target: t, outcome: "upheld" }),
    ).toHaveProperty("error");
  });

  test("_getOpenTargets orders busiest targets first and excludes resolved ones", async () => {
    const hot = target("hot");
    const warm = target("warm");
    const cold = target("cold");
    ok(await Flagging.flag({ reporter: user("u1"), target: hot, reason: "a" }));
    ok(await Flagging.flag({ reporter: user("u2"), target: hot, reason: "b" }));
    ok(await Flagging.flag({ reporter: user("u3"), target: hot, reason: "c" }));
    ok(
      await Flagging.flag({ reporter: user("u1"), target: warm, reason: "d" }),
    );
    ok(
      await Flagging.flag({ reporter: user("u2"), target: warm, reason: "e" }),
    );
    ok(
      await Flagging.flag({ reporter: user("u1"), target: cold, reason: "f" }),
    );
    expect(await Flagging._getOpenTargets()).toEqual([
      { target: hot, count: 3 },
      { target: warm, count: 2 },
      { target: cold, count: 1 },
    ]);
    // resolving the busiest target removes it from the queue
    ok(await Flagging.resolve({ target: hot, outcome: "dismissed" }));
    expect(await Flagging._getOpenTargets()).toEqual([
      { target: warm, count: 2 },
      { target: cold, count: 1 },
    ]);
  });

  test("_getFlags returns every flag on a target with its details", async () => {
    const t = target("post6");
    const alice = user("alice");
    const bob = user("bob");
    const a = ok(
      await Flagging.flag({ reporter: alice, target: t, reason: "spam" }),
    );
    const b = ok(
      await Flagging.flag({ reporter: bob, target: t, reason: "abuse" }),
    );
    const flags = await Flagging._getFlags({ target: t });
    expect(flags).toHaveLength(2);
    expect(flags).toContainEqual({
      flag: a.flag,
      reporter: alice,
      reason: "spam",
      status: "open",
      createdAt: expect.any(Date),
    });
    expect(flags).toContainEqual({
      flag: b.flag,
      reporter: bob,
      reason: "abuse",
      status: "open",
      createdAt: expect.any(Date),
    });
    // resolution is reflected in the recorded status
    ok(await Flagging.resolve({ target: t, outcome: "upheld" }));
    const resolved = await Flagging._getFlags({ target: t });
    expect(resolved.every((f) => f.status === "upheld")).toBe(true);
  });

  test("_hasFlagged reflects only the reporter's own open flag", async () => {
    const t = target("post7");
    const alice = user("alice");
    const bob = user("bob");
    expect(await Flagging._hasFlagged({ reporter: alice, target: t })).toEqual([
      { flagged: false },
    ]);
    ok(await Flagging.flag({ reporter: alice, target: t, reason: "spam" }));
    expect(await Flagging._hasFlagged({ reporter: alice, target: t })).toEqual([
      { flagged: true },
    ]);
    // bob has not flagged this target
    expect(await Flagging._hasFlagged({ reporter: bob, target: t })).toEqual([
      { flagged: false },
    ]);
  });

  test("namespaces isolate duplicate concept instances", async () => {
    const Reports = new FlaggingConcept(mongo.db, "Reports");
    const Appeals = new FlaggingConcept(mongo.db, "Appeals");
    const t = target("shared");
    const u = user("frank");

    ok(await Reports.flag({ reporter: u, target: t, reason: "in reports" }));
    ok(await Appeals.flag({ reporter: u, target: t, reason: "in appeals" }));

    expect(await Reports._getOpenTargets()).toEqual([{ target: t, count: 1 }]);
    expect(await Appeals._getOpenTargets()).toEqual([{ target: t, count: 1 }]);
    expect(await Flagging._getOpenTargets()).toEqual([]);

    // resolving in one namespace leaves the other untouched
    ok(await Reports.resolve({ target: t, outcome: "upheld" }));
    expect(await Reports._getOpenTargets()).toEqual([]);
    expect(await Appeals._getOpenTargets()).toEqual([{ target: t, count: 1 }]);
  });
});
