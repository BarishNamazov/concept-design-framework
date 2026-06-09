import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { setupApp, type TestApp } from "@utils/app_testing.ts";
import type { ID } from "@utils/types.ts";

let app: TestApp;

beforeEach(async () => {
  if (!app) app = await setupApp();
  await app.reset();
});

afterAll(async () => {
  await app?.stop();
});

async function signUp(username: string, displayName = username) {
  await app.send("/auth/register", { username, password: "pw", displayName });
  const { session } = await app.send("/auth/login", {
    username,
    password: "pw",
  });
  return session;
}

describe("thread error handlers", () => {
  test("Conversing.start errors on already-placed item", async () => {
    const session = await signUp("alice");
    const { user } = await app.send("/auth/me", { session });

    // Manually create a post and place it in a conversation.
    const { post } = await app.concepts.Posting.create({
      author: user,
      content: "test",
    });
    const first = await app.concepts.Conversing.start({ item: post });
    expect("conversation" in first).toBe(true);

    // Starting again with the same item returns an error.
    const second = await app.concepts.Conversing.start({ item: post });
    expect("error" in second).toBe(true);
  });

  test("Conversing.reply errors on missing parent node", async () => {
    const session = await signUp("alice");
    const { user } = await app.send("/auth/me", { session });

    const { post } = await app.concepts.Posting.create({
      author: user,
      content: "test",
    });
    const result = await app.concepts.Conversing.reply({
      item: post,
      parent: "nonexistent-node" as ID,
    });
    expect("error" in result).toBe(true);
  });

  test("thread create and reply work end-to-end with error handlers present", async () => {
    const alice = await signUp("alice");
    const bob = await signUp("bob");

    const thread = await app.send("/threads/create", {
      session: alice,
      content: "Hello forum",
    });
    expect(thread.post).toBeDefined();
    expect(thread.conversation).toBeDefined();
    expect(thread.node).toBeDefined();

    const reply = await app.send("/threads/reply", {
      session: bob,
      parent: thread.node,
      content: "Hi alice!",
    });
    expect(reply.post).toBeDefined();
    expect(reply.node).toBeDefined();
  });
});
