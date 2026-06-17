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

async function signUp(username: string, displayName = username) {
  await app.send("/auth/register", {
    username,
    password: "pw",
    displayName,
    email: `${username}@example.com`,
  });
  const { session } = await app.send("/auth/login", {
    username,
    password: "pw",
  });
  return session;
}

describe("profile endpoints", () => {
  test("setDisplayName returns error when profile does not exist", async () => {
    const session = await signUp("alice");

    await app.concepts.Profiling.deleteProfile({
      user: (await app.send("/auth/me", { session })).user,
    });

    const result = await app.send("/profiles/setDisplayName", {
      session,
      displayName: "NewName",
    });
    expect(result.error).toBeDefined();
  });

  test("setBio returns error when profile does not exist", async () => {
    const session = await signUp("alice");

    await app.concepts.Profiling.deleteProfile({
      user: (await app.send("/auth/me", { session })).user,
    });

    const result = await app.send("/profiles/setBio", {
      session,
      bio: "New bio",
    });
    expect(result.error).toBeDefined();
  });

  test("setAvatar returns error when profile does not exist", async () => {
    const session = await signUp("alice");

    await app.concepts.Profiling.deleteProfile({
      user: (await app.send("/auth/me", { session })).user,
    });

    const result = await app.send("/profiles/setAvatar", {
      session,
      avatar: "https://example.com/avatar.png",
    });
    expect(result.error).toBeDefined();
  });
});
