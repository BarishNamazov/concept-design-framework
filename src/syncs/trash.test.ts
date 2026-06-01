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

describe("trash synchronizations", () => {
  test("trash removes an item and reflects in isTrashed and list", async () => {
    const { user, session } = await registerAndLogin("trash_alice");

    const res = await app.send("/trash/trash", { session, item: "x1" });
    expect(res).toEqual({ item: "x1" });

    const isTrashed = await app.send("/trash/isTrashed", { item: "x1" });
    expect(isTrashed.trashed).toBe(true);

    const list = await app.send("/trash/list", {});
    const entry = list.trashed.find(($: { item: string }) => $.item === "x1");
    expect(entry).toBeDefined();
    expect(entry.trashedBy).toBe(user);
  });

  test("trashing an already trashed item errors", async () => {
    const { session } = await registerAndLogin("trash_bob");
    await app.send("/trash/trash", { session, item: "x1" });

    const dup = await app.send("/trash/trash", { session, item: "x1" });
    expect(dup.error).toBeDefined();
    expect(dup.item).toBeUndefined();
  });

  test("restore brings an item back", async () => {
    const { session } = await registerAndLogin("trash_carol");
    await app.send("/trash/trash", { session, item: "x1" });

    const res = await app.send("/trash/restore", { session, item: "x1" });
    expect(res).toEqual({ item: "x1" });

    const isTrashed = await app.send("/trash/isTrashed", { item: "x1" });
    expect(isTrashed.trashed).toBe(false);

    const list = await app.send("/trash/list", {});
    expect(list.trashed).toEqual([]);
  });

  test("restoring an item that is not trashed errors", async () => {
    const { session } = await registerAndLogin("trash_dave");

    const res = await app.send("/trash/restore", { session, item: "x1" });
    expect(res.error).toBeDefined();
    expect(res.item).toBeUndefined();
  });

  test("purge permanently removes a trashed item", async () => {
    const { session } = await registerAndLogin("trash_erin");
    await app.send("/trash/trash", { session, item: "x1" });

    const res = await app.send("/trash/purge", { session, item: "x1" });
    expect(res).toEqual({ item: "x1" });

    const isTrashed = await app.send("/trash/isTrashed", { item: "x1" });
    expect(isTrashed.trashed).toBe(false);

    const list = await app.send("/trash/list", {});
    expect(list.trashed).toEqual([]);
  });

  test("purging an item that is not trashed errors", async () => {
    const { session } = await registerAndLogin("trash_frank");

    const res = await app.send("/trash/purge", { session, item: "x1" });
    expect(res.error).toBeDefined();
    expect(res.item).toBeUndefined();
  });

  test("trash with an invalid session errors", async () => {
    const res = await app.send("/trash/trash", {
      session: "nope",
      item: "x1",
    });
    expect(res.error).toBe("Invalid or expired session.");
  });

  test("restore with an invalid session errors", async () => {
    const res = await app.send("/trash/restore", {
      session: "nope",
      item: "x1",
    });
    expect(res.error).toBe("Invalid or expired session.");
  });

  test("purge with an invalid session errors", async () => {
    const res = await app.send("/trash/purge", {
      session: "nope",
      item: "x1",
    });
    expect(res.error).toBe("Invalid or expired session.");
  });
});

/** Bootstrap a forum administrator (holds both `administer` and `moderate`). */
async function establishAdmin(
  username: string,
): Promise<{ user: string; session: string }> {
  const admin = await registerAndLogin(username);
  await app.send("/roles/define", {
    session: admin.session,
    name: "administrator",
    capabilities: ["administer", "moderate"],
  });
  await app.send("/roles/grant", {
    session: admin.session,
    user: admin.user,
    context: "forum",
    role: "administrator",
  });
  return admin;
}

describe("trash authorization", () => {
  test("once the forum has an admin, an ordinary member cannot trash", async () => {
    await establishAdmin("trash_admin");
    const member = await registerAndLogin("trash_member");

    const res = await app.send("/trash/trash", {
      session: member.session,
      item: "x1",
    });
    expect(res.error).toBe("Not authorized to trash items.");

    const isTrashed = await app.send("/trash/isTrashed", { item: "x1" });
    expect(isTrashed.trashed).toBe(false);
  });

  test("a member cannot restore or purge an admin-trashed item", async () => {
    const admin = await establishAdmin("trash_admin2");
    const member = await registerAndLogin("trash_member2");
    await app.send("/trash/trash", { session: admin.session, item: "x1" });

    const restore = await app.send("/trash/restore", {
      session: member.session,
      item: "x1",
    });
    expect(restore.error).toBe("Not authorized to restore items.");

    const purge = await app.send("/trash/purge", {
      session: member.session,
      item: "x1",
    });
    expect(purge.error).toBe("Not authorized to purge items.");

    // The item is still trashed; neither attempt took effect.
    const isTrashed = await app.send("/trash/isTrashed", { item: "x1" });
    expect(isTrashed.trashed).toBe(true);
  });
});

/**
 * The soft-delete must be more than cosmetic: a trashed post disappears from the
 * thread view, the front-page list, single-post reads, and author listings, and
 * reappears once restored.
 */
describe("trashed posts are hidden from reads", () => {
  async function createThread(
    session: string,
    content: string,
  ): Promise<{ post: string; node: string; conversation: string }> {
    const res = await app.send("/threads/create", { session, content });
    return { post: res.post, node: res.node, conversation: res.conversation };
  }

  test("a trashed root post drops out of the thread list and reappears on restore", async () => {
    const admin = await establishAdmin("trash_read_admin");
    const author = await registerAndLogin("trash_read_author");
    const visible = await createThread(author.session, "still here");
    const doomed = await createThread(author.session, "goodbye");

    const before = await app.send("/threads/list", {});
    expect(
      before.conversations.map(($: { conversation: string }) => $.conversation),
    ).toContain(doomed.conversation);

    await app.send("/trash/trash", {
      session: admin.session,
      item: doomed.post,
    });

    const after = await app.send("/threads/list", {});
    const ids = after.conversations.map(
      ($: { conversation: string }) => $.conversation,
    );
    expect(ids).toContain(visible.conversation);
    expect(ids).not.toContain(doomed.conversation);

    await app.send("/trash/restore", {
      session: admin.session,
      item: doomed.post,
    });
    const restored = await app.send("/threads/list", {});
    expect(
      restored.conversations.map(
        ($: { conversation: string }) => $.conversation,
      ),
    ).toContain(doomed.conversation);
  });

  test("a trashed post reads as not found and leaves the thread view", async () => {
    const admin = await establishAdmin("trash_read_admin2");
    const author = await registerAndLogin("trash_read_author2");
    const root = await createThread(author.session, "root post");
    const reply = await app.send("/threads/reply", {
      session: author.session,
      parent: root.node,
      content: "a reply",
    });

    await app.send("/trash/trash", {
      session: admin.session,
      item: reply.post,
    });

    const gone = await app.send("/posts/get", { post: reply.post });
    expect(gone.error).toBe("Post not found.");

    const thread = await app.send("/threads/get", {
      conversation: root.conversation,
    });
    const items = thread.thread.map(($: { item: string }) => $.item);
    expect(items).toContain(root.post);
    expect(items).not.toContain(reply.post);
  });

  test("a trashed post drops out of its author's post list", async () => {
    const admin = await establishAdmin("trash_read_admin3");
    const author = await registerAndLogin("trash_read_author3");
    const kept = await createThread(author.session, "kept post");
    const removed = await createThread(author.session, "removed post");

    await app.send("/trash/trash", {
      session: admin.session,
      item: removed.post,
    });

    const byAuthor = await app.send("/posts/byAuthor", { author: author.user });
    const posts = byAuthor.posts.map(($: { post: string }) => $.post);
    expect(posts).toContain(kept.post);
    expect(posts).not.toContain(removed.post);
  });
});
