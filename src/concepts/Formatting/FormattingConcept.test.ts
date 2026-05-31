import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { freshID } from "@utils/database.ts";
import { setupTestDb } from "@utils/testing.ts";
import type { ID } from "@utils/types.ts";
import FormattingConcept from "./FormattingConcept.ts";

const mongo = await setupTestDb();
const Formatting = new FormattingConcept(mongo.db);

afterAll(() => mongo.stop());

beforeEach(async () => {
  await mongo.db.collection("Formatting.targets").deleteMany({});
});

/** Narrow a result union to its success branch, failing the test otherwise. */
function ok<T>(result: T | { error: string }): T {
  if (result && typeof result === "object" && "error" in result) {
    throw new Error(`Expected success but got error: ${result.error}`);
  }
  return result as T;
}

const id = () => freshID() as ID;

describe("Formatting", () => {
  test("principle: setting source renders sanitized HTML, querying returns the cached rendering, updates recompute", async () => {
    const target = id();
    const { rendered } = ok(
      await Formatting.setSource({ target, source: "# Hi" }),
    );
    expect(rendered).toContain("<h1");
    expect(rendered).toContain("Hi");

    const got = await Formatting._getRendered({ target });
    expect(got).toEqual([{ rendered }]);

    ok(await Formatting.setSource({ target, source: "## Bye" }));
    const updated = await Formatting._getRendered({ target });
    expect(updated[0].rendered).toContain("<h2");
    expect(updated[0].rendered).not.toContain("<h1");
  });

  test("sanitization strips scripts and dangerous attributes", async () => {
    const target = id();
    const { rendered } = ok(
      await Formatting.setSource({
        target,
        source: '<script>alert(1)</script><img src="x" onerror="alert(2)">',
      }),
    );
    expect(rendered).not.toContain("<script");
    expect(rendered).not.toContain("onerror");
  });

  test("_getSource returns the raw markdown source", async () => {
    const target = id();
    ok(await Formatting.setSource({ target, source: "**bold**" }));
    expect(await Formatting._getSource({ target })).toEqual([
      { source: "**bold**" },
    ]);
  });

  test("_getDocument returns source, rendered and updatedAt", async () => {
    const target = id();
    const { rendered } = ok(
      await Formatting.setSource({ target, source: "plain" }),
    );
    const docs = await Formatting._getDocument({ target });
    expect(docs).toHaveLength(1);
    expect(docs[0].document.source).toBe("plain");
    expect(docs[0].document.rendered).toBe(rendered);
    expect(docs[0].document.updatedAt).toBeInstanceOf(Date);
  });

  test("clear removes the target; requires it to exist", async () => {
    const target = id();
    ok(await Formatting.setSource({ target, source: "hi" }));
    ok(await Formatting.clear({ target }));
    expect(await Formatting._getRendered({ target })).toEqual([]);
    expect(await Formatting._getSource({ target })).toEqual([]);
    expect(await Formatting.clear({ target })).toHaveProperty("error");
  });

  test("queries on a missing target return empty arrays", async () => {
    const target = id();
    expect(await Formatting._getRendered({ target })).toEqual([]);
    expect(await Formatting._getSource({ target })).toEqual([]);
    expect(await Formatting._getDocument({ target })).toEqual([]);
  });
});
