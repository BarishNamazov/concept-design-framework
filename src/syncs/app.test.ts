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
  const { session } = await app.send("/auth/login", { username, password: "pw" });
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

    const bio = await app.send("/profiles/setBio", { session, bio: "hi there" });
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
