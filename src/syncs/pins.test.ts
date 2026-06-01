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
    password: "pw",
    displayName: username,
  });
  const { session } = await app.send("/auth/login", {
    username,
    password: "pw",
  });
  return { user, session };
}

/**
 * Grant `user` the `"pin"` capability inside `scope` using an administrator
 * session.
 */
async function grantPin(
  adminSession: string,
  user: string,
  scope: string,
): Promise<void> {
  await app.send("/roles/define", {
    session: adminSession,
    name: "pinner",
    capabilities: ["pin"],
  });
  await app.send("/roles/grant", {
    session: adminSession,
    user,
    context: scope,
    role: "pinner",
  });
}

describe("pinning synchronizations", () => {
  test("the first registered administrator can pin in any scope", async () => {
    const { session } = await registerAndLogin("pin_admin");

    const res = await app.send("/pins/pin", {
      session,
      item: "post1",
      scope: "scopeA",
      priority: 5,
    });
    expect(res.pin).toBeDefined();
    expect(res.error).toBeUndefined();
  });

  test("a user with the pin capability can pin within a scope", async () => {
    const admin = await registerAndLogin("pin_staff_admin");
    const staff = await registerAndLogin("pin_staff");
    await grantPin(admin.session, staff.user, "scopeA");

    const res = await app.send("/pins/pin", {
      session: staff.session,
      item: "post1",
      scope: "scopeA",
      priority: 5,
    });
    expect(res.pin).toBeDefined();
    expect(res.error).toBeUndefined();

    const isPinned = await app.send("/pins/isPinned", {
      item: "post1",
      scope: "scopeA",
    });
    expect(isPinned.pinned).toBe(true);

    const forScope = await app.send("/pins/forScope", { scope: "scopeA" });
    expect(forScope.pinned.map(($: { item: string }) => $.item)).toContain(
      "post1",
    );
  });

  test("a user without the pin capability is forbidden", async () => {
    await registerAndLogin("pin_student_admin");
    const { session } = await registerAndLogin("pin_student");

    const res = await app.send("/pins/pin", {
      session,
      item: "post1",
      scope: "scopeA",
      priority: 1,
    });
    expect(res.error).toBeDefined();
    expect(res.pin).toBeUndefined();

    const isPinned = await app.send("/pins/isPinned", {
      item: "post1",
      scope: "scopeA",
    });
    expect(isPinned.pinned).toBe(false);
  });

  test("the pin capability is scoped: it does not leak to other scopes", async () => {
    const admin = await registerAndLogin("pin_scoped_admin");
    const staff = await registerAndLogin("pin_scoped");
    await grantPin(admin.session, staff.user, "scopeA");

    const ok = await app.send("/pins/pin", {
      session: staff.session,
      item: "post1",
      scope: "scopeA",
      priority: 1,
    });
    expect(ok.pin).toBeDefined();

    const forbidden = await app.send("/pins/pin", {
      session: staff.session,
      item: "post1",
      scope: "scopeB",
      priority: 1,
    });
    expect(forbidden.error).toBeDefined();
    expect(forbidden.pin).toBeUndefined();
  });

  test("setPriority reorders pins by descending priority", async () => {
    const admin = await registerAndLogin("pin_order_admin");
    const staff = await registerAndLogin("pin_order");
    await grantPin(admin.session, staff.user, "scopeA");

    await app.send("/pins/pin", {
      session: staff.session,
      item: "low",
      scope: "scopeA",
      priority: 1,
    });
    await app.send("/pins/pin", {
      session: staff.session,
      item: "high",
      scope: "scopeA",
      priority: 2,
    });

    const before = await app.send("/pins/forScope", { scope: "scopeA" });
    expect(before.pinned.map(($: { item: string }) => $.item)).toEqual([
      "high",
      "low",
    ]);

    const res = await app.send("/pins/setPriority", {
      session: staff.session,
      item: "low",
      scope: "scopeA",
      priority: 10,
    });
    expect(res.pin).toBeDefined();

    const after = await app.send("/pins/forScope", { scope: "scopeA" });
    expect(after.pinned.map(($: { item: string }) => $.item)).toEqual([
      "low",
      "high",
    ]);
  });

  test("unpin removes a pin and requires the capability", async () => {
    const admin = await registerAndLogin("pin_unpin_admin");
    const staff = await registerAndLogin("pin_unpin");
    await grantPin(admin.session, staff.user, "scopeA");
    await app.send("/pins/pin", {
      session: staff.session,
      item: "post1",
      scope: "scopeA",
      priority: 1,
    });

    const other = await registerAndLogin("pin_unpin_other");
    const forbidden = await app.send("/pins/unpin", {
      session: other.session,
      item: "post1",
      scope: "scopeA",
    });
    expect(forbidden.error).toBeDefined();

    const res = await app.send("/pins/unpin", {
      session: staff.session,
      item: "post1",
      scope: "scopeA",
    });
    expect(res.pin).toBeDefined();

    const isPinned = await app.send("/pins/isPinned", {
      item: "post1",
      scope: "scopeA",
    });
    expect(isPinned.pinned).toBe(false);
  });

  test("an invalid session cannot pin", async () => {
    const res = await app.send("/pins/pin", {
      session: "nope",
      item: "post1",
      scope: "scopeA",
      priority: 1,
    });
    expect(res.error).toBeDefined();
    expect(res.pin).toBeUndefined();
  });

  test("forScope returns an empty list for an unknown scope", async () => {
    const res = await app.send("/pins/forScope", { scope: "empty" });
    expect(res.pinned).toEqual([]);
  });
});
