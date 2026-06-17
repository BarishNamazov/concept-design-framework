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
): Promise<{ user: string; session: string }> {
  const { user } = await app.send("/auth/register", {
    username,
    password: "password123",
    displayName: username,
    email: `${username}@example.com`,
  });
  const { session } = await app.send("/auth/login", {
    username,
    password: "password123",
  });
  return { user, session };
}

/** Grant `user` the global `"moderate"` capability in the `"forum"` context. */
async function grantModerator(session: string, user: string): Promise<void> {
  await app.send("/roles/define", {
    session,
    name: "moderator",
    capabilities: ["moderate"],
  });
  await app.send("/roles/grant", {
    session,
    user,
    context: "forum",
    role: "moderator",
  });
}

describe("flagging synchronizations", () => {
  test("any signed-in user can raise a flag", async () => {
    const { session } = await registerAndLogin("flag_alice");

    const res = await app.send("/flags/raise", {
      session,
      target: "post1",
      reason: "spam",
    });
    expect(res.flag).toBeDefined();
    expect(res.error).toBeUndefined();

    const forTarget = await app.send("/flags/forTarget", { target: "post1" });
    expect(forTarget.flags).toHaveLength(1);
    expect(forTarget.flags[0].reason).toBe("spam");
  });

  test("an invalid session cannot raise a flag", async () => {
    const res = await app.send("/flags/raise", {
      session: "nope",
      target: "post1",
      reason: "spam",
    });
    expect(res.error).toBeDefined();
    expect(res.flag).toBeUndefined();
  });

  test("a flagged target appears in the open queue until resolved", async () => {
    const admin = await registerAndLogin("flag_admin");
    const reporter = await registerAndLogin("flag_reporter");
    const mod = await registerAndLogin("flag_mod");
    await grantModerator(admin.session, mod.user);

    await app.send("/flags/raise", {
      session: reporter.session,
      target: "post1",
      reason: "spam",
    });

    const open = await app.send("/flags/open", { session: mod.session });
    expect(open.targets.map(($: { target: string }) => $.target)).toContain(
      "post1",
    );

    const resolved = await app.send("/flags/resolve", {
      session: mod.session,
      target: "post1",
      outcome: "dismissed",
    });
    expect(resolved.target).toBe("post1");

    const openAfter = await app.send("/flags/open", { session: mod.session });
    expect(
      openAfter.targets.map(($: { target: string }) => $.target),
    ).not.toContain("post1");
  });

  test("a user without the moderate capability cannot resolve flags", async () => {
    await registerAndLogin("flag_r2_admin");
    const reporter = await registerAndLogin("flag_r2");
    await app.send("/flags/raise", {
      session: reporter.session,
      target: "post1",
      reason: "spam",
    });

    const res = await app.send("/flags/resolve", {
      session: reporter.session,
      target: "post1",
      outcome: "dismissed",
    });
    expect(res.error).toBeDefined();
    expect(res.target).toBeUndefined();
  });

  test("resolving requires a valid session", async () => {
    const res = await app.send("/flags/resolve", {
      session: "nope",
      target: "post1",
      outcome: "dismissed",
    });
    expect(res.error).toBeDefined();
  });

  test("the open queue requires a valid session", async () => {
    const res = await app.send("/flags/open", { session: "nope" });
    expect(res.error).toBeDefined();
    expect(res.targets).toBeUndefined();
  });

  test("forTarget returns an empty list for an unflagged target", async () => {
    const res = await app.send("/flags/forTarget", { target: "clean" });
    expect(res.flags).toEqual([]);
  });

  test("multiple reporters accumulate flags on the same target", async () => {
    const a = await registerAndLogin("flag_multi_a");
    const b = await registerAndLogin("flag_multi_b");

    await app.send("/flags/raise", {
      session: a.session,
      target: "post1",
      reason: "spam",
    });
    await app.send("/flags/raise", {
      session: b.session,
      target: "post1",
      reason: "abuse",
    });

    const forTarget = await app.send("/flags/forTarget", { target: "post1" });
    expect(forTarget.flags).toHaveLength(2);
  });
});
