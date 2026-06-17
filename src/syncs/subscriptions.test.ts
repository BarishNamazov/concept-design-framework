import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { setupApp, type TestApp } from "@utils/app_testing.ts";

let app: TestApp;

beforeEach(async () => {
  if (!app) app = await setupApp();
  await app.reset();
});

afterAll(async () => {
  await app?.stop();
});

async function register(username: string): Promise<string> {
  const res = await app.send("/auth/register", {
    username,
    password: "pw",
    displayName: username,
    email: `${username}@example.com`,
  });
  expect(res.user).toBeDefined();
  return res.user as string;
}

async function login(username: string): Promise<string> {
  const res = await app.send("/auth/login", { username, password: "pw" });
  expect(res.session).toBeDefined();
  return res.session as string;
}

describe("subscription synchronizations", () => {
  const target = "t1";

  test("subscribe records a subscription and reflects across the queries", async () => {
    const aliceId = await register("alice");
    const aliceSession = await login("alice");

    const sub = await app.send("/subscriptions/subscribe", {
      session: aliceSession,
      target,
    });
    expect(sub.subscription).toBeDefined();
    expect(sub.error).toBeUndefined();

    // /subscriptions/mine lists the subscribed target.
    const mine = await app.send("/subscriptions/mine", {
      session: aliceSession,
    });
    expect(Array.isArray(mine.subscriptions)).toBe(true);
    expect(mine.subscriptions).toHaveLength(1);
    expect(mine.subscriptions[0].target).toBe(target);

    // /subscriptions/subscribers includes alice's user id.
    const subscribers = await app.send("/subscriptions/subscribers", {
      target,
    });
    expect(Array.isArray(subscribers.subscribers)).toBe(true);
    const subscriberUsers = subscribers.subscribers.map(
      (s: { user: string }) => s.user,
    );
    expect(subscriberUsers).toContain(aliceId);
  });

  test("isSubscribed is true for the subscriber and false for others", async () => {
    await register("alice");
    const aliceSession = await login("alice");
    await register("bob");
    const bobSession = await login("bob");

    await app.send("/subscriptions/subscribe", {
      session: aliceSession,
      target,
    });

    const aliceCheck = await app.send("/subscriptions/isSubscribed", {
      session: aliceSession,
      target,
    });
    expect(aliceCheck.subscribed).toBe(true);

    const bobCheck = await app.send("/subscriptions/isSubscribed", {
      session: bobSession,
      target,
    });
    expect(bobCheck.subscribed).toBe(false);
  });

  test("subscribing twice to the same target returns an error", async () => {
    await register("alice");
    const aliceSession = await login("alice");

    const first = await app.send("/subscriptions/subscribe", {
      session: aliceSession,
      target,
    });
    expect(first.subscription).toBeDefined();

    const second = await app.send("/subscriptions/subscribe", {
      session: aliceSession,
      target,
    });
    expect(second.error).toBeDefined();
    expect(second.subscription).toBeUndefined();
  });

  test("unsubscribe clears the subscription everywhere", async () => {
    await register("alice");
    const aliceSession = await login("alice");

    await app.send("/subscriptions/subscribe", {
      session: aliceSession,
      target,
    });

    const removed = await app.send("/subscriptions/unsubscribe", {
      session: aliceSession,
      target,
    });
    expect(removed.subscription).toBeDefined();
    expect(removed.error).toBeUndefined();

    const mine = await app.send("/subscriptions/mine", {
      session: aliceSession,
    });
    expect(mine.subscriptions).toHaveLength(0);

    const check = await app.send("/subscriptions/isSubscribed", {
      session: aliceSession,
      target,
    });
    expect(check.subscribed).toBe(false);
  });

  test("unsubscribing without a subscription returns an error", async () => {
    await register("alice");
    const aliceSession = await login("alice");

    const res = await app.send("/subscriptions/unsubscribe", {
      session: aliceSession,
      target,
    });
    expect(res.error).toBeDefined();
    expect(res.subscription).toBeUndefined();
  });

  test("mutating and session-gated endpoints reject an invalid session", async () => {
    const session = "does-not-exist";

    const subscribe = await app.send("/subscriptions/subscribe", {
      session,
      target,
    });
    expect(subscribe.error).toBeDefined();
    expect(subscribe.subscription).toBeUndefined();

    const unsubscribe = await app.send("/subscriptions/unsubscribe", {
      session,
      target,
    });
    expect(unsubscribe.error).toBeDefined();
    expect(unsubscribe.subscription).toBeUndefined();

    const mine = await app.send("/subscriptions/mine", { session });
    expect(mine.error).toBeDefined();
    expect(mine.subscriptions).toBeUndefined();

    const check = await app.send("/subscriptions/isSubscribed", {
      session,
      target,
    });
    expect(check.error).toBeDefined();
    expect(check.subscribed).toBeUndefined();
  });
});
