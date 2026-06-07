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

describe("auth synchronizations", () => {
  test("register creates a user and a profile", async () => {
    const res = await app.send("/auth/register", {
      username: "alice",
      password: "pw",
      displayName: "Alice",
    });
    expect(res.user).toBeDefined();

    const me = await app.send("/auth/login", {
      username: "alice",
      password: "pw",
    });
    expect(me.session).toBeDefined();
    expect(me.user).toBe(res.user);

    const profile = await app.send("/auth/me", { session: me.session });
    expect(profile.username).toBe("alice");
    expect(profile.profile.displayName).toBe("Alice");
  });

  test("duplicate registration returns an error", async () => {
    await app.send("/auth/register", {
      username: "bob",
      password: "pw",
      displayName: "Bob",
    });
    const dup = await app.send("/auth/register", {
      username: "bob",
      password: "pw2",
      displayName: "Bobby",
    });
    expect(dup.error).toBeDefined();
    expect(dup.user).toBeUndefined();
  });

  test("login with wrong password returns an error", async () => {
    await app.send("/auth/register", {
      username: "carol",
      password: "pw",
      displayName: "Carol",
    });
    const bad = await app.send("/auth/login", {
      username: "carol",
      password: "nope",
    });
    expect(bad.error).toBeDefined();
    expect(bad.session).toBeUndefined();
  });

  test("logout ends the session; me then reports invalid session", async () => {
    await app.send("/auth/register", {
      username: "dave",
      password: "pw",
      displayName: "Dave",
    });
    const { session } = await app.send("/auth/login", {
      username: "dave",
      password: "pw",
    });
    const out = await app.send("/auth/logout", { session });
    expect(out.ok).toBe(true);

    const me = await app.send("/auth/me", { session });
    expect(me.error).toBeDefined();
  });

  test("me with an unknown session returns an error", async () => {
    const me = await app.send("/auth/me", { session: "does-not-exist" });
    expect(me.error).toBeDefined();
  });

  test("changePassword updates the credential and old password stops working", async () => {
    const reg = await app.send("/auth/register", {
      username: "pwd_alice",
      password: "old",
      displayName: "Alice",
    });
    const { session } = await app.send("/auth/login", {
      username: "pwd_alice",
      password: "old",
    });

    const res = await app.send("/auth/changePassword", {
      session,
      oldPassword: "old",
      newPassword: "new",
    });
    expect(res.user).toBe(reg.user);

    const withNew = await app.send("/auth/login", {
      username: "pwd_alice",
      password: "new",
    });
    expect(withNew.session).toBeDefined();
    const withOld = await app.send("/auth/login", {
      username: "pwd_alice",
      password: "old",
    });
    expect(withOld.error).toBeDefined();
    expect(withOld.session).toBeUndefined();
  });

  test("changePassword with the wrong old password errors and keeps the credential", async () => {
    await app.send("/auth/register", {
      username: "pwd_bob",
      password: "secret",
      displayName: "Bob",
    });
    const { session } = await app.send("/auth/login", {
      username: "pwd_bob",
      password: "secret",
    });

    const res = await app.send("/auth/changePassword", {
      session,
      oldPassword: "wrong",
      newPassword: "new",
    });
    expect(res.error).toBeDefined();
    expect(res.user).toBeUndefined();

    const stillWorks = await app.send("/auth/login", {
      username: "pwd_bob",
      password: "secret",
    });
    expect(stillWorks.session).toBeDefined();
  });

  test("changePassword with an invalid session errors", async () => {
    const res = await app.send("/auth/changePassword", {
      session: "nope",
      oldPassword: "old",
      newPassword: "new",
    });
    expect(res.error).toBe("Invalid or expired session.");
    expect(res.user).toBeUndefined();
  });
});

describe("profile synchronizations", () => {
  test("get returns the profile created at registration", async () => {
    const { user } = await registerAndLogin("p_alice", "Alice");
    const res = await app.send("/profiles/get", { user });
    expect(res.profile.displayName).toBe("Alice");
    expect(res.profile.bio).toBe("");
    expect(res.profile.avatar).toBe("");
  });

  test("setDisplayName, setBio, setAvatar update the profile", async () => {
    const { user, session } = await registerAndLogin("p_bob", "Bob");

    const dn = await app.send("/profiles/setDisplayName", {
      session,
      displayName: "Bobby",
    });
    expect(dn.user).toBe(user);

    const bio = await app.send("/profiles/setBio", {
      session,
      bio: "hi there",
    });
    expect(bio.user).toBe(user);

    const av = await app.send("/profiles/setAvatar", {
      session,
      avatar: "http://img",
    });
    expect(av.user).toBe(user);

    const res = await app.send("/profiles/get", { user });
    expect(res.profile.displayName).toBe("Bobby");
    expect(res.profile.bio).toBe("hi there");
    expect(res.profile.avatar).toBe("http://img");
  });

  test("setDisplayName with invalid session errors", async () => {
    const res = await app.send("/profiles/setDisplayName", {
      session: "nope",
      displayName: "X",
    });
    expect(res.error).toBeDefined();
    expect(res.user).toBeUndefined();
  });
});
