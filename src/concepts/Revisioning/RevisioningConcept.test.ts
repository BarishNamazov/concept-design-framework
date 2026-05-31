import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { setupTestDb } from "@utils/testing.ts";
import type { ID } from "@utils/types.ts";
import RevisioningConcept from "./RevisioningConcept.ts";

const mongo = await setupTestDb();
const Revisioning = new RevisioningConcept(mongo.db);

afterAll(() => mongo.stop());

beforeEach(async () => {
  await mongo.db.collection("Revisioning.revisions").deleteMany({});
});

/** Narrow a result union to its success branch, failing the test otherwise. */
function ok<T>(result: T | { error: string }): T {
  if (result && typeof result === "object" && "error" in result) {
    throw new Error(`Expected success but got error: ${result.error}`);
  }
  return result as T;
}

const item = (s: string) => s as ID;

describe("Revisioning", () => {
  test("principle: each save is retained as the next numbered revision", async () => {
    const i = item("doc1");
    const r1 = ok(await Revisioning.record({ item: i, content: "first" }));
    const r2 = ok(await Revisioning.record({ item: i, content: "second" }));
    const r3 = ok(await Revisioning.record({ item: i, content: "third" }));
    // revision numbers increase monotonically starting at 1
    expect(r1.number).toBe(1);
    expect(r2.number).toBe(2);
    expect(r3.number).toBe(3);

    // _getRevisions lists every revision in ascending number order
    const revisions = await Revisioning._getRevisions({ item: i });
    expect(revisions).toHaveLength(3);
    expect(revisions.map((r) => r.number)).toEqual([1, 2, 3]);
    expect(revisions.map((r) => r.content)).toEqual([
      "first",
      "second",
      "third",
    ]);

    // _getRevision retrieves a specific numbered revision's content
    expect(await Revisioning._getRevision({ item: i, number: 2 })).toEqual([
      { content: "second", savedAt: revisions[1].savedAt },
    ]);

    // _getLatest returns the highest-numbered revision
    expect(await Revisioning._getLatest({ item: i })).toEqual([
      {
        revision: r3.revision,
        number: 3,
        content: "third",
        savedAt: revisions[2].savedAt,
      },
    ]);
  });

  test("revision numbering is per-item independent", async () => {
    const a = item("itemA");
    const b = item("itemB");
    const a1 = ok(await Revisioning.record({ item: a, content: "a-one" }));
    const b1 = ok(await Revisioning.record({ item: b, content: "b-one" }));
    const a2 = ok(await Revisioning.record({ item: a, content: "a-two" }));
    // each item begins its own numbering at 1
    expect(a1.number).toBe(1);
    expect(b1.number).toBe(1);
    expect(a2.number).toBe(2);

    expect(
      (await Revisioning._getRevisions({ item: a })).map((r) => r.number),
    ).toEqual([1, 2]);
    expect(
      (await Revisioning._getRevisions({ item: b })).map((r) => r.number),
    ).toEqual([1]);
  });

  test("_getRevision and _getLatest for an unknown item return []", async () => {
    const unknown = item("ghost");
    expect(
      await Revisioning._getRevision({ item: unknown, number: 1 }),
    ).toEqual([]);
    expect(await Revisioning._getLatest({ item: unknown })).toEqual([]);
    expect(await Revisioning._getRevisions({ item: unknown })).toEqual([]);
  });

  test("_getRevision returns [] for a number that does not exist", async () => {
    const i = item("doc2");
    ok(await Revisioning.record({ item: i, content: "only" }));
    expect(await Revisioning._getRevision({ item: i, number: 2 })).toEqual([]);
  });

  test("namespaces isolate duplicate concept instances", async () => {
    const Drafts = new RevisioningConcept(mongo.db, "Drafts");
    const Articles = new RevisioningConcept(mongo.db, "Articles");

    const i = item("shared");
    const draft = ok(await Drafts.record({ item: i, content: "draft" }));
    const article = ok(await Articles.record({ item: i, content: "article" }));

    expect(draft.revision).not.toBe(article.revision);
    const draftLatest = await Drafts._getLatest({ item: i });
    const articleLatest = await Articles._getLatest({ item: i });
    expect(draftLatest).toEqual([
      {
        revision: draft.revision,
        number: 1,
        content: "draft",
        savedAt: draftLatest[0].savedAt,
      },
    ]);
    expect(articleLatest).toEqual([
      {
        revision: article.revision,
        number: 1,
        content: "article",
        savedAt: articleLatest[0].savedAt,
      },
    ]);
    expect(await Revisioning._getLatest({ item: i })).toEqual([]);
  });
});
