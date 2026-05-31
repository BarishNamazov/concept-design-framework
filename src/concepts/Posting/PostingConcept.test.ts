import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { setupTestDb } from "@utils/testing.ts";
import type { ID } from "@utils/types.ts";
import PostingConcept from "./PostingConcept.ts";

const mongo = await setupTestDb();
const Posting = new PostingConcept(mongo.db);

afterAll(() => mongo.stop());

beforeEach(async () => {
  await mongo.db.collection("Posting.posts").deleteMany({});
});

/** Narrow a result union to its success branch, failing the test otherwise. */
function ok<T>(result: T | { error: string }): T {
  if (result && typeof result === "object" && "error" in result) {
    throw new Error(`Expected success but got error: ${result.error}`);
  }
  return result as T;
}

const authorA = "author:Alice" as ID;
const authorB = "author:Bob" as ID;

describe("Posting", () => {
  test("principle: create, read back, edit reflects, delete removes", async () => {
    const { post } = await Posting.create({
      author: authorA,
      content: "hello",
    });
    expect(await Posting._getContent({ post })).toEqual([{ content: "hello" }]);
    expect(await Posting._getAuthor({ post })).toEqual([{ author: authorA }]);

    ok(await Posting.edit({ post, content: "edited" }));
    expect(await Posting._getContent({ post })).toEqual([
      { content: "edited" },
    ]);

    ok(await Posting.delete({ post }));
    expect(await Posting._exists({ post })).toEqual([{ exists: false }]);
    expect(await Posting._getContent({ post })).toEqual([]);
  });

  test("create leaves editedAt unset", async () => {
    const { post } = await Posting.create({
      author: authorA,
      content: "fresh",
    });
    const [record] = await Posting._getPost({ post });
    expect(record.post.author).toBe(authorA);
    expect(record.post.content).toBe("fresh");
    expect(record.post.createdAt).toBeInstanceOf(Date);
    expect(record.post.editedAt).toBeNull();
  });

  test("edit sets editedAt and requires an existing post", async () => {
    expect(
      await Posting.edit({ post: "ghost" as ID, content: "x" }),
    ).toHaveProperty("error");

    const { post } = await Posting.create({
      author: authorA,
      content: "v1",
    });
    ok(await Posting.edit({ post, content: "v2" }));
    const [record] = await Posting._getPost({ post });
    expect(record.post.editedAt).toBeInstanceOf(Date);
  });

  test("delete requires an existing post", async () => {
    expect(await Posting.delete({ post: "ghost" as ID })).toHaveProperty(
      "error",
    );
  });

  test("_getByAuthor returns every post by that author", async () => {
    const p1 = await Posting.create({ author: authorA, content: "a" });
    const p2 = await Posting.create({ author: authorA, content: "b" });
    await Posting.create({ author: authorB, content: "c" });

    const result = await Posting._getByAuthor({ author: authorA });
    expect(result.map((r) => r.post).sort()).toEqual([p1.post, p2.post].sort());
    expect(await Posting._getByAuthor({ author: "nobody" as ID })).toEqual([]);
  });

  test("_exists reflects presence", async () => {
    const { post } = await Posting.create({ author: authorA, content: "x" });
    expect(await Posting._exists({ post })).toEqual([{ exists: true }]);
    expect(await Posting._exists({ post: "ghost" as ID })).toEqual([
      { exists: false },
    ]);
  });
});
