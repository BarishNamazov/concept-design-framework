import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { setupTestDb } from "@utils/testing.ts";
import TaggingConcept from "./TaggingConcept.ts";
import type { ID } from "@utils/types.ts";

const mongo = await setupTestDb();
const Tagging = new TaggingConcept(mongo.db);

afterAll(() => mongo.stop());

beforeEach(async () => {
  await mongo.db.collection("Tagging.tags").deleteMany({});
  await mongo.db.collection("Tagging.targets").deleteMany({});
});

/** Narrow a result union to its success branch, failing the test otherwise. */
function ok<T>(result: T | { error: string }): T {
  if (result && typeof result === "object" && "error" in result) {
    throw new Error(`Expected success but got error: ${result.error}`);
  }
  return result as T;
}

const target = (s: string) => s as ID;

describe("Tagging", () => {
  test("principle: a tag applied to several targets is retrievable together", async () => {
    const { tag } = ok(await Tagging.createTag({ name: "news" }));
    const t1 = target("a1");
    const t2 = target("a2");
    ok(await Tagging.addTag({ target: t1, tag }));
    ok(await Tagging.addTag({ target: t2, tag }));
    const targets = await Tagging._getTargets({ tag });
    expect(targets).toHaveLength(2);
    expect(targets).toContainEqual({ target: t1 });
    expect(targets).toContainEqual({ target: t2 });
    // removing the tag from one target drops it from the result
    ok(await Tagging.removeTag({ target: t1, tag }));
    expect(await Tagging._getTargets({ tag })).toEqual([{ target: t2 }]);
  });

  test("createTag requires a unique name", async () => {
    ok(await Tagging.createTag({ name: "tech" }));
    expect(await Tagging.createTag({ name: "tech" })).toHaveProperty("error");
  });

  test("addTag requires an existing tag, not already applied", async () => {
    const t = target("a3");
    expect(
      await Tagging.addTag({ target: t, tag: target("ghost") }),
    ).toHaveProperty("error");
    const { tag } = ok(await Tagging.createTag({ name: "fun" }));
    ok(await Tagging.addTag({ target: t, tag }));
    expect(await Tagging.addTag({ target: t, tag })).toHaveProperty("error");
  });

  test("removeTag requires the tag to be applied; clears empty targets", async () => {
    const t = target("a4");
    const { tag } = ok(await Tagging.createTag({ name: "x" }));
    expect(await Tagging.removeTag({ target: t, tag })).toHaveProperty(
      "error",
    );
    ok(await Tagging.addTag({ target: t, tag }));
    ok(await Tagging.removeTag({ target: t, tag }));
    expect(await Tagging._getTags({ target: t })).toEqual([]);
    expect(await Tagging._getTargets({ tag })).toEqual([]);
  });

  test("_getTags returns all tags on a target", async () => {
    const t = target("a5");
    const a = ok(await Tagging.createTag({ name: "alpha" }));
    const b = ok(await Tagging.createTag({ name: "beta" }));
    ok(await Tagging.addTag({ target: t, tag: a.tag }));
    ok(await Tagging.addTag({ target: t, tag: b.tag }));
    const tags = await Tagging._getTags({ target: t });
    expect(tags).toHaveLength(2);
    expect(tags).toContainEqual({ tag: a.tag, name: "alpha" });
    expect(tags).toContainEqual({ tag: b.tag, name: "beta" });
  });

  test("deleteTag removes the tag from all targets and from state", async () => {
    const t1 = target("a6");
    const t2 = target("a7");
    const { tag } = ok(await Tagging.createTag({ name: "del" }));
    const other = ok(await Tagging.createTag({ name: "keep" }));
    ok(await Tagging.addTag({ target: t1, tag }));
    ok(await Tagging.addTag({ target: t2, tag }));
    ok(await Tagging.addTag({ target: t1, tag: other.tag }));
    ok(await Tagging.deleteTag({ tag }));
    expect(await Tagging._getTargets({ tag })).toEqual([]);
    expect(await Tagging._getTagByName({ name: "del" })).toEqual([]);
    // t1 still kept via the other tag; t2 dropped entirely
    expect(await Tagging._getTags({ target: t1 })).toEqual([
      { tag: other.tag, name: "keep" },
    ]);
    expect(await Tagging._getTags({ target: t2 })).toEqual([]);
    expect(await Tagging.deleteTag({ tag })).toHaveProperty("error");
  });

  test("_getTagByName and _getAllTags", async () => {
    const a = ok(await Tagging.createTag({ name: "one" }));
    const b = ok(await Tagging.createTag({ name: "two" }));
    expect(await Tagging._getTagByName({ name: "one" })).toEqual([
      { tag: a.tag },
    ]);
    expect(await Tagging._getTagByName({ name: "missing" })).toEqual([]);
    const all = await Tagging._getAllTags();
    expect(all).toHaveLength(2);
    expect(all).toContainEqual({ tag: a.tag, name: "one" });
    expect(all).toContainEqual({ tag: b.tag, name: "two" });
  });
});
