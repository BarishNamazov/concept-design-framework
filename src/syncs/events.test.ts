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

/** Registers a user and returns a live session token. */
async function signUp(
  username: string,
  displayName = username,
): Promise<string> {
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

/** Returns the kinds of every notification in a user's inbox. */
async function inboxKinds(session: string): Promise<string[]> {
  const res = await app.send("/notifications/list", { session });
  return (res.notifications as { kind: string }[]).map((n) => n.kind);
}

describe("cross-concept event synchronizations", () => {
  test("a reply notifies the parent post's author", async () => {
    const alice = await signUp("alice");
    const bob = await signUp("bob");

    const thread = await app.send("/threads/create", {
      session: alice,
      content: "Welcome to the course forum.",
    });
    await app.send("/threads/reply", {
      session: bob,
      parent: thread.node,
      content: "Thanks, excited to be here!",
    });

    expect(await inboxKinds(alice)).toContain("reply");
    // Bob replied to his own action, so he should not be notified of it.
    expect(await inboxKinds(bob)).not.toContain("reply");
  });

  test("a reply notifies every thread subscriber", async () => {
    const alice = await signUp("alice");
    const bob = await signUp("bob");
    const carol = await signUp("carol");

    const thread = await app.send("/threads/create", {
      session: alice,
      content: "Subscribe to follow along.",
    });
    await app.send("/subscriptions/subscribe", {
      session: carol,
      target: thread.conversation,
    });

    await app.send("/threads/reply", {
      session: bob,
      parent: thread.node,
      content: "A new reply for watchers.",
    });

    expect(await inboxKinds(carol)).toContain("followed_reply");
  });

  test("a subscribed parent author only gets one notification on reply", async () => {
    const alice = await signUp("alice");
    const bob = await signUp("bob");

    const thread = await app.send("/threads/create", {
      session: alice,
      content: "Thread by alice.",
    });
    await app.send("/subscriptions/subscribe", {
      session: alice,
      target: thread.conversation,
    });

    await app.send("/threads/reply", {
      session: bob,
      parent: thread.node,
      content: "Bob replies.",
    });

    const kinds = await inboxKinds(alice);
    expect(kinds.filter((k) => k === "reply")).toHaveLength(1);
  });

  test("an @mention notifies the mentioned user", async () => {
    const alice = await signUp("alice");
    const bob = await signUp("bob");

    await app.send("/threads/create", {
      session: alice,
      content: "Hey @bob can you help with question 3?",
    });

    const kinds = await inboxKinds(bob);
    expect(kinds).toContain("mention");
  });

  test("a reply with an @mention creates exactly one mention notification", async () => {
    const alice = await signUp("alice");
    const bob = await signUp("bob");

    const thread = await app.send("/threads/create", {
      session: alice,
      content: "Asking for help.",
    });
    await app.send("/threads/reply", {
      session: alice,
      parent: thread.node,
      content: "Hey @bob can you help?",
    });

    const kinds = (await inboxKinds(bob)).filter((k) => k === "mention");
    expect(kinds).toHaveLength(1);
  });

  test("a reply that @mentions the parent author does not give redundant mention", async () => {
    const alice = await signUp("alice");
    const bob = await signUp("bob");

    const thread = await app.send("/threads/create", {
      session: alice,
      content: "The question.",
    });
    await app.send("/threads/reply", {
      session: bob,
      parent: thread.node,
      content: "Hey @alice, great question!",
    });

    const kinds = await inboxKinds(alice);
    // Should get a "reply" notification but NOT a redundant "mention"
    expect(kinds).toContain("reply");
    expect(kinds).not.toContain("mention");
  });

  test("mentioning yourself does not create a notification", async () => {
    const alice = await signUp("alice");

    await app.send("/threads/create", {
      session: alice,
      content: "Note to self @alice remember office hours.",
    });

    expect(await inboxKinds(alice)).not.toContain("mention");
  });

  test("accepting an answer notifies the answer's author", async () => {
    const alice = await signUp("alice");
    const bob = await signUp("bob");

    const thread = await app.send("/threads/create", {
      session: alice,
      content: "How do I prove this lemma?",
    });
    const answer = await app.send("/threads/reply", {
      session: bob,
      parent: thread.node,
      content: "Use induction on n.",
    });

    const accepted = await app.send("/resolutions/accept", {
      session: alice,
      question: thread.post,
      answer: answer.post,
    });
    expect(accepted.resolution).toBe(thread.post);

    expect(await inboxKinds(bob)).toContain("accepted");
  });

  test("creating and editing a post records its revision history", async () => {
    const alice = await signUp("alice");

    const thread = await app.send("/threads/create", {
      session: alice,
      content: "First version.",
    });

    let history = await app.send("/revisions/list", { item: thread.post });
    expect(history.revisions).toHaveLength(1);
    expect(history.revisions[0].number).toBe(1);
    expect(history.revisions[0].content).toBe("First version.");

    await app.send("/posts/edit", {
      session: alice,
      post: thread.post,
      content: "Second version.",
    });

    history = await app.send("/revisions/list", { item: thread.post });
    expect(history.revisions).toHaveLength(2);
    expect(history.revisions.map((r: { number: number }) => r.number)).toEqual([
      1, 2,
    ]);

    const latest = await app.send("/revisions/latest", { item: thread.post });
    expect(latest.revision).toHaveLength(1);
    expect(latest.revision[0].content).toBe("Second version.");
  });

  test("purging a trashed post deletes it and clears its traces", async () => {
    const alice = await signUp("alice");

    const thread = await app.send("/threads/create", {
      session: alice,
      content: "Doomed post.",
    });
    await app.send("/reactions/add", {
      session: alice,
      target: thread.post,
      kind: "like",
    });

    await app.send("/trash/trash", { session: alice, item: thread.post });
    const purged = await app.send("/trash/purge", {
      session: alice,
      item: thread.post,
    });
    expect(purged.item).toBe(thread.post);

    const fetched = await app.send("/posts/get", { post: thread.post });
    expect(fetched.error).toBeDefined();

    const reactions = await app.send("/reactions/forTarget", {
      target: thread.post,
    });
    expect(reactions.reactions).toHaveLength(0);
  });

  test("replies are blocked while a thread is locked", async () => {
    const alice = await signUp("alice");
    const bob = await signUp("bob");

    const thread = await app.send("/threads/create", {
      session: alice,
      content: "This will be locked.",
    });

    await app.send("/locks/lock", {
      session: alice,
      target: thread.conversation,
    });

    const blocked = await app.send("/threads/reply", {
      session: bob,
      parent: thread.node,
      content: "Can I still reply?",
    });
    expect(blocked.error).toBeDefined();
    expect(blocked.post).toBeUndefined();

    await app.send("/locks/unlock", {
      session: alice,
      target: thread.conversation,
    });

    const allowed = await app.send("/threads/reply", {
      session: bob,
      parent: thread.node,
      content: "Now it works.",
    });
    expect(allowed.post).toBeDefined();
  });
});
