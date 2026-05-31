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

describe("bookmark synchronizations", () => {
  test("save adds a private bookmark visible only to its owner", async () => {
    const alice = await registerAndLogin("bm_alice");
    const bob = await registerAndLogin("bm_bob");

    const saved = await app.send("/bookmarks/save", {
      session: alice.session,
      item: "i1",
    });
    expect(saved.bookmark).toBeDefined();

    const aliceList = await app.send("/bookmarks/list", {
      session: alice.session,
    });
    expect(aliceList.bookmarks).toHaveLength(1);
    expect(aliceList.bookmarks[0].item).toBe("i1");

    // Privacy: bob cannot see alice's bookmarks.
    const bobList = await app.send("/bookmarks/list", {
      session: bob.session,
    });
    expect(bobList.bookmarks).toEqual([]);
  });

  test("isSaved is true for the owner and false for others", async () => {
    const alice = await registerAndLogin("bm_isaved_alice");
    const bob = await registerAndLogin("bm_isaved_bob");

    await app.send("/bookmarks/save", { session: alice.session, item: "i1" });

    const aliceSaved = await app.send("/bookmarks/isSaved", {
      session: alice.session,
      item: "i1",
    });
    expect(aliceSaved.saved).toBe(true);

    const bobSaved = await app.send("/bookmarks/isSaved", {
      session: bob.session,
      item: "i1",
    });
    expect(bobSaved.saved).toBe(false);
  });

  test("saving the same item twice errors", async () => {
    const alice = await registerAndLogin("bm_dup");
    await app.send("/bookmarks/save", { session: alice.session, item: "i1" });
    const dup = await app.send("/bookmarks/save", {
      session: alice.session,
      item: "i1",
    });
    expect(dup.error).toBeDefined();
    expect(dup.bookmark).toBeUndefined();
  });

  test("unsave removes the bookmark and returns its id", async () => {
    const alice = await registerAndLogin("bm_unsave");
    const saved = await app.send("/bookmarks/save", {
      session: alice.session,
      item: "i1",
    });

    const removed = await app.send("/bookmarks/unsave", {
      session: alice.session,
      item: "i1",
    });
    expect(removed.bookmark).toBe(saved.bookmark);

    const list = await app.send("/bookmarks/list", { session: alice.session });
    expect(list.bookmarks).toEqual([]);

    const isSaved = await app.send("/bookmarks/isSaved", {
      session: alice.session,
      item: "i1",
    });
    expect(isSaved.saved).toBe(false);
  });

  test("unsaving an item that is not saved errors", async () => {
    const alice = await registerAndLogin("bm_absent");
    const res = await app.send("/bookmarks/unsave", {
      session: alice.session,
      item: "i1",
    });
    expect(res.error).toBeDefined();
    expect(res.bookmark).toBeUndefined();
  });

  test("save with invalid session errors", async () => {
    const res = await app.send("/bookmarks/save", {
      session: "nope",
      item: "i1",
    });
    expect(res.error).toBe("Invalid or expired session.");
  });

  test("unsave with invalid session errors", async () => {
    const res = await app.send("/bookmarks/unsave", {
      session: "nope",
      item: "i1",
    });
    expect(res.error).toBe("Invalid or expired session.");
  });

  test("list with invalid session errors", async () => {
    const res = await app.send("/bookmarks/list", { session: "nope" });
    expect(res.error).toBe("Invalid or expired session.");
  });

  test("isSaved with invalid session errors", async () => {
    const res = await app.send("/bookmarks/isSaved", {
      session: "nope",
      item: "i1",
    });
    expect(res.error).toBe("Invalid or expired session.");
  });
});
