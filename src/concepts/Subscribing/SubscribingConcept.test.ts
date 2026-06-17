import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { setupTestDb } from "@utils/testing.ts";
import type { ID } from "@utils/types.ts";
import type { ForumErrorCode } from "../../sdk/error-codes.ts";
import SubscribingConcept from "./SubscribingConcept.ts";

const mongo = await setupTestDb();
const Subscribing = new SubscribingConcept(mongo.db);

afterAll(() => mongo.stop());

beforeEach(async () => {
  await mongo.db.collection("Subscribing.subscriptions").deleteMany({});
});

/** Narrow a result union to its success branch, failing the test otherwise. */
function ok<T>(result: T | { error: ForumErrorCode; detail?: string }): T {
  if (result && typeof result === "object" && "error" in result) {
    throw new Error(`Expected success but got error: ${result.error}`);
  }
  return result as T;
}

const user = (s: string) => s as ID;
const target = (s: string) => s as ID;

describe("Subscribing", () => {
  test("principle: subscribing routes events to a user until they unsubscribe", async () => {
    const u = user("alice");
    const t = target("channel1");
    ok(await Subscribing.subscribe({ user: u, target: t }));
    // the subscription is now observable from every angle
    expect(await Subscribing._isSubscribed({ user: u, target: t })).toEqual([
      { subscribed: true },
    ]);
    expect(await Subscribing._getSubscribers({ target: t })).toEqual([
      { user: u },
    ]);
    const subs = await Subscribing._getSubscriptions({ user: u });
    expect(subs).toHaveLength(1);
    expect(subs[0].target).toBe(t);
    // after unsubscribing, the user no longer appears anywhere
    ok(await Subscribing.unsubscribe({ user: u, target: t }));
    expect(await Subscribing._isSubscribed({ user: u, target: t })).toEqual([
      { subscribed: false },
    ]);
    expect(await Subscribing._getSubscribers({ target: t })).toEqual([]);
    expect(await Subscribing._getSubscriptions({ user: u })).toEqual([]);
  });

  test("subscribe requires no existing subscription for the pair", async () => {
    const u = user("bob");
    const t = target("channel2");
    const { subscription } = ok(
      await Subscribing.subscribe({ user: u, target: t }),
    );
    expect(subscription).toBeString();
    expect(await Subscribing.subscribe({ user: u, target: t })).toHaveProperty(
      "error",
    );
  });

  test("unsubscribe requires an existing subscription", async () => {
    const u = user("dave");
    const t = target("channel3");
    expect(
      await Subscribing.unsubscribe({ user: u, target: t }),
    ).toHaveProperty("error");
    const { subscription } = ok(
      await Subscribing.subscribe({ user: u, target: t }),
    );
    const removed = ok(await Subscribing.unsubscribe({ user: u, target: t }));
    expect(removed.subscription).toBe(subscription);
  });

  test("namespaces isolate duplicate concept instances", async () => {
    const Following = new SubscribingConcept(mongo.db, "Following");
    const Watching = new SubscribingConcept(mongo.db, "Watching");

    const u = user("erin");
    const t = target("repo1");
    ok(await Following.subscribe({ user: u, target: t }));

    expect(await Following._isSubscribed({ user: u, target: t })).toEqual([
      { subscribed: true },
    ]);
    expect(await Watching._isSubscribed({ user: u, target: t })).toEqual([
      { subscribed: false },
    ]);
    expect(await Subscribing._isSubscribed({ user: u, target: t })).toEqual([
      { subscribed: false },
    ]);
  });

  test("_getSubscribers returns every subscriber of a target", async () => {
    const t = target("channel4");
    ok(await Subscribing.subscribe({ user: user("u1"), target: t }));
    ok(await Subscribing.subscribe({ user: user("u2"), target: t }));
    const subscribers = await Subscribing._getSubscribers({ target: t });
    expect(subscribers).toHaveLength(2);
    expect(subscribers).toContainEqual({ user: user("u1") });
    expect(subscribers).toContainEqual({ user: user("u2") });
  });

  test("_getSubscriptions lists a user's targets newest-first", async () => {
    const u = user("frank");
    const t1 = target("first");
    const t2 = target("second");
    ok(await Subscribing.subscribe({ user: u, target: t1 }));
    ok(await Subscribing.subscribe({ user: u, target: t2 }));
    const subs = await Subscribing._getSubscriptions({ user: u });
    expect(subs).toHaveLength(2);
    expect(subs.map((s) => s.target)).toEqual([t2, t1]);
    expect(subs[0].createdAt).toBeInstanceOf(Date);
  });

  test("_isSubscribed reflects current state", async () => {
    const u = user("grace");
    const t = target("channel5");
    expect(await Subscribing._isSubscribed({ user: u, target: t })).toEqual([
      { subscribed: false },
    ]);
    ok(await Subscribing.subscribe({ user: u, target: t }));
    expect(await Subscribing._isSubscribed({ user: u, target: t })).toEqual([
      { subscribed: true },
    ]);
  });
});
