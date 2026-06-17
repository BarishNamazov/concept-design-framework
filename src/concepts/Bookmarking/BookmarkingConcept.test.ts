import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { setupTestDb } from "@utils/testing.ts";
import type { ID } from "@utils/types.ts";
import type { ForumErrorCode } from "../../sdk/error-codes.ts";
import BookmarkingConcept from "./BookmarkingConcept.ts";

const mongo = await setupTestDb();
const Bookmarking = new BookmarkingConcept(mongo.db);

afterAll(() => mongo.stop());

beforeEach(async () => {
  await mongo.db.collection("Bookmarking.bookmarks").deleteMany({});
});

/** Narrow a result union to its success branch, failing the test otherwise. */
function ok<T>(result: T | { error: ForumErrorCode; detail?: string }): T {
  if (result && typeof result === "object" && "error" in result) {
    throw new Error(`Expected success but got error: ${result.error}`);
  }
  return result as T;
}

const user = (s: string) => s as ID;
const item = (s: string) => s as ID;

describe("Bookmarking", () => {
  test("principle: a saved item appears in the user's list until removed", async () => {
    const u = user("alice");
    const i = item("article1");
    ok(await Bookmarking.save({ user: u, item: i }));
    // the item is now saved and shows up in the user's list
    expect(await Bookmarking._isSaved({ user: u, item: i })).toEqual([
      { saved: true },
    ]);
    const saved = await Bookmarking._getSaved({ user: u });
    expect(saved).toHaveLength(1);
    expect(saved[0]?.item).toBe(i);
    // removing the bookmark drops it from the list
    ok(await Bookmarking.unsave({ user: u, item: i }));
    expect(await Bookmarking._isSaved({ user: u, item: i })).toEqual([
      { saved: false },
    ]);
    expect(await Bookmarking._getSaved({ user: u })).toEqual([]);
  });

  test("save requires the item not to be already bookmarked", async () => {
    const u = user("bob");
    const i = item("article2");
    const { bookmark } = ok(await Bookmarking.save({ user: u, item: i }));
    expect(bookmark).toBeString();
    expect(await Bookmarking.save({ user: u, item: i })).toHaveProperty(
      "error",
    );
  });

  test("unsave requires an existing bookmark", async () => {
    const u = user("carol");
    const i = item("article3");
    expect(await Bookmarking.unsave({ user: u, item: i })).toHaveProperty(
      "error",
    );
    const { bookmark } = ok(await Bookmarking.save({ user: u, item: i }));
    const removed = ok(await Bookmarking.unsave({ user: u, item: i }));
    expect(removed.bookmark).toBe(bookmark);
  });

  test("_getSaved returns the user's items newest-first", async () => {
    const u = user("dave");
    ok(await Bookmarking.save({ user: u, item: item("first") }));
    ok(await Bookmarking.save({ user: u, item: item("second") }));
    ok(await Bookmarking.save({ user: u, item: item("third") }));
    const saved = await Bookmarking._getSaved({ user: u });
    expect(saved.map((s) => s.item)).toEqual([
      item("third"),
      item("second"),
      item("first"),
    ]);
  });

  test("bookmarks are private to each user", async () => {
    const alice = user("alice");
    const bob = user("bob");
    const i = item("shared-article");
    ok(await Bookmarking.save({ user: alice, item: i }));
    // bob never saved the item, so it is not in his list and reads as unsaved
    expect(await Bookmarking._isSaved({ user: bob, item: i })).toEqual([
      { saved: false },
    ]);
    expect(await Bookmarking._getSaved({ user: bob })).toEqual([]);
    // alice's own view is unaffected
    expect(await Bookmarking._isSaved({ user: alice, item: i })).toEqual([
      { saved: true },
    ]);
    const aliceSaved = await Bookmarking._getSaved({ user: alice });
    expect(aliceSaved).toHaveLength(1);
    expect(aliceSaved[0]?.item).toBe(i);
  });

  test("different users may independently bookmark the same item", async () => {
    const alice = user("alice");
    const bob = user("bob");
    const i = item("popular");
    const a = ok(await Bookmarking.save({ user: alice, item: i }));
    const b = ok(await Bookmarking.save({ user: bob, item: i }));
    expect(a.bookmark).not.toBe(b.bookmark);
    // removing alice's bookmark leaves bob's intact
    ok(await Bookmarking.unsave({ user: alice, item: i }));
    expect(await Bookmarking._isSaved({ user: alice, item: i })).toEqual([
      { saved: false },
    ]);
    expect(await Bookmarking._isSaved({ user: bob, item: i })).toEqual([
      { saved: true },
    ]);
  });

  test("namespaces isolate duplicate concept instances", async () => {
    const Reading = new BookmarkingConcept(mongo.db, "Reading");
    const Watching = new BookmarkingConcept(mongo.db, "Watching");

    const u = user("erin");
    const i = item("crossover");
    ok(await Reading.save({ user: u, item: i }));

    expect(await Reading._isSaved({ user: u, item: i })).toEqual([
      { saved: true },
    ]);
    expect(await Watching._isSaved({ user: u, item: i })).toEqual([
      { saved: false },
    ]);
    expect(await Bookmarking._isSaved({ user: u, item: i })).toEqual([
      { saved: false },
    ]);
  });
});
