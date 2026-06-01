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

/** Bootstrap a forum administrator (holds both `administer` and `moderate`). */
async function establishAdmin(
  username: string,
): Promise<{ user: string; session: string }> {
  const admin = await registerAndLogin(username);
  await app.send("/roles/define", {
    session: admin.session,
    name: "administrator",
    capabilities: ["administer", "moderate"],
  });
  await app.send("/roles/grant", {
    session: admin.session,
    user: admin.user,
    context: "forum",
    role: "administrator",
  });
  return admin;
}

describe("lock authorization", () => {
  test("once the forum has an admin, an ordinary member cannot lock", async () => {
    await establishAdmin("lock_admin");
    const member = await registerAndLogin("lock_member");

    const res = await app.send("/locks/lock", {
      session: member.session,
      target: "t1",
    });
    expect(res.error).toBe("Not authorized to lock targets.");
    expect(res.target).toBeUndefined();

    const isLocked = await app.send("/locks/isLocked", { target: "t1" });
    expect(isLocked.locked).toBe(false);
  });

  test("a forum moderator can lock and unlock", async () => {
    const admin = await establishAdmin("lock_admin2");
    const mod = await registerAndLogin("lock_mod");
    await app.send("/roles/define", {
      session: admin.session,
      name: "moderator",
      capabilities: ["moderate"],
    });
    await app.send("/roles/grant", {
      session: admin.session,
      user: mod.user,
      context: "forum",
      role: "moderator",
    });

    const locked = await app.send("/locks/lock", {
      session: mod.session,
      target: "t1",
    });
    expect(locked).toEqual({ target: "t1" });

    const unlocked = await app.send("/locks/unlock", {
      session: mod.session,
      target: "t1",
    });
    expect(unlocked).toEqual({ target: "t1" });
  });

  test("an ordinary member cannot unlock a moderator's lock", async () => {
    const admin = await establishAdmin("lock_admin3");
    const member = await registerAndLogin("lock_member3");
    await app.send("/locks/lock", { session: admin.session, target: "t1" });

    const res = await app.send("/locks/unlock", {
      session: member.session,
      target: "t1",
    });
    expect(res.error).toBe("Not authorized to lock targets.");

    const isLocked = await app.send("/locks/isLocked", { target: "t1" });
    expect(isLocked.locked).toBe(true);
  });
});
