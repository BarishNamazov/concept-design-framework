import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { freshID } from "@utils/database.ts";
import { setupTestDb } from "@utils/testing.ts";
import type { ID } from "@utils/types.ts";
import type { ForumErrorCode } from "../../sdk/error-codes.ts";
import TrackingConcept from "./TrackingConcept.ts";

const mongo = await setupTestDb();
const Tracking = new TrackingConcept(mongo.db);

afterAll(() => mongo.stop());

beforeEach(async () => {
  await mongo.db.collection("Tracking.items").deleteMany({});
  await mongo.db.collection("Tracking.seenMarks").deleteMany({});
});

/** Narrow a result union to its success branch, failing the test otherwise. */
function ok<T>(result: T | { error: ForumErrorCode; detail?: string }): T {
  if (result && typeof result === "object" && "error" in result) {
    throw new Error(`Expected success but got error: ${result.error}`);
  }
  return result as T;
}

const id = () => freshID() as ID;

describe("Tracking", () => {
  test("principle: new item is unread, marking seen removes it, unseen returns it", async () => {
    const user = id();
    const scope = id();
    const item = id();
    ok(await Tracking.register({ item, scope }));

    expect(await Tracking._getUnread({ user, scope })).toEqual([{ item }]);

    ok(await Tracking.markSeen({ user, item }));
    expect(await Tracking._getUnread({ user, scope })).toEqual([]);
    expect(await Tracking._getSeen({ user, scope })).toEqual([{ item }]);

    ok(await Tracking.markUnseen({ user, item }));
    expect(await Tracking._getUnread({ user, scope })).toEqual([{ item }]);
  });

  test("register requires the item not be already registered", async () => {
    const scope = id();
    const item = id();
    ok(await Tracking.register({ item, scope }));
    expect(await Tracking.register({ item, scope })).toHaveProperty("error");
  });

  test("unregister removes item and its SeenMarks", async () => {
    const user = id();
    const scope = id();
    const item = id();
    ok(await Tracking.register({ item, scope }));
    ok(await Tracking.markSeen({ user, item }));

    ok(await Tracking.unregister({ item }));
    expect(await Tracking._getItemsInScope({ scope })).toEqual([]);
    expect(await Tracking._isSeen({ user, item })).toEqual([{ seen: false }]);
    expect(await Tracking.unregister({ item })).toHaveProperty("error");
  });

  test("markSeen requires registration and at most one mark per (user,item)", async () => {
    const user = id();
    const scope = id();
    const item = id();
    expect(await Tracking.markSeen({ user, item })).toHaveProperty("error");
    ok(await Tracking.register({ item, scope }));
    ok(await Tracking.markSeen({ user, item }));
    expect(await Tracking.markSeen({ user, item })).toHaveProperty("error");
  });

  test("markUnseen requires an existing SeenMark", async () => {
    const user = id();
    const scope = id();
    const item = id();
    ok(await Tracking.register({ item, scope }));
    expect(await Tracking.markUnseen({ user, item })).toHaveProperty("error");
  });

  test("markAllSeen marks every registered item in scope for the user", async () => {
    const user = id();
    const scope = id();
    const a = id();
    const b = id();
    ok(await Tracking.register({ item: a, scope }));
    ok(await Tracking.register({ item: b, scope }));

    ok(await Tracking.markAllSeen({ user, scope }));
    expect(await Tracking._getUnread({ user, scope })).toEqual([]);
    expect(await Tracking._getUnreadCount({ user, scope })).toEqual([
      { count: 0 },
    ]);
  });

  test("queries: unread count and isSeen reflect state, scopes are isolated", async () => {
    const user = id();
    const scopeA = id();
    const scopeB = id();
    const a1 = id();
    const a2 = id();
    const b1 = id();
    ok(await Tracking.register({ item: a1, scope: scopeA }));
    ok(await Tracking.register({ item: a2, scope: scopeA }));
    ok(await Tracking.register({ item: b1, scope: scopeB }));

    expect(await Tracking._getUnreadCount({ user, scope: scopeA })).toEqual([
      { count: 2 },
    ]);
    ok(await Tracking.markSeen({ user, item: a1 }));
    expect(await Tracking._getUnreadCount({ user, scope: scopeA })).toEqual([
      { count: 1 },
    ]);
    expect(await Tracking._isSeen({ user, item: a1 })).toEqual([
      { seen: true },
    ]);
    expect(await Tracking._isSeen({ user, item: a2 })).toEqual([
      { seen: false },
    ]);
    expect(await Tracking._getUnreadCount({ user, scope: scopeB })).toEqual([
      { count: 1 },
    ]);
  });
});
