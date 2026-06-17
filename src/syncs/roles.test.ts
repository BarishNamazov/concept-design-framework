import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { setupApp, type TestApp } from "@utils/app_testing.ts";
import { ForumErrorCode } from "../sdk/error-codes.ts";

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
    password: "password123",
    displayName,
    email: `${username}@example.com`,
  });
  const { session } = await app.send("/auth/login", {
    username,
    password: "password123",
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
    expect(res.error).toBe(ForumErrorCode.INVALID_SESSION);
  });

  test("grant with invalid session errors", async () => {
    const res = await app.send("/roles/grant", {
      session: "nope",
      user: "u1",
      context: "course",
      role: "r1",
    });
    expect(res.error).toBe(ForumErrorCode.INVALID_SESSION);
  });

  test("revoke with invalid session errors", async () => {
    const res = await app.send("/roles/revoke", {
      session: "nope",
      user: "u1",
      context: "course",
      role: "r1",
    });
    expect(res.error).toBe(ForumErrorCode.INVALID_SESSION);
  });
});

/**
 * Establish the very first forum administrator. The role gate stays open until
 * someone holds the `"administer"` capability in the `"forum"` context, so the
 * first operator can grant the role to themselves; afterwards the forum is
 * "claimed" and enforcement applies.
 */
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

describe("role administration authorization", () => {
  test("the first registered account automatically receives administrator powers", async () => {
    const first = await app.send("/auth/register", {
      username: "role_auto_admin",
      password: "password123",
      displayName: "role_auto_admin",
      email: "role_auto_admin@example.com",
    });

    for (const capability of ["administer", "moderate", "pin"]) {
      const can = await app.send("/roles/can", {
        user: first.user,
        context: "forum",
        capability,
      });
      expect(can.allowed).toBe(true);
    }

    const second = await app.send("/auth/register", {
      username: "role_auto_member",
      password: "password123",
      displayName: "role_auto_member",
      email: "role_auto_member@example.com",
    });
    const canAdmin = await app.send("/roles/can", {
      user: second.user,
      context: "forum",
      capability: "administer",
    });
    expect(canAdmin.allowed).toBe(false);
  });

  test("logging in an existing sole account backfills administrator powers", async () => {
    const created = await app.concepts.Authenticating.register({
      username: "role_legacy_admin",
      password: "password123",
      email: "role_legacy_admin@example.com",
    });
    if ("error" in created) throw new Error(created.error);

    const before = await app.send("/roles/can", {
      user: created.user,
      context: "forum",
      capability: "administer",
    });
    expect(before.allowed).toBe(false);

    const login = await app.send("/auth/login", {
      username: "role_legacy_admin",
      password: "password123",
    });
    expect(login.session).toBeDefined();

    const after = await app.send("/roles/can", {
      user: created.user,
      context: "forum",
      capability: "administer",
    });
    expect(after.allowed).toBe(true);
  });

  test("the first operator can bootstrap themselves as administrator", async () => {
    const admin = await establishAdmin("role_boot_admin");

    const can = await app.send("/roles/can", {
      user: admin.user,
      context: "forum",
      capability: "administer",
    });
    expect(can.allowed).toBe(true);
  });

  test("once an administrator exists, a non-admin cannot grant roles", async () => {
    await establishAdmin("role_esc_admin");
    const attacker = await registerAndLogin("role_esc_attacker");

    // The attacker defines a powerful role and tries to grant it to themselves.
    const defined = await app.send("/roles/define", {
      session: attacker.session,
      name: "superuser",
      capabilities: ["administer", "moderate"],
    });
    expect(defined.error).toBe(ForumErrorCode.FORBIDDEN);
    expect(defined.role).toBeUndefined();

    const granted = await app.send("/roles/grant", {
      session: attacker.session,
      user: attacker.user,
      context: "forum",
      role: "administrator",
    });
    expect(granted.error).toBe(ForumErrorCode.FORBIDDEN);
    expect(granted.grant).toBeUndefined();

    // The escalation did not take effect.
    const can = await app.send("/roles/can", {
      user: attacker.user,
      context: "forum",
      capability: "administer",
    });
    expect(can.allowed).toBe(false);
  });

  test("an administrator can grant and revoke roles after the forum is claimed", async () => {
    const admin = await establishAdmin("role_admin_ok");
    const member = await registerAndLogin("role_admin_member");

    const { role } = await app.send("/roles/define", {
      session: admin.session,
      name: "ta",
      capabilities: ["pin"],
    });
    expect(role).toBeDefined();

    const granted = await app.send("/roles/grant", {
      session: admin.session,
      user: member.user,
      context: "course",
      role,
    });
    expect(granted.grant).toBeDefined();

    const revoked = await app.send("/roles/revoke", {
      session: admin.session,
      user: member.user,
      context: "course",
      role,
    });
    expect(revoked.grant).toBe(granted.grant);
  });

  test("a non-admin cannot revoke an administrator's grant", async () => {
    const admin = await establishAdmin("role_revoke_admin");
    const attacker = await registerAndLogin("role_revoke_attacker");

    const res = await app.send("/roles/revoke", {
      session: attacker.session,
      user: admin.user,
      context: "forum",
      role: "administrator",
    });
    expect(res.error).toBe(ForumErrorCode.FORBIDDEN);

    // The administrator's own grant survived the attempt.
    const can = await app.send("/roles/can", {
      user: admin.user,
      context: "forum",
      capability: "administer",
    });
    expect(can.allowed).toBe(true);
  });
});
