import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { setupTestDb } from "@utils/testing.ts";
import type { ID } from "@utils/types.ts";
import type { ForumErrorCode } from "../../sdk/error-codes.ts";
import RolingConcept from "./RolingConcept.ts";

const mongo = await setupTestDb();
const Roling = new RolingConcept(mongo.db);

afterAll(() => mongo.stop());

beforeEach(async () => {
  await mongo.db.collection("Roling.roles").deleteMany({});
  await mongo.db.collection("Roling.grants").deleteMany({});
});

/** Narrow a result union to its success branch, failing the test otherwise. */
function ok<T>(result: T | { error: ForumErrorCode; detail?: string }): T {
  if (result && typeof result === "object" && "error" in result) {
    throw new Error(`Expected success but got error: ${result.error}`);
  }
  return result as T;
}

const user = (s: string) => s as ID;
const context = (s: string) => s as ID;

describe("Roling", () => {
  test("principle: a granted role permits capabilities until revoked", async () => {
    const u = user("alice");
    const c = context("repo1");
    const { role } = ok(
      await Roling.defineRole({ name: "editor", capabilities: ["write"] }),
    );
    // before any grant, the capability is refused
    expect(
      await Roling._hasCapability({ user: u, context: c, capability: "write" }),
    ).toEqual([{ allowed: false }]);
    // granting the role permits the gated operation
    ok(await Roling.grant({ user: u, context: c, role }));
    expect(
      await Roling._hasCapability({ user: u, context: c, capability: "write" }),
    ).toEqual([{ allowed: true }]);
    // revoking the role refuses it again
    ok(await Roling.revoke({ user: u, context: c, role }));
    expect(
      await Roling._hasCapability({ user: u, context: c, capability: "write" }),
    ).toEqual([{ allowed: false }]);
  });

  test("defineRole requires a unique name", async () => {
    const { role } = ok(
      await Roling.defineRole({ name: "admin", capabilities: ["delete"] }),
    );
    expect(role).toBeString();
    expect(
      await Roling.defineRole({ name: "admin", capabilities: ["read"] }),
    ).toHaveProperty("error");
  });

  test("grant requires an existing role and rejects duplicates", async () => {
    const u = user("bob");
    const c = context("repo2");
    // granting a role that does not exist fails
    expect(
      await Roling.grant({ user: u, context: c, role: user("ghost") }),
    ).toHaveProperty("error");
    const { role } = ok(
      await Roling.defineRole({ name: "viewer", capabilities: ["read"] }),
    );
    const { grant } = ok(await Roling.grant({ user: u, context: c, role }));
    expect(grant).toBeString();
    // granting the same (user, context, role) again fails
    expect(await Roling.grant({ user: u, context: c, role })).toHaveProperty(
      "error",
    );
  });

  test("revoke requires an existing grant and returns the removed id", async () => {
    const u = user("carol");
    const c = context("repo3");
    const { role } = ok(
      await Roling.defineRole({ name: "mod", capabilities: ["ban"] }),
    );
    expect(await Roling.revoke({ user: u, context: c, role })).toHaveProperty(
      "error",
    );
    const { grant } = ok(await Roling.grant({ user: u, context: c, role }));
    const removed = ok(await Roling.revoke({ user: u, context: c, role }));
    expect(removed.grant).toBe(grant);
    // revoking again fails since the grant is gone
    expect(await Roling.revoke({ user: u, context: c, role })).toHaveProperty(
      "error",
    );
  });

  test("_hasCapability is scoped to the context and is satisfied by any role", async () => {
    const u = user("dave");
    const c1 = context("repo4");
    const c2 = context("repo5");
    const writer = ok(
      await Roling.defineRole({ name: "writer", capabilities: ["write"] }),
    );
    const reader = ok(
      await Roling.defineRole({ name: "reader", capabilities: ["read"] }),
    );
    ok(await Roling.grant({ user: u, context: c1, role: writer.role }));
    ok(await Roling.grant({ user: u, context: c1, role: reader.role }));
    // a capability from any granted role is allowed
    expect(
      await Roling._hasCapability({
        user: u,
        context: c1,
        capability: "write",
      }),
    ).toEqual([{ allowed: true }]);
    expect(
      await Roling._hasCapability({ user: u, context: c1, capability: "read" }),
    ).toEqual([{ allowed: true }]);
    // an ungranted capability is refused
    expect(
      await Roling._hasCapability({
        user: u,
        context: c1,
        capability: "admin",
      }),
    ).toEqual([{ allowed: false }]);
    // grants do not leak across contexts
    expect(
      await Roling._hasCapability({
        user: u,
        context: c2,
        capability: "write",
      }),
    ).toEqual([{ allowed: false }]);
  });

  test("_getRoles returns every role granted to a user in a context", async () => {
    const u = user("erin");
    const c = context("repo6");
    const a = ok(
      await Roling.defineRole({ name: "alpha", capabilities: ["a"] }),
    );
    const b = ok(
      await Roling.defineRole({ name: "beta", capabilities: ["b"] }),
    );
    ok(await Roling.grant({ user: u, context: c, role: a.role }));
    ok(await Roling.grant({ user: u, context: c, role: b.role }));
    const roles = await Roling._getRoles({ user: u, context: c });
    expect(roles).toHaveLength(2);
    expect(roles).toContainEqual({ role: a.role });
    expect(roles).toContainEqual({ role: b.role });
    expect(
      await Roling._getRoles({ user: u, context: context("other") }),
    ).toEqual([]);
  });

  test("_getUsersWithRole returns every user holding a role in a context", async () => {
    const c = context("repo7");
    const { role } = ok(
      await Roling.defineRole({ name: "member", capabilities: ["post"] }),
    );
    ok(await Roling.grant({ user: user("u1"), context: c, role }));
    ok(await Roling.grant({ user: user("u2"), context: c, role }));
    ok(
      await Roling.grant({
        user: user("u3"),
        context: context("elsewhere"),
        role,
      }),
    );
    const users = await Roling._getUsersWithRole({ context: c, role });
    expect(users).toHaveLength(2);
    expect(users).toContainEqual({ user: user("u1") });
    expect(users).toContainEqual({ user: user("u2") });
  });

  test("_hasCapabilityHolder reports whether a context has a capability holder", async () => {
    const c = context("forum");
    const { role: adminRole } = ok(
      await Roling.defineRole({
        name: "administrator",
        capabilities: ["administer", "moderate"],
      }),
    );
    // The capability exists on a role, but nobody has been granted it yet.
    expect(
      await Roling._hasCapabilityHolder({
        context: c,
        capability: "administer",
      }),
    ).toEqual([{ present: false }]);

    ok(await Roling.grant({ user: user("root"), context: c, role: adminRole }));
    // Now a holder exists in this context...
    expect(
      await Roling._hasCapabilityHolder({
        context: c,
        capability: "administer",
      }),
    ).toEqual([{ present: true }]);
    // ...but not in an unrelated context, and not for a capability no role lists.
    expect(
      await Roling._hasCapabilityHolder({
        context: context("other"),
        capability: "administer",
      }),
    ).toEqual([{ present: false }]);
    expect(
      await Roling._hasCapabilityHolder({ context: c, capability: "fly" }),
    ).toEqual([{ present: false }]);
  });

  test("_getRoleByName and _getCapabilities", async () => {
    const { role } = ok(
      await Roling.defineRole({
        name: "owner",
        capabilities: ["read", "write"],
      }),
    );
    expect(await Roling._getRoleByName({ name: "owner" })).toEqual([{ role }]);
    expect(await Roling._getRoleByName({ name: "missing" })).toEqual([]);
    const caps = await Roling._getCapabilities({ role });
    expect(caps).toHaveLength(2);
    expect(caps).toContainEqual({ capability: "read" });
    expect(caps).toContainEqual({ capability: "write" });
    expect(await Roling._getCapabilities({ role: user("ghost") })).toEqual([]);
  });

  test("namespaces isolate duplicate concept instances", async () => {
    const Org = new RolingConcept(mongo.db, "Org");
    const Team = new RolingConcept(mongo.db, "Team");

    const orgRole = ok(
      await Org.defineRole({ name: "shared", capabilities: ["x"] }),
    );
    const teamRole = ok(
      await Team.defineRole({ name: "shared", capabilities: ["y"] }),
    );

    expect(orgRole.role).not.toBe(teamRole.role);
    expect(await Org._getRoleByName({ name: "shared" })).toEqual([
      { role: orgRole.role },
    ]);
    expect(await Team._getRoleByName({ name: "shared" })).toEqual([
      { role: teamRole.role },
    ]);
    expect(await Roling._getRoleByName({ name: "shared" })).toEqual([]);
  });
});
