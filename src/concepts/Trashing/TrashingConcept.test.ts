import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { setupTestDb } from "@utils/testing.ts";
import type { ID } from "@utils/types.ts";
import TrashingConcept from "./TrashingConcept.ts";

const mongo = await setupTestDb();
const Trashing = new TrashingConcept(mongo.db);

afterAll(() => mongo.stop());

beforeEach(async () => {
  await mongo.db.collection("Trashing.items").deleteMany({});
});

/** Narrow a result union to its success branch, failing the test otherwise. */
function ok<T>(result: T | { error: string }): T {
  if (result && typeof result === "object" && "error" in result) {
    throw new Error(`Expected success but got error: ${result.error}`);
  }
  return result as T;
}

const item = (s: string) => s as ID;
const actor = (s: string) => s as ID;

describe("Trashing", () => {
  test("principle: a trashed item is hidden yet restorable until purged", async () => {
    const i = item("doc1");
    const by = actor("alice");
    // before trashing, the item is live
    expect(await Trashing._isTrashed({ item: i })).toEqual([
      { trashed: false },
    ]);
    // trashing hides it from normal listings but keeps it around
    ok(await Trashing.trash({ item: i, by }));
    expect(await Trashing._isTrashed({ item: i })).toEqual([{ trashed: true }]);
    const trashed = await Trashing._getTrashed();
    expect(trashed).toHaveLength(1);
    expect(trashed[0]).toMatchObject({ item: i, trashedBy: by });
    expect(trashed[0]?.trashedAt).toBeInstanceOf(Date);
    // it can be restored back to full visibility
    ok(await Trashing.restore({ item: i }));
    expect(await Trashing._isTrashed({ item: i })).toEqual([
      { trashed: false },
    ]);
    expect(await Trashing._getTrashed()).toEqual([]);
  });

  test("trash requires the item not to be already trashed", async () => {
    const i = item("doc2");
    const { item: trashedItem } = ok(
      await Trashing.trash({ item: i, by: actor("bob") }),
    );
    expect(trashedItem).toBe(i);
    expect(
      await Trashing.trash({ item: i, by: actor("carol") }),
    ).toHaveProperty("error");
  });

  test("restore requires the item to be trashed", async () => {
    const i = item("doc3");
    expect(await Trashing.restore({ item: i })).toHaveProperty("error");
    ok(await Trashing.trash({ item: i, by: actor("dave") }));
    const restored = ok(await Trashing.restore({ item: i }));
    expect(restored.item).toBe(i);
    // restoring again errors, the record is gone
    expect(await Trashing.restore({ item: i })).toHaveProperty("error");
  });

  test("purge requires the item to be trashed and forgets the record", async () => {
    const i = item("doc4");
    expect(await Trashing.purge({ item: i })).toHaveProperty("error");
    ok(await Trashing.trash({ item: i, by: actor("erin") }));
    const purged = ok(await Trashing.purge({ item: i }));
    expect(purged.item).toBe(i);
    // after purging the record is gone for good
    expect(await Trashing._isTrashed({ item: i })).toEqual([
      { trashed: false },
    ]);
    expect(await Trashing._getTrashed()).toEqual([]);
    expect(await Trashing.purge({ item: i })).toHaveProperty("error");
  });

  test("an item may be trashed again after being restored or purged", async () => {
    const i = item("doc5");
    ok(await Trashing.trash({ item: i, by: actor("frank") }));
    ok(await Trashing.restore({ item: i }));
    ok(await Trashing.trash({ item: i, by: actor("grace") }));
    ok(await Trashing.purge({ item: i }));
    ok(await Trashing.trash({ item: i, by: actor("heidi") }));
    expect(await Trashing._isTrashed({ item: i })).toEqual([{ trashed: true }]);
  });

  test("_isTrashed reflects current state per item", async () => {
    const a = item("a");
    const b = item("b");
    ok(await Trashing.trash({ item: a, by: actor("ivan") }));
    expect(await Trashing._isTrashed({ item: a })).toEqual([{ trashed: true }]);
    expect(await Trashing._isTrashed({ item: b })).toEqual([
      { trashed: false },
    ]);
  });

  test("_getTrashed returns every trashed item with its metadata", async () => {
    const a = item("g1");
    const b = item("g2");
    const by1 = actor("judy");
    const by2 = actor("mallory");
    ok(await Trashing.trash({ item: a, by: by1 }));
    ok(await Trashing.trash({ item: b, by: by2 }));
    const trashed = await Trashing._getTrashed();
    expect(trashed).toHaveLength(2);
    expect(trashed).toContainEqual(
      expect.objectContaining({ item: a, trashedBy: by1 }),
    );
    expect(trashed).toContainEqual(
      expect.objectContaining({ item: b, trashedBy: by2 }),
    );
  });

  test("namespaces isolate duplicate concept instances", async () => {
    const Drafts = new TrashingConcept(mongo.db, "Drafts");
    const Posts = new TrashingConcept(mongo.db, "Posts");

    const shared = item("shared");
    ok(await Drafts.trash({ item: shared, by: actor("oscar") }));

    expect(await Drafts._isTrashed({ item: shared })).toEqual([
      { trashed: true },
    ]);
    expect(await Posts._isTrashed({ item: shared })).toEqual([
      { trashed: false },
    ]);
    expect(await Trashing._isTrashed({ item: shared })).toEqual([
      { trashed: false },
    ]);

    await mongo.db.collection("Drafts.items").deleteMany({});
    await mongo.db.collection("Posts.items").deleteMany({});
  });
});
