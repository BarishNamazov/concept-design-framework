import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { setupTestDb } from "@utils/testing.ts";
import type { ID } from "@utils/types.ts";
import type { ForumErrorCode } from "../../sdk/error-codes.ts";
import LateBankingConcept from "./LateBankingConcept.ts";

const mongo = await setupTestDb();
const LateBanking = new LateBankingConcept(mongo.db);

afterAll(() => mongo.stop());

beforeEach(async () => {
  await mongo.db.collection("LateBanking.policy").deleteMany({});
  await mongo.db.collection("LateBanking.grants").deleteMany({});
  await mongo.db.collection("LateBanking.uses").deleteMany({});
});

/** Narrow a result union to its success branch, failing the test otherwise. */
function ok<T>(result: T | { error: ForumErrorCode; detail?: string }): T {
  if (result && typeof result === "object" && "error" in result) {
    throw new Error(`Expected success but got error: ${result.error}`);
  }
  return result as T;
}

const learner = (s: string) => s as ID;
const item = (s: string) => s as ID;

describe("LateBanking", () => {
  test("configurePolicy sets defaults correctly", async () => {
    ok(
      await LateBanking.configurePolicy({
        defaultDays: 3,
        unitHours: 12,
        maxDaysPerItem: 2,
      }),
    );
    expect(await LateBanking._getPolicy()).toEqual([
      { defaultDays: 3, unitHours: 12, maxDaysPerItem: 2 },
    ]);
  });

  test("_getPolicy returns defaults when not configured", async () => {
    expect(await LateBanking._getPolicy()).toEqual([
      { defaultDays: 0, unitHours: 24, maxDaysPerItem: 5 },
    ]);
  });

  test("grant adds bonus days for a learner", async () => {
    const l = learner("alice");
    ok(await LateBanking.configurePolicy({ defaultDays: 1 }));
    const { grant } = ok(
      await LateBanking.grant({ learner: l, days: 3, reason: "medical" }),
    );
    expect(grant).toBeString();
    const [{ granted, used, remaining }] = await LateBanking._getBalance({
      learner: l,
    });
    expect(granted).toBe(4); // 1 default + 3 grant
    expect(used).toBe(0);
    expect(remaining).toBe(4);
  });

  test("apply reduces balance and creates APPLIED use", async () => {
    const l = learner("bob");
    const i = item("hw1");
    ok(await LateBanking.configurePolicy({ defaultDays: 2 }));
    const [balanceBefore] = await LateBanking._getBalance({ learner: l });
    expect(balanceBefore.remaining).toBe(2);

    const { use } = ok(
      await LateBanking.apply({ learner: l, item: i, days: 2 }),
    );
    expect(use).toBeString();

    const [balanceAfter] = await LateBanking._getBalance({ learner: l });
    expect(balanceAfter.remaining).toBe(0);

    const [applied] = await LateBanking._getApplied({ learner: l, item: i });
    expect(applied.days).toBe(2);
  });

  test("apply fails when remaining balance insufficient", async () => {
    const l = learner("carol");
    const i = item("hw2");
    ok(await LateBanking.configurePolicy({ defaultDays: 1 }));
    ok(await LateBanking.apply({ learner: l, item: i, days: 1 }));
    const result = await LateBanking.apply({
      learner: l,
      item: item("hw3"),
      days: 1,
    });
    expect(result).toHaveProperty("error");
  });

  test("apply fails when exceeds maxDaysPerItem", async () => {
    const l = learner("dave");
    const i = item("hw4");
    ok(
      await LateBanking.configurePolicy({ defaultDays: 10, maxDaysPerItem: 3 }),
    );
    const result = await LateBanking.apply({ learner: l, item: i, days: 4 });
    expect(result).toHaveProperty("error");
  });

  test("apply fails for zero days", async () => {
    const l = learner("erin");
    const i = item("hw5");
    ok(await LateBanking.configurePolicy({ defaultDays: 1 }));
    const result = await LateBanking.apply({ learner: l, item: i, days: 0 });
    expect(result).toHaveProperty("error");
  });

  test("apply fails for duplicate (learner, item) with existing APPLIED", async () => {
    const l = learner("frank");
    const i = item("hw6");
    ok(await LateBanking.configurePolicy({ defaultDays: 5 }));
    ok(await LateBanking.apply({ learner: l, item: i, days: 1 }));
    const result = await LateBanking.apply({ learner: l, item: i, days: 2 });
    expect(result).toHaveProperty("error");
  });

  test("changeUse updates existing use days", async () => {
    const l = learner("grace");
    const i = item("hw7");
    ok(
      await LateBanking.configurePolicy({ defaultDays: 5, maxDaysPerItem: 5 }),
    );
    const { use } = ok(
      await LateBanking.apply({ learner: l, item: i, days: 1 }),
    );

    const { use: updatedUse } = ok(
      await LateBanking.changeUse({ learner: l, item: i, days: 3 }),
    );
    expect(updatedUse).toBe(use);

    const [applied] = await LateBanking._getApplied({ learner: l, item: i });
    expect(applied.days).toBe(3);

    const [balance] = await LateBanking._getBalance({ learner: l });
    expect(balance.remaining).toBe(2);
  });

  test("changeUse allows reducing days to restore balance", async () => {
    const l = learner("heidi");
    const i = item("hw8");
    ok(await LateBanking.configurePolicy({ defaultDays: 5 }));
    ok(await LateBanking.apply({ learner: l, item: i, days: 3 }));

    ok(await LateBanking.changeUse({ learner: l, item: i, days: 1 }));

    const [balance] = await LateBanking._getBalance({ learner: l });
    expect(balance.remaining).toBe(4);

    const [applied] = await LateBanking._getApplied({ learner: l, item: i });
    expect(applied.days).toBe(1);
  });

  test("cancelUse changes APPLIED to CANCELED and restores balance", async () => {
    const l = learner("ivan");
    const i = item("hw9");
    ok(await LateBanking.configurePolicy({ defaultDays: 3 }));
    const { use } = ok(
      await LateBanking.apply({ learner: l, item: i, days: 2 }),
    );

    const { use: canceledUse } = ok(
      await LateBanking.cancelUse({ learner: l, item: i }),
    );
    expect(canceledUse).toBe(use);

    const [balance] = await LateBanking._getBalance({ learner: l });
    expect(balance.remaining).toBe(3);

    const uses = await LateBanking._getUses({ learner: l });
    expect(uses).toHaveLength(1);
    expect(uses[0]?.status).toBe("CANCELED");
  });

  test("cancelUse fails for non-existent use", async () => {
    const l = learner("judy");
    const i = item("hw10");
    const result = await LateBanking.cancelUse({ learner: l, item: i });
    expect(result).toHaveProperty("error");
  });

  test("_getBalance sums grants minus uses", async () => {
    const l = learner("mallory");
    ok(await LateBanking.configurePolicy({ defaultDays: 2 }));
    ok(
      await LateBanking.grant({ learner: l, days: 5, reason: "accommodation" }),
    );
    ok(await LateBanking.apply({ learner: l, item: item("a"), days: 1 }));
    ok(await LateBanking.apply({ learner: l, item: item("b"), days: 2 }));

    const [balance] = await LateBanking._getBalance({ learner: l });
    expect(balance.granted).toBe(7); // 2 default + 5 grant
    expect(balance.used).toBe(3);
    expect(balance.remaining).toBe(4);
  });

  test("_getUses returns all uses for learner", async () => {
    const l = learner("nancy");
    ok(await LateBanking.configurePolicy({ defaultDays: 10 }));
    const i1 = item("x");
    const i2 = item("y");
    ok(await LateBanking.apply({ learner: l, item: i1, days: 1 }));
    ok(await LateBanking.apply({ learner: l, item: i2, days: 2 }));
    ok(await LateBanking.cancelUse({ learner: l, item: i2 }));

    const uses = await LateBanking._getUses({ learner: l });
    expect(uses).toHaveLength(2);
    expect(uses).toContainEqual(
      expect.objectContaining({ item: i1, days: 1, status: "APPLIED" }),
    );
    expect(uses).toContainEqual(
      expect.objectContaining({ item: i2, days: 2, status: "CANCELED" }),
    );
  });

  test("_getUsersForItem returns all learners with applied days for an item", async () => {
    const l1 = learner("oscar");
    const l2 = learner("peggy");
    const i = item("shared");
    ok(await LateBanking.configurePolicy({ defaultDays: 10 }));
    ok(await LateBanking.apply({ learner: l1, item: i, days: 2 }));
    ok(await LateBanking.apply({ learner: l2, item: i, days: 1 }));

    const users = await LateBanking._getUsersForItem({ item: i });
    expect(users).toHaveLength(2);
    expect(users).toContainEqual({ learner: l1, days: 2 });
    expect(users).toContainEqual({ learner: l2, days: 1 });
  });

  test("Multiple grants accumulate correctly", async () => {
    const l = learner("quinn");
    ok(await LateBanking.configurePolicy({ defaultDays: 1 }));
    ok(await LateBanking.grant({ learner: l, days: 2, reason: "medical" }));
    ok(await LateBanking.grant({ learner: l, days: 3, reason: "athletic" }));

    const [balance] = await LateBanking._getBalance({ learner: l });
    expect(balance.granted).toBe(6); // 1 default + 2 + 3
    expect(balance.used).toBe(0);
    expect(balance.remaining).toBe(6);
  });

  test("Balance with no grants/uses is just policy defaultDays", async () => {
    const l = learner("ruth");
    ok(await LateBanking.configurePolicy({ defaultDays: 4 }));

    const [balance] = await LateBanking._getBalance({ learner: l });
    expect(balance.granted).toBe(4);
    expect(balance.used).toBe(0);
    expect(balance.remaining).toBe(4);
  });

  test("_getApplied returns 0 when no APPLIED use exists", async () => {
    const l = learner("steve");
    const i = item("never");
    const [applied] = await LateBanking._getApplied({ learner: l, item: i });
    expect(applied.days).toBe(0);
  });

  test("canceled uses do not count toward balance", async () => {
    const l = learner("tina");
    ok(await LateBanking.configurePolicy({ defaultDays: 2 }));
    ok(await LateBanking.apply({ learner: l, item: item("z1"), days: 1 }));
    ok(await LateBanking.apply({ learner: l, item: item("z2"), days: 1 }));
    ok(await LateBanking.cancelUse({ learner: l, item: item("z1") }));

    const [balance] = await LateBanking._getBalance({ learner: l });
    expect(balance.granted).toBe(2);
    expect(balance.used).toBe(1);
    expect(balance.remaining).toBe(1);
  });

  test("namespaces isolate duplicate concept instances", async () => {
    const Physics = new LateBankingConcept(mongo.db, "Physics");
    const History = new LateBankingConcept(mongo.db, "History");

    const _l = learner("uma");
    ok(await Physics.configurePolicy({ defaultDays: 3 }));
    ok(await History.configurePolicy({ defaultDays: 2 }));

    expect(await Physics._getPolicy()).toEqual([
      { defaultDays: 3, unitHours: 24, maxDaysPerItem: 5 },
    ]);
    expect(await History._getPolicy()).toEqual([
      { defaultDays: 2, unitHours: 24, maxDaysPerItem: 5 },
    ]);
    expect(await LateBanking._getPolicy()).toEqual([
      { defaultDays: 0, unitHours: 24, maxDaysPerItem: 5 },
    ]);

    await mongo.db.collection("Physics.policy").deleteMany({});
    await mongo.db.collection("History.policy").deleteMany({});
  });
});
