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
        password: "password123",
        email: "alice@example.com",
      }),
    );
    const auth = ok(
      await Authenticating.authenticate({
        username: "alice",
        password: "password123",
      }),
    );
    expect(auth.user).toBe(user);
  });

  test("register requires a unique username", async () => {
    ok(
      await Authenticating.register({
        username: "bob",
        password: "password123",
        email: "bob@example.com",
      }),
    );
    const dup = await Authenticating.register({
      username: "bob",
      password: "otherpassw",
      email: "bob2@example.com",
    });
    expect(dup).toHaveProperty("error");
  });

  test("register requires a valid email", async () => {
    const noAt = await Authenticating.register({
      username: "emailtest",
      password: "password123",
      email: "invalid",
    });
    expect(noAt).toHaveProperty("error");
  });

  test("authenticate rejects wrong password and unknown username", async () => {
    ok(
      await Authenticating.register({
        username: "carol",
        password: "password123",
        email: "carol@example.com",
      }),
    );
    expect(
      await Authenticating.authenticate({
        username: "carol",
        password: "wrongpass1",
      }),
    ).toHaveProperty("error");
    expect(
      await Authenticating.authenticate({
        username: "nobody",
        password: "password123",
      }),
    ).toHaveProperty("error");
  });

  test("changePassword: old password required, new password takes effect", async () => {
    const { user } = ok(
      await Authenticating.register({
        username: "dave",
        password: "oldpasswd",
        email: "dave@example.com",
      }),
    );
    expect(
      await Authenticating.changePassword({
        user,
        oldPassword: "wrongpw123",
        newPassword: "newpasswd",
      }),
    ).toHaveProperty("error");
    ok(
      await Authenticating.changePassword({
        user,
        oldPassword: "oldpasswd",
        newPassword: "newpasswd",
      }),
    );
    expect(
      await Authenticating.authenticate({
        username: "dave",
        password: "newpasswd",
      }),
    ).not.toHaveProperty("error");
  });

  test("changeEmail: updates the email field", async () => {
    const { user } = ok(
      await Authenticating.register({
        username: "emailuser",
        password: "password123",
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
        password: "password123",
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
        password: "password123",
        email: "eve@example.com",
      }),
    );
    ok(
      await Authenticating.register({
        username: "taken",
        password: "password123",
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
        password: "password123",
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
        password: "password123",
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
        password: "password123",
        email: "heidi@example.com",
      }),
    );
    ok(
      await Authenticating.register({
        username: "ivan",
        password: "password123",
        email: "ivan@example.com",
      }),
    );

    expect(await Authenticating._getUserCount()).toEqual([{ count: 2 }]);
  });

  // ── Password validation ──

  test("register rejects password too short (< 8)", async () => {
    const result = await Authenticating.register({
      username: "shortpw",
      password: "short",
      email: "short@example.com",
    });
    expect(result).toHaveProperty("error");
  });

  test("register accepts password at boundary (exactly 8)", async () => {
    const result = await Authenticating.register({
      username: "boundary8",
      password: "12345678",
      email: "boundary@example.com",
    });
    expect(result).not.toHaveProperty("error");
  });

  test("register accepts password at boundary (exactly 128)", async () => {
    const result = await Authenticating.register({
      username: "boundary128",
      password: "x".repeat(128),
      email: "boundary@example.com",
    });
    expect(result).not.toHaveProperty("error");
  });

  test("changePassword rejects new password too short", async () => {
    const { user } = ok(
      await Authenticating.register({
        username: "cpwshort",
        password: "password123",
        email: "cpw@example.com",
      }),
    );
    const result = await Authenticating.changePassword({
      user,
      oldPassword: "password123",
      newPassword: "short",
    });
    expect(result).toHaveProperty("error");
  });

  // ── Username validation ──

  test("register rejects username too short (< 3)", async () => {
    const result = await Authenticating.register({
      username: "ab",
      password: "password123",
      email: "short@example.com",
    });
    expect(result).toHaveProperty("error");
  });

  test("register rejects username too long (> 32)", async () => {
    const result = await Authenticating.register({
      username: "x".repeat(33),
      password: "password123",
      email: "long@example.com",
    });
    expect(result).toHaveProperty("error");
  });

  test("register rejects username starting with number", async () => {
    const result = await Authenticating.register({
      username: "1invalid",
      password: "password123",
      email: "num@example.com",
    });
    expect(result).toHaveProperty("error");
  });

  test("register rejects username starting with underscore", async () => {
    const result = await Authenticating.register({
      username: "_invalid",
      password: "password123",
      email: "under@example.com",
    });
    expect(result).toHaveProperty("error");
  });

  test("register rejects username with spaces", async () => {
    const result = await Authenticating.register({
      username: "bad user",
      password: "password123",
      email: "space@example.com",
    });
    expect(result).toHaveProperty("error");
  });

  test("register rejects username with special chars", async () => {
    const result = await Authenticating.register({
      username: "bad@user!",
      password: "password123",
      email: "spec@example.com",
    });
    expect(result).toHaveProperty("error");
  });
});
