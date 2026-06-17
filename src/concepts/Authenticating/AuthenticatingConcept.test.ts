import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { setupTestDb } from "@utils/testing.ts";
import type { ForumErrorCode } from "../../sdk/error-codes.ts";
import AuthenticatingConcept from "./AuthenticatingConcept.ts";

const mongo = await setupTestDb();
const Authenticating = new AuthenticatingConcept(mongo.db);

afterAll(() => mongo.stop());

beforeEach(async () => {
  await mongo.db.collection("Authenticating.users").deleteMany({});
});

/** Narrow a result union to its success branch, failing the test otherwise. */
function ok<T>(result: T | { error: ForumErrorCode; detail?: string }): T {
  if (result && typeof result === "object" && "error" in result) {
    throw new Error(`Expected success but got error: ${String(result.error)}`);
  }
  return result as T;
}

describe("Authenticating", () => {
  test("principle: register then authenticate recognizes the same user", async () => {
    const { user } = ok(
      await Authenticating.register({ username: "alice", password: "pw" }),
    );
    const auth = ok(
      await Authenticating.authenticate({ username: "alice", password: "pw" }),
    );
    expect(auth.user).toBe(user);
  });

  test("register requires a unique username", async () => {
    ok(await Authenticating.register({ username: "bob", password: "pw" }));
    const dup = await Authenticating.register({
      username: "bob",
      password: "other",
    });
    expect(dup).toHaveProperty("error");
  });

  test("authenticate rejects wrong password and unknown username", async () => {
    ok(await Authenticating.register({ username: "carol", password: "pw" }));
    expect(
      await Authenticating.authenticate({ username: "carol", password: "no" }),
    ).toHaveProperty("error");
    expect(
      await Authenticating.authenticate({ username: "nobody", password: "pw" }),
    ).toHaveProperty("error");
  });

  test("changePassword: old password required, new password takes effect", async () => {
    const { user } = ok(
      await Authenticating.register({ username: "dave", password: "old" }),
    );
    expect(
      await Authenticating.changePassword({
        user,
        oldPassword: "wrong",
        newPassword: "new",
      }),
    ).toHaveProperty("error");
    ok(
      await Authenticating.changePassword({
        user,
        oldPassword: "old",
        newPassword: "new",
      }),
    );
    expect(
      await Authenticating.authenticate({ username: "dave", password: "new" }),
    ).not.toHaveProperty("error");
  });

  test("changeUsername: must be unique, and lookups reflect the change", async () => {
    const { user } = ok(
      await Authenticating.register({ username: "eve", password: "pw" }),
    );
    ok(await Authenticating.register({ username: "taken", password: "pw" }));
    expect(
      await Authenticating.changeUsername({ user, username: "taken" }),
    ).toHaveProperty("error");
    ok(await Authenticating.changeUsername({ user, username: "evelyn" }));
    expect(await Authenticating._getById({ user })).toEqual([
      { username: "evelyn" },
    ]);
  });

  test("unregister removes the user", async () => {
    const { user } = ok(
      await Authenticating.register({ username: "frank", password: "pw" }),
    );
    ok(await Authenticating.unregister({ user }));
    expect(await Authenticating._getById({ user })).toEqual([]);
    expect(await Authenticating.unregister({ user })).toHaveProperty("error");
  });

  test("queries: lookup by username and existence", async () => {
    const { user } = ok(
      await Authenticating.register({ username: "grace", password: "pw" }),
    );
    expect(await Authenticating._getByUsername({ username: "grace" })).toEqual([
      { user },
    ]);
    expect(await Authenticating._getByUsername({ username: "ghost" })).toEqual(
      [],
    );
    expect(
      await Authenticating._existsByUsername({ username: "grace" }),
    ).toEqual([{ exists: true }]);
    expect(
      await Authenticating._existsByUsername({ username: "ghost" }),
    ).toEqual([{ exists: false }]);
  });

  test("_getUserCount returns the number of registered users", async () => {
    expect(await Authenticating._getUserCount()).toEqual([{ count: 0 }]);

    ok(await Authenticating.register({ username: "heidi", password: "pw" }));
    ok(await Authenticating.register({ username: "ivan", password: "pw" }));

    expect(await Authenticating._getUserCount()).toEqual([{ count: 2 }]);
  });
});
