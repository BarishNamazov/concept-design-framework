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
    email: `${username}@example.com`,
  });
  const { session } = await app.send("/auth/login", {
    username,
    password: "pw",
  });
  return { user, session };
}

describe("revisioning synchronizations", () => {
  test("creating a post records its first revision", async () => {
    const { session } = await registerAndLogin("rev_alice");
    const { post } = await app.send("/threads/create", {
      session,
      content: "first version",
    });

    const list = await app.send("/revisions/list", { item: post });
    expect(list.revisions).toHaveLength(1);
    expect(list.revisions[0].number).toBe(1);
    expect(list.revisions[0].content).toBe("first version");
  });

  test("editing a post appends successive revisions in order", async () => {
    const { session } = await registerAndLogin("rev_bob");
    const { post } = await app.send("/threads/create", {
      session,
      content: "v1",
    });
    await app.send("/posts/edit", { session, post, content: "v2" });
    await app.send("/posts/edit", { session, post, content: "v3" });

    const list = await app.send("/revisions/list", { item: post });
    expect(list.revisions.map(($: { number: number }) => $.number)).toEqual([
      1, 2, 3,
    ]);
    expect(list.revisions.map(($: { content: string }) => $.content)).toEqual([
      "v1",
      "v2",
      "v3",
    ]);
  });

  test("get returns a specific numbered revision", async () => {
    const { session } = await registerAndLogin("rev_carol");
    const { post } = await app.send("/threads/create", {
      session,
      content: "v1",
    });
    await app.send("/posts/edit", { session, post, content: "v2" });

    const res = await app.send("/revisions/get", { item: post, number: 1 });
    expect(res.revision).toHaveLength(1);
    expect(res.revision[0].content).toBe("v1");
  });

  test("get returns an empty result for an unknown revision number", async () => {
    const { session } = await registerAndLogin("rev_dave");
    const { post } = await app.send("/threads/create", {
      session,
      content: "v1",
    });

    const res = await app.send("/revisions/get", { item: post, number: 99 });
    expect(res.revision).toEqual([]);
  });

  test("latest returns the highest-numbered revision", async () => {
    const { session } = await registerAndLogin("rev_erin");
    const { post } = await app.send("/threads/create", {
      session,
      content: "v1",
    });
    await app.send("/posts/edit", { session, post, content: "v2" });
    await app.send("/posts/edit", { session, post, content: "final" });

    const res = await app.send("/revisions/latest", { item: post });
    expect(res.revision).toHaveLength(1);
    expect(res.revision[0].number).toBe(3);
    expect(res.revision[0].content).toBe("final");
  });

  test("an item with no revisions yields empty reads", async () => {
    const list = await app.send("/revisions/list", { item: "ghost" });
    expect(list.revisions).toEqual([]);

    const latest = await app.send("/revisions/latest", { item: "ghost" });
    expect(latest.revision).toEqual([]);
  });
});
