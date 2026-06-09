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

    // The new password authenticates; the old one no longer does.
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

    // The original password still works; nothing changed.
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

// --- helpers for the forum endpoints below ---

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

describe("thread / post synchronizations", () => {
  test("create a thread renders markdown and tracks unread", async () => {
    const { user, session } = await registerAndLogin("t_alice");
    const res = await app.send("/threads/create", { session, content: "# Hi" });
    expect(res.post).toBeDefined();
    expect(res.conversation).toBeDefined();
    expect(res.node).toBeDefined();

    const got = await app.send("/posts/get", { post: res.post });
    expect(got.post.author).toBe(user);
    expect(got.post.content).toBe("# Hi");
    expect(got.post.rendered).toContain("<h1>");

    // The post is unread for a different user in the conversation scope.
    const other = await registerAndLogin("t_bob");
    const count = await app.send("/unread/count", {
      session: other.session,
      scope: res.conversation,
    });
    expect(count.count).toBe(1);
  });

  test("create with invalid session errors", async () => {
    const res = await app.send("/threads/create", {
      session: "nope",
      content: "x",
    });
    expect(res.error).toBeDefined();
  });

  test("reply attaches under a parent and records links", async () => {
    const { session } = await registerAndLogin("t_carol");
    const root = await app.send("/threads/create", {
      session,
      content: "root",
    });
    const reply = await app.send("/threads/reply", {
      session,
      parent: root.node,
      content: `see [[${root.post}]]`,
    });
    expect(reply.post).toBeDefined();
    expect(reply.node).toBeDefined();

    const forward = await app.send("/links/forward", { source: reply.post });
    expect(forward.targets).toEqual([{ target: root.post }]);

    const back = await app.send("/links/backlinks", { target: root.post });
    expect(back.sources).toEqual([{ source: reply.post }]);
  });

  test("get a thread returns enriched, ordered nodes", async () => {
    const { session } = await registerAndLogin("t_dave");
    const root = await app.send("/threads/create", {
      session,
      content: "root post",
    });
    await app.send("/threads/reply", {
      session,
      parent: root.node,
      content: "a reply",
    });
    const res = await app.send("/threads/get", {
      conversation: root.conversation,
    });
    expect(res.thread).toHaveLength(2);
    expect(res.thread[0].node).toBe(root.node);
    expect(res.thread[0].post.content).toBe("root post");
    expect(res.thread[0].rendered).toContain("root post");
    expect(res.thread[1].parent).toBe(root.node);
  });

  test("byAuthor lists a user's posts", async () => {
    const { user, session } = await registerAndLogin("t_erin");
    await app.send("/threads/create", { session, content: "one" });
    await app.send("/threads/create", { session, content: "two" });
    const res = await app.send("/posts/byAuthor", { author: user });
    expect(res.posts).toHaveLength(2);
  });
});

describe("thread list synchronizations", () => {
  test("list with no conversations returns an empty feed", async () => {
    const res = await app.send("/threads/list", { sort: "latest" });
    expect(res.conversations).toEqual([]);
  });

  test("list returns conversation roots newest-first, enriched with the root post", async () => {
    const { user, session } = await registerAndLogin("l_alice");
    const first = await app.send("/threads/create", {
      session,
      content: "first topic",
    });
    // Ensure a strictly later createdAt so the ordering is deterministic.
    await new Promise((r) => setTimeout(r, 5));
    const second = await app.send("/threads/create", {
      session,
      content: "second topic",
    });
    // A reply is not a conversation root and must not appear in the feed.
    await app.send("/threads/reply", {
      session,
      parent: first.node,
      content: "a reply",
    });

    const res = await app.send("/threads/list", { sort: "latest" });
    expect(res.conversations).toHaveLength(2);

    // Newest-first: the second conversation comes before the first.
    const [newest, oldest] = res.conversations;
    expect(newest.conversation).toBe(second.conversation);
    expect(newest.root).toBe(second.node);
    expect(newest.item).toBe(second.post);
    expect(newest.post.content).toBe("second topic");
    expect(newest.post.author).toBe(user);

    expect(oldest.conversation).toBe(first.conversation);
    expect(oldest.item).toBe(first.post);
    expect(oldest.post.content).toBe("first topic");
  });

  test("list with sort=activity returns conversations by last activity", async () => {
    const { session } = await registerAndLogin("la_alice");
    const { session: bob } = await registerAndLogin("la_bob");

    const first = await app.send("/threads/create", {
      session,
      content: "first created",
    });
    const second = await app.send("/threads/create", {
      session,
      content: "second created",
    });

    // Ensure distinct timestamps so the reply's bump is observable.
    await new Promise((r) => setTimeout(r, 10));

    // Reply to the older (first) thread so it becomes most recently active.
    await app.send("/threads/reply", {
      session: bob,
      parent: first.node,
      content: "reply to first",
    });

    // With sort=latest, second (newer creation) appears first.
    const byLatest = await app.send("/threads/list", { sort: "latest" });
    const latestIds = byLatest.conversations.map(
      (c: { conversation: string }) => c.conversation,
    );
    expect(latestIds[0]).toBe(second.conversation);

    // With sort=activity, first (with a reply) appears first.
    const byActivity = await app.send("/threads/list", {
      sort: "activity",
    });
    const activityIds = byActivity.conversations.map(
      (c: { conversation: string }) => c.conversation,
    );
    expect(activityIds[0]).toBe(first.conversation);

    // The two sort modes produce different orders.
    expect(latestIds).not.toEqual(activityIds);

    // Each conversation now includes lastActivityAt.
    expect(byActivity.conversations[0].lastActivityAt).toBeDefined();
  });
});

describe("post edit / delete synchronizations", () => {
  test("author can edit a post; re-renders and updates links", async () => {
    const { post } = await createPost("e_alice", "before");
    const owner = await app.send("/auth/login", {
      username: "e_alice",
      password: "pw",
    });
    const res = await app.send("/posts/edit", {
      session: owner.session,
      post,
      content: "# after",
    });
    expect(res.post).toBe(post);
    const got = await app.send("/posts/get", { post });
    expect(got.post.content).toBe("# after");
    expect(got.post.rendered).toContain("<h1>");
    expect(got.post.editedAt).not.toBeNull();
  });

  test("non-author cannot edit", async () => {
    const { post } = await createPost("e_bob", "mine");
    const intruder = await registerAndLogin("e_eve");
    const res = await app.send("/posts/edit", {
      session: intruder.session,
      post,
      content: "hacked",
    });
    expect(res.error).toBeDefined();
    const got = await app.send("/posts/get", { post });
    expect(got.post.content).toBe("mine");
  });

  test("edit with invalid session errors", async () => {
    const { post } = await createPost("e_carol", "x");
    const res = await app.send("/posts/edit", {
      session: "nope",
      post,
      content: "y",
    });
    expect(res.error).toBe("Invalid or expired session.");
  });

  test("author can delete a post and cascades clean up", async () => {
    const { user, session, post, conversation } = await createPost(
      "d_alice",
      "doomed",
    );
    const res = await app.send("/posts/delete", { session, post });
    expect(res.post).toBe(post);

    const got = await app.send("/posts/get", { post });
    expect(got.post).toBeUndefined();

    const byAuthor = await app.send("/posts/byAuthor", { author: user });
    expect(byAuthor.posts ?? []).toEqual([]);

    void conversation;
  });

  test("non-author cannot delete", async () => {
    const { post } = await createPost("d_bob", "keep");
    const intruder = await registerAndLogin("d_eve");
    const res = await app.send("/posts/delete", {
      session: intruder.session,
      post,
    });
    expect(res.error).toBeDefined();
    const got = await app.send("/posts/get", { post });
    expect(got.post.content).toBe("keep");
  });

  test("cannot delete a post that has replies; deletes once the reply is gone", async () => {
    const { session } = await registerAndLogin("d_guard");
    const root = await app.send("/threads/create", {
      session,
      content: "root with a reply",
    });
    const reply = await app.send("/threads/reply", {
      session,
      parent: root.node,
      content: "child",
    });

    // The root has a reply, so it cannot be deleted.
    const blocked = await app.send("/posts/delete", {
      session,
      post: root.post,
    });
    expect(blocked.error).toBe("Cannot delete a post that has replies.");
    const stillThere = await app.send("/posts/get", { post: root.post });
    expect(stillThere.post.content).toBe("root with a reply");

    // Deleting the leaf reply succeeds, after which the root is deletable.
    const leaf = await app.send("/posts/delete", { session, post: reply.post });
    expect(leaf.post).toBe(reply.post);
    const nowOk = await app.send("/posts/delete", { session, post: root.post });
    expect(nowOk.post).toBe(root.post);
  });

  test("deleting a post cascades across every concept", async () => {
    const author = await registerAndLogin("d_cascade");
    const reader = await registerAndLogin("d_reader");

    // A root post and a reply that links back to it via [[..]].
    const root = await app.send("/threads/create", {
      session: author.session,
      content: "cascade root",
    });
    const reply = await app.send("/threads/reply", {
      session: author.session,
      parent: root.node,
      content: `mentions [[${root.post}]]`,
    });
    const target = reply.post;

    // Decorate the reply: a reaction and a tag.
    await app.send("/reactions/add", {
      session: author.session,
      target,
      kind: "like",
    });
    const tag = await app.send("/tags/create", {
      session: author.session,
      name: "topic",
    });
    await app.send("/tags/add", {
      session: author.session,
      target,
      tag: tag.tag,
    });

    // Sanity: everything is in place before the delete.
    expect(
      (await app.send("/reactions/forTarget", { target })).reactions,
    ).toHaveLength(1);
    expect((await app.send("/tags/forTarget", { target })).tags).toHaveLength(
      1,
    );
    expect((await app.send("/tags/targets", { tag: tag.tag })).targets).toEqual(
      [{ target }],
    );
    expect(
      (await app.send("/links/forward", { source: target })).targets,
    ).toEqual([{ target: root.post }]);
    expect(await app.concepts.Formatting._getRendered({ target })).toHaveLength(
      1,
    );
    expect(
      await app.concepts.Conversing._getNodeByItem({ item: target }),
    ).toHaveLength(1);
    const before = await app.send("/unread/count", {
      session: reader.session,
      scope: root.conversation,
    });
    expect(before.count).toBe(2);

    // Delete the reply (a leaf node, so the guard allows it).
    const res = await app.send("/posts/delete", {
      session: author.session,
      post: target,
    });
    expect(res.post).toBe(target);

    // Reacting.clearTarget cleared the reactions.
    expect(
      (await app.send("/reactions/forTarget", { target })).reactions,
    ).toEqual([]);
    // Tagging.clearTarget cleared the tag application (both directions).
    expect((await app.send("/tags/forTarget", { target })).tags).toEqual([]);
    expect((await app.send("/tags/targets", { tag: tag.tag })).targets).toEqual(
      [],
    );
    // Linking.clearLinks cleared the forward links from the deleted post.
    expect(
      (await app.send("/links/forward", { source: target })).targets,
    ).toEqual([]);
    // Formatting.clear removed the rendered source.
    expect(await app.concepts.Formatting._getRendered({ target })).toEqual([]);
    // Conversing.remove deleted the node placing the post.
    expect(
      await app.concepts.Conversing._getNodeByItem({ item: target }),
    ).toEqual([]);
    // Tracking.unregister removed the unread item from the scope (root remains).
    const after = await app.send("/unread/count", {
      session: reader.session,
      scope: root.conversation,
    });
    expect(after.count).toBe(1);

    // The root post is untouched.
    expect(
      (await app.send("/posts/get", { post: root.post })).post.content,
    ).toBe("cascade root");
  });
});

describe("reaction synchronizations", () => {
  test("add, list and remove a reaction", async () => {
    const { user, session, post } = await createPost("r_alice", "react to me");

    const added = await app.send("/reactions/add", {
      session,
      target: post,
      kind: "like",
    });
    expect(added.reaction).toBeDefined();

    const list = await app.send("/reactions/forTarget", { target: post });
    expect(list.reactions).toEqual([
      { reaction: added.reaction, user, kind: "like" },
    ]);

    const removed = await app.send("/reactions/remove", {
      session,
      target: post,
      kind: "like",
    });
    expect(removed.ok).toBe(true);
  });

  test("duplicate reaction errors", async () => {
    const { session, post } = await createPost("r_bob", "x");
    await app.send("/reactions/add", { session, target: post, kind: "like" });
    const dup = await app.send("/reactions/add", {
      session,
      target: post,
      kind: "like",
    });
    expect(dup.error).toBeDefined();
  });

  test("removing a missing reaction errors", async () => {
    const { session, post } = await createPost("r_carol", "x");
    const res = await app.send("/reactions/remove", {
      session,
      target: post,
      kind: "like",
    });
    expect(res.error).toBeDefined();
  });

  test("add with invalid session errors", async () => {
    const res = await app.send("/reactions/add", {
      session: "nope",
      target: "t",
      kind: "like",
    });
    expect(res.error).toBe("Invalid or expired session.");
  });
});

describe("tag synchronizations", () => {
  test("create, add, list and remove tags", async () => {
    const { session, post } = await createPost("g_alice", "x");
    const created = await app.send("/tags/create", { session, name: "news" });
    expect(created.tag).toBeDefined();

    const added = await app.send("/tags/add", {
      session,
      target: post,
      tag: created.tag,
    });
    expect(added.target).toBe(post);

    const forTarget = await app.send("/tags/forTarget", { target: post });
    expect(forTarget.tags).toEqual([{ tag: created.tag, name: "news" }]);

    const targets = await app.send("/tags/targets", { tag: created.tag });
    expect(targets.targets).toEqual([{ target: post }]);

    const removed = await app.send("/tags/remove", {
      session,
      target: post,
      tag: created.tag,
    });
    expect(removed.target).toBe(post);
  });

  test("duplicate tag name errors", async () => {
    const { session } = await registerAndLogin("g_bob");
    await app.send("/tags/create", { session, name: "dup" });
    const dup = await app.send("/tags/create", { session, name: "dup" });
    expect(dup.error).toBeDefined();
  });

  test("create tag with invalid session errors", async () => {
    const res = await app.send("/tags/create", { session: "nope", name: "x" });
    expect(res.error).toBe("Invalid or expired session.");
  });
});

describe("unread synchronizations", () => {
  test("list, count, markSeen and markAllSeen", async () => {
    const author = await registerAndLogin("u_author");
    const t1 = await app.send("/threads/create", {
      session: author.session,
      content: "one",
    });
    const reader = await registerAndLogin("u_reader");

    const list = await app.send("/unread/list", {
      session: reader.session,
      scope: t1.conversation,
    });
    expect(list.items).toEqual([{ item: t1.post }]);

    const seen = await app.send("/unread/markSeen", {
      session: reader.session,
      item: t1.post,
    });
    expect(seen.item).toBe(t1.post);

    const count = await app.send("/unread/count", {
      session: reader.session,
      scope: t1.conversation,
    });
    expect(count.count).toBe(0);
  });

  test("markAllSeen clears the scope", async () => {
    const author = await registerAndLogin("u_author2");
    const t1 = await app.send("/threads/create", {
      session: author.session,
      content: "root",
    });
    await app.send("/threads/reply", {
      session: author.session,
      parent: t1.node,
      content: "reply",
    });
    const reader = await registerAndLogin("u_reader2");

    const before = await app.send("/unread/count", {
      session: reader.session,
      scope: t1.conversation,
    });
    expect(before.count).toBe(2);

    const all = await app.send("/unread/markAllSeen", {
      session: reader.session,
      scope: t1.conversation,
    });
    expect(all.user).toBe(reader.user);

    const after = await app.send("/unread/count", {
      session: reader.session,
      scope: t1.conversation,
    });
    expect(after.count).toBe(0);
  });

  test("unread count with invalid session errors", async () => {
    const res = await app.send("/unread/count", {
      session: "nope",
      scope: "s",
    });
    expect(res.error).toBe("Invalid or expired session.");
  });

  test("markSeen on an unregistered item errors", async () => {
    const { session } = await registerAndLogin("u_carol");
    const res = await app.send("/unread/markSeen", {
      session,
      item: "not-registered",
    });
    expect(res.error).toBeDefined();
  });
});

/** Creates a logged-in user and a single top-level post, returning the ids. */
async function createPost(
  username: string,
  content: string,
): Promise<{
  user: string;
  session: string;
  post: string;
  conversation: string;
  node: string;
}> {
  const { user, session } = await registerAndLogin(username);
  const { post, conversation, node } = await app.send("/threads/create", {
    session,
    content,
  });
  return { user, session, post, conversation, node };
}
