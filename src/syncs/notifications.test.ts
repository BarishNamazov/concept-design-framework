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

async function registerAndLogin(username: string): Promise<string> {
  await app.send("/auth/register", {
    username,
    password: "pw",
    displayName: username,
  });
  const { session } = await app.send("/auth/login", {
    username,
    password: "pw",
  });
  return session;
}

describe("notification synchronizations", () => {
  test("list is empty for a fresh user", async () => {
    const session = await registerAndLogin("notif_alice");
    const res = await app.send("/notifications/list", { session });
    expect(res.notifications).toEqual([]);
  });

  test("unreadCount is zero for a fresh user", async () => {
    const session = await registerAndLogin("notif_bob");
    const res = await app.send("/notifications/unreadCount", { session });
    expect(res.count).toBe(0);
  });

  test("markAllRead succeeds and returns the recipient", async () => {
    const session = await registerAndLogin("notif_carol");
    const res = await app.send("/notifications/markAllRead", { session });
    expect(res.recipient).toBeDefined();
    expect(res.error).toBeUndefined();
  });

  test("markRead with a bogus notification id returns an error", async () => {
    const session = await registerAndLogin("notif_dave");
    const res = await app.send("/notifications/markRead", {
      session,
      notification: "does-not-exist",
    });
    expect(res.error).toBeDefined();
    expect(res.notification).toBeUndefined();
  });

  test("dismiss with a bogus notification id returns an error", async () => {
    const session = await registerAndLogin("notif_erin");
    const res = await app.send("/notifications/dismiss", {
      session,
      notification: "does-not-exist",
    });
    expect(res.error).toBeDefined();
    expect(res.notification).toBeUndefined();
  });

  test("every endpoint rejects an invalid session", async () => {
    const session = "does-not-exist";

    const list = await app.send("/notifications/list", { session });
    expect(list.error).toBeDefined();
    expect(list.notifications).toBeUndefined();

    const count = await app.send("/notifications/unreadCount", { session });
    expect(count.error).toBeDefined();
    expect(count.count).toBeUndefined();

    const markRead = await app.send("/notifications/markRead", {
      session,
      notification: "does-not-exist",
    });
    expect(markRead.error).toBeDefined();

    const markAllRead = await app.send("/notifications/markAllRead", {
      session,
    });
    expect(markAllRead.error).toBeDefined();
    expect(markAllRead.recipient).toBeUndefined();

    const dismiss = await app.send("/notifications/dismiss", {
      session,
      notification: "does-not-exist",
    });
    expect(dismiss.error).toBeDefined();
  });
});
