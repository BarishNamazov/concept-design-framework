import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { setupTestDb } from "@utils/testing.ts";
import type { ID } from "@utils/types.ts";
import type { ForumErrorCode } from "../../sdk/error-codes.ts";
import CategorizingConcept from "./CategorizingConcept.ts";

const mongo = await setupTestDb();
const Categorizing = new CategorizingConcept(mongo.db);

afterAll(() => mongo.stop());

beforeEach(async () => {
  await mongo.db.collection("Categorizing.categories").deleteMany({});
  await mongo.db.collection("Categorizing.memberships").deleteMany({});
});

/** Narrow a result union to its success branch, failing the test otherwise. */
function ok<T>(result: T | { error: ForumErrorCode; detail?: string }): T {
  if (result && typeof result === "object" && "error" in result) {
    throw new Error(`Expected success but got error: ${result.error}`);
  }
  return result as T;
}

const item = (s: string) => s as ID;

describe("Categorizing", () => {
  test("principle: an item has a single home that moves when reassigned", async () => {
    const { category: logistics } = ok(
      await Categorizing.createCategory({
        name: "Logistics",
        description: "Course logistics and announcements.",
      }),
    );
    const { category: exams } = ok(
      await Categorizing.createCategory({
        name: "Exams",
        description: "Exam preparation and questions.",
      }),
    );
    const post = item("post1");

    // assigning the item makes it appear under exactly that one category
    ok(await Categorizing.assign({ item: post, category: logistics }));
    expect(await Categorizing._getCategory({ item: post })).toEqual([
      {
        category: logistics,
        name: "Logistics",
        description: "Course logistics and announcements.",
      },
    ]);
    expect(await Categorizing._getItems({ category: logistics })).toEqual([
      { item: post },
    ]);

    // assigning it elsewhere MOVES it (single home)
    ok(await Categorizing.assign({ item: post, category: exams }));
    expect(await Categorizing._getCategory({ item: post })).toEqual([
      {
        category: exams,
        name: "Exams",
        description: "Exam preparation and questions.",
      },
    ]);
    expect(await Categorizing._getItems({ category: logistics })).toEqual([]);
    expect(await Categorizing._getItems({ category: exams })).toEqual([
      { item: post },
    ]);
  });

  test("createCategory requires a unique name", async () => {
    ok(await Categorizing.createCategory({ name: "HW1", description: "" }));
    expect(
      await Categorizing.createCategory({ name: "HW1", description: "" }),
    ).toHaveProperty("error");
  });

  test("namespaces isolate duplicate concept instances", async () => {
    const Sections = new CategorizingConcept(mongo.db, "Sections");
    const Topics = new CategorizingConcept(mongo.db, "Topics");

    const section = ok(
      await Sections.createCategory({ name: "shared", description: "" }),
    );
    const topic = ok(
      await Topics.createCategory({ name: "shared", description: "" }),
    );

    expect(section.category).not.toBe(topic.category);
    expect(await Sections._getCategoryByName({ name: "shared" })).toEqual([
      { category: section.category },
    ]);
    expect(await Topics._getCategoryByName({ name: "shared" })).toEqual([
      { category: topic.category },
    ]);
    expect(await Categorizing._getCategoryByName({ name: "shared" })).toEqual(
      [],
    );
  });

  test("assign requires an existing category", async () => {
    const post = item("post2");
    expect(
      await Categorizing.assign({ item: post, category: item("ghost") }),
    ).toHaveProperty("error");
    expect(await Categorizing._getCategory({ item: post })).toEqual([]);
  });

  test("unassign requires a current membership", async () => {
    const post = item("post3");
    expect(await Categorizing.unassign({ item: post })).toHaveProperty("error");
    const { category } = ok(
      await Categorizing.createCategory({ name: "General", description: "" }),
    );
    ok(await Categorizing.assign({ item: post, category }));
    const removed = ok(await Categorizing.unassign({ item: post }));
    expect(removed.item).toBe(post);
    expect(await Categorizing._getCategory({ item: post })).toEqual([]);
    expect(await Categorizing._getItems({ category })).toEqual([]);
  });

  test("_getItems returns every item homed in a category", async () => {
    const { category } = ok(
      await Categorizing.createCategory({ name: "Logistics", description: "" }),
    );
    const a = item("a1");
    const b = item("a2");
    ok(await Categorizing.assign({ item: a, category }));
    ok(await Categorizing.assign({ item: b, category }));
    const items = await Categorizing._getItems({ category });
    expect(items).toHaveLength(2);
    expect(items).toContainEqual({ item: a });
    expect(items).toContainEqual({ item: b });
  });

  test("deleteCategory removes the category and its memberships", async () => {
    const { category } = ok(
      await Categorizing.createCategory({ name: "Old", description: "stale" }),
    );
    const keep = ok(
      await Categorizing.createCategory({ name: "Keep", description: "live" }),
    );
    const a = item("a3");
    const b = item("a4");
    ok(await Categorizing.assign({ item: a, category }));
    ok(await Categorizing.assign({ item: b, category: keep.category }));

    ok(await Categorizing.deleteCategory({ category }));
    expect(await Categorizing._getCategoryByName({ name: "Old" })).toEqual([]);
    expect(await Categorizing._getItems({ category })).toEqual([]);
    expect(await Categorizing._getCategory({ item: a })).toEqual([]);
    // the other category and its membership are untouched
    expect(await Categorizing._getItems({ category: keep.category })).toEqual([
      { item: b },
    ]);
    expect(await Categorizing.deleteCategory({ category })).toHaveProperty(
      "error",
    );
  });

  test("_getCategoryByName and _getAllCategories", async () => {
    const a = ok(
      await Categorizing.createCategory({ name: "one", description: "first" }),
    );
    const b = ok(
      await Categorizing.createCategory({ name: "two", description: "second" }),
    );
    expect(await Categorizing._getCategoryByName({ name: "one" })).toEqual([
      { category: a.category },
    ]);
    expect(await Categorizing._getCategoryByName({ name: "missing" })).toEqual(
      [],
    );
    const all = await Categorizing._getAllCategories();
    expect(all).toHaveLength(2);
    expect(all).toContainEqual({
      category: a.category,
      name: "one",
      description: "first",
    });
    expect(all).toContainEqual({
      category: b.category,
      name: "two",
      description: "second",
    });
  });
});
