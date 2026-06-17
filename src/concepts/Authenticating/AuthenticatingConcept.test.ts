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
      await Authenticating.register({
        username: "alice",
        password: "pw",
        email: "alice@example.com",
      }),
    );
    const auth = ok(
      await Authenticating.authenticate({ username: "alice", password: "pw" }),
    );
    expect(auth.user).toBe(user);
  });

  test("register requires a unique username", async () => {
    ok(
      await Authenticating.register({
        username: "bob",
        password: "pw",
        email: "bob@example.com",
      }),
    );
    const dup = await Authenticating.register({
      username: "bob",
      password: "other",
      email: "bob2@example.com",
    });
    expect(dup).toHaveProperty("error");
  });

  test("register requires a valid email", async () => {
    const noAt = await Authenticating.register({
      username: "emailtest",
      password: "pw",
      email: "invalid",
    });
    expect(noAt).toHaveProperty("error");
  });

  test("authenticate rejects wrong password and unknown username", async () => {
    ok(
      await Authenticating.register({
        username: "carol",
        password: "pw",
        email: "carol@example.com",
      }),
    );
    expect(
      await Authenticating.authenticate({ username: "carol", password: "no" }),
    ).toHaveProperty("error");
    expect(
      await Authenticating.authenticate({ username: "nobody", password: "pw" }),
    ).toHaveProperty("error");
  });

  test("changePassword: old password required, new password takes effect", async () => {
    const { user } = ok(
      await Authenticating.register({
        username: "dave",
        password: "old",
        email: "dave@example.com",
      }),
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

  test("changeEmail: updates the email field", async () => {
    const { user } = ok(
      await Authenticating.register({
        username: "emailuser",
        password: "pw",
        email: "old@example.com",
      }),
    );
    const row = await Authenticating._getById({ user });
    expect(row[0].email).toBe("old@example.com");

    ok(await Authenticating.changeEmail({ user, email: "new@example.com" }));

    const updated = await Authenticating._getById({ user });
    expect(updated[0].email).toBe("new@example.com");
  });

  test("changeEmail: rejects invalid email", async () => {
    const { user } = ok(
      await Authenticating.register({
        username: "emailbad",
        password: "pw",
        email: "ok@example.com",
      }),
    );
    expect(
      await Authenticating.changeEmail({ user, email: "no-at-sign" }),
    ).toHaveProperty("error");
    expect(
      await Authenticating.changeEmail({ user, email: "" }),
    ).toHaveProperty("error");
  });

  test("changeUsername: must be unique, and lookups reflect the change", async () => {
    const { user } = ok(
      await Authenticating.register({
        username: "eve",
        password: "pw",
        email: "eve@example.com",
      }),
    );
    ok(
      await Authenticating.register({
        username: "taken",
        password: "pw",
        email: "taken@example.com",
      }),
    );
    expect(
      await Authenticating.changeUsername({ user, username: "taken" }),
    ).toHaveProperty("error");
    ok(await Authenticating.changeUsername({ user, username: "evelyn" }));
    expect(await Authenticating._getById({ user })).toEqual([
      { username: "evelyn", email: "eve@example.com" },
    ]);
  });

  test("unregister removes the user", async () => {
    const { user } = ok(
      await Authenticating.register({
        username: "frank",
        password: "pw",
        email: "frank@example.com",
      }),
    );
    ok(await Authenticating.unregister({ user }));
    expect(await Authenticating._getById({ user })).toEqual([]);
    expect(await Authenticating.unregister({ user })).toHaveProperty("error");
  });

  test("queries: lookup by username and existence", async () => {
    const { user } = ok(
      await Authenticating.register({
        username: "grace",
        password: "pw",
        email: "grace@example.com",
      }),
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

    ok(
      await Authenticating.register({
        username: "heidi",
        password: "pw",
        email: "heidi@example.com",
      }),
    );
    ok(
      await Authenticating.register({
        username: "ivan",
        password: "pw",
        email: "ivan@example.com",
      }),
    );

    expect(await Authenticating._getUserCount()).toEqual([{ count: 2 }]);
  });
});
