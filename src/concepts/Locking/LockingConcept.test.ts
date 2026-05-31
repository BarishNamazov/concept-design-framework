import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { setupTestDb } from "@utils/testing.ts";
import type { ID } from "@utils/types.ts";
import LockingConcept from "./LockingConcept.ts";

const mongo = await setupTestDb();
const Locking = new LockingConcept(mongo.db);

afterAll(() => mongo.stop());

beforeEach(async () => {
  await mongo.db.collection("Locking.locked").deleteMany({});
});

/** Narrow a result union to its success branch, failing the test otherwise. */
function ok<T>(result: T | { error: string }): T {
  if (result && typeof result === "object" && "error" in result) {
    throw new Error(`Expected success but got error: ${result.error}`);
  }
  return result as T;
}

const target = (s: string) => s as ID;

describe("Locking", () => {
  test("principle: locking freezes a target until it is unlocked", async () => {
    const t = target("thread1");
    // initially the target is open
    expect(await Locking._isLocked({ target: t })).toEqual([{ locked: false }]);
    expect(await Locking._getLocked()).toEqual([]);
    // locking it makes it appear as locked
    ok(await Locking.lock({ target: t }));
    expect(await Locking._isLocked({ target: t })).toEqual([{ locked: true }]);
    const locked = await Locking._getLocked();
    expect(locked).toHaveLength(1);
    expect(locked[0].target).toBe(t);
    expect(locked[0].lockedAt).toBeInstanceOf(Date);
    // unlocking it restores the open state
    ok(await Locking.unlock({ target: t }));
    expect(await Locking._isLocked({ target: t })).toEqual([{ locked: false }]);
    expect(await Locking._getLocked()).toEqual([]);
  });

  test("lock requires the target not to be already locked", async () => {
    const t = target("thread2");
    ok(await Locking.lock({ target: t }));
    expect(await Locking.lock({ target: t })).toHaveProperty("error");
  });

  test("unlock requires the target to be locked", async () => {
    const t = target("thread3");
    expect(await Locking.unlock({ target: t })).toHaveProperty("error");
  });

  test("a target can be re-locked after being unlocked", async () => {
    const t = target("thread4");
    ok(await Locking.lock({ target: t }));
    ok(await Locking.unlock({ target: t }));
    ok(await Locking.lock({ target: t }));
    expect(await Locking._isLocked({ target: t })).toEqual([{ locked: true }]);
  });

  test("_getLocked returns every locked target", async () => {
    const t1 = target("thread5");
    const t2 = target("thread6");
    ok(await Locking.lock({ target: t1 }));
    ok(await Locking.lock({ target: t2 }));
    const locked = await Locking._getLocked();
    expect(locked).toHaveLength(2);
    expect(locked.map((l) => l.target)).toContain(t1);
    expect(locked.map((l) => l.target)).toContain(t2);
  });

  test("namespaces isolate duplicate concept instances", async () => {
    const Posts = new LockingConcept(mongo.db, "PostLocks");
    const Threads = new LockingConcept(mongo.db, "ThreadLocks");

    const t = target("shared");
    ok(await Posts.lock({ target: t }));

    expect(await Posts._isLocked({ target: t })).toEqual([{ locked: true }]);
    expect(await Threads._isLocked({ target: t })).toEqual([{ locked: false }]);
    expect(await Locking._isLocked({ target: t })).toEqual([{ locked: false }]);
  });
});
