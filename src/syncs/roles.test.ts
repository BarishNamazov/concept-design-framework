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

describe("role synchronizations", () => {
  test("define creates a role and duplicate names error", async () => {
    const alice = await registerAndLogin("role_alice");

    const defined = await app.send("/roles/define", {
      session: alice.session,
      name: "ta",
      capabilities: ["pin", "moderate"],
    });
    expect(defined.role).toBeDefined();

    const dup = await app.send("/roles/define", {
      session: alice.session,
      name: "ta",
      capabilities: ["pin"],
    });
    expect(dup.error).toBeDefined();
    expect(dup.role).toBeUndefined();
  });

  test("can is false for a user without any grant", async () => {
    const res = await app.send("/roles/can", {
      user: "nobody",
      context: "course",
      capability: "pin",
    });
    expect(res.allowed).toBe(false);
  });

  test("grant gives a user a role and its capabilities", async () => {
    const alice = await registerAndLogin("role_grant_alice");
    const bob = await registerAndLogin("role_grant_bob");

    const { role } = await app.send("/roles/define", {
      session: alice.session,
      name: "ta",
      capabilities: ["pin", "moderate"],
    });

    const granted = await app.send("/roles/grant", {
      session: alice.session,
      user: bob.user,
      context: "course",
      role,
    });
    expect(granted.grant).toBeDefined();

    const forUser = await app.send("/roles/forUser", {
      user: bob.user,
      context: "course",
    });
    expect(forUser.roles.map((r: { role: string }) => r.role)).toContain(role);

    const canPin = await app.send("/roles/can", {
      user: bob.user,
      context: "course",
      capability: "pin",
    });
    expect(canPin.allowed).toBe(true);

    const canDelete = await app.send("/roles/can", {
      user: bob.user,
      context: "course",
      capability: "delete",
    });
    expect(canDelete.allowed).toBe(false);
  });

  test("revoke removes the role and its capabilities", async () => {
    const alice = await registerAndLogin("role_revoke_alice");
    const bob = await registerAndLogin("role_revoke_bob");

    const { role } = await app.send("/roles/define", {
      session: alice.session,
      name: "ta",
      capabilities: ["pin", "moderate"],
    });

    const granted = await app.send("/roles/grant", {
      session: alice.session,
      user: bob.user,
      context: "course",
      role,
    });

    const revoked = await app.send("/roles/revoke", {
      session: alice.session,
      user: bob.user,
      context: "course",
      role,
    });
    expect(revoked.grant).toBe(granted.grant);

    const canPin = await app.send("/roles/can", {
      user: bob.user,
      context: "course",
      capability: "pin",
    });
    expect(canPin.allowed).toBe(false);
  });

  test("granting a non-existent role errors", async () => {
    const alice = await registerAndLogin("role_badgrant_alice");
    const bob = await registerAndLogin("role_badgrant_bob");

    const res = await app.send("/roles/grant", {
      session: alice.session,
      user: bob.user,
      context: "course",
      role: "does-not-exist",
    });
    expect(res.error).toBeDefined();
    expect(res.grant).toBeUndefined();
  });

  test("define with invalid session errors", async () => {
    const res = await app.send("/roles/define", {
      session: "nope",
      name: "ta",
      capabilities: ["pin"],
    });
    expect(res.error).toBe("Invalid or expired session.");
  });

  test("grant with invalid session errors", async () => {
    const res = await app.send("/roles/grant", {
      session: "nope",
      user: "u1",
      context: "course",
      role: "r1",
    });
    expect(res.error).toBe("Invalid or expired session.");
  });

  test("revoke with invalid session errors", async () => {
    const res = await app.send("/roles/revoke", {
      session: "nope",
      user: "u1",
      context: "course",
      role: "r1",
    });
    expect(res.error).toBe("Invalid or expired session.");
  });
});
