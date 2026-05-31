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

async function registerAndLogin(
  username: string,
  displayName = username,
): Promise<{ user: string; session: string }> {
  const { user } = await app.send("/auth/register", {
    username,
    password: "pw",
    displayName,
  });
  const { session } = await app.send("/auth/login", {
    username,
    password: "pw",
  });
  return { user, session };
}

describe("lock synchronizations", () => {
  test("lock freezes a target and reflects in isLocked and list", async () => {
    const { session } = await registerAndLogin("lock_alice");

    const res = await app.send("/locks/lock", { session, target: "t1" });
    expect(res).toEqual({ target: "t1" });

    const isLocked = await app.send("/locks/isLocked", { target: "t1" });
    expect(isLocked.locked).toBe(true);

    const list = await app.send("/locks/list", {});
    expect(list.locked.map(($: { target: string }) => $.target)).toContain(
      "t1",
    );
  });

  test("locking an already locked target errors", async () => {
    const { session } = await registerAndLogin("lock_bob");
    await app.send("/locks/lock", { session, target: "t1" });

    const dup = await app.send("/locks/lock", { session, target: "t1" });
    expect(dup.error).toBeDefined();
    expect(dup.target).toBeUndefined();
  });

  test("unlock releases a target", async () => {
    const { session } = await registerAndLogin("lock_carol");
    await app.send("/locks/lock", { session, target: "t1" });

    const res = await app.send("/locks/unlock", { session, target: "t1" });
    expect(res).toEqual({ target: "t1" });

    const isLocked = await app.send("/locks/isLocked", { target: "t1" });
    expect(isLocked.locked).toBe(false);

    const list = await app.send("/locks/list", {});
    expect(list.locked).toEqual([]);
  });

  test("unlocking a target that is not locked errors", async () => {
    const { session } = await registerAndLogin("lock_dave");

    const res = await app.send("/locks/unlock", { session, target: "t1" });
    expect(res.error).toBeDefined();
    expect(res.target).toBeUndefined();
  });

  test("lock with an invalid session errors", async () => {
    const res = await app.send("/locks/lock", {
      session: "nope",
      target: "t1",
    });
    expect(res.error).toBe("Invalid or expired session.");
  });

  test("unlock with an invalid session errors", async () => {
    const res = await app.send("/locks/unlock", {
      session: "nope",
      target: "t1",
    });
    expect(res.error).toBe("Invalid or expired session.");
  });
});
