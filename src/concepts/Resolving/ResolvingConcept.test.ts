import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { setupTestDb } from "@utils/testing.ts";
import type { ID } from "@utils/types.ts";
import type { ForumErrorCode } from "../../sdk/error-codes.ts";
import ResolvingConcept from "./ResolvingConcept.ts";

const mongo = await setupTestDb();
const Resolving = new ResolvingConcept(mongo.db);

afterAll(() => mongo.stop());

beforeEach(async () => {
  await mongo.db.collection("Resolving.resolutions").deleteMany({});
});

/** Narrow a result union to its success branch, failing the test otherwise. */
function ok<T>(result: T | { error: ForumErrorCode; detail?: string }): T {
  if (result && typeof result === "object" && "error" in result) {
    throw new Error(`Expected success but got error: ${result.error}`);
  }
  return result as T;
}

const question = (s: string) => s as ID;
const answer = (s: string) => s as ID;
const user = (s: string) => s as ID;

describe("Resolving", () => {
  test("principle: accepting an answer resolves the question and surfaces it", async () => {
    const q = question("q1");
    const a = answer("reply1");
    const by = user("asker");
    // before any acceptance the question is unresolved
    expect(await Resolving._isResolved({ question: q })).toEqual([
      { resolved: false },
    ]);
    expect(await Resolving._getAnswer({ question: q })).toEqual([]);
    // accepting a reply marks the question resolved and surfaces that reply
    const { resolution } = ok(
      await Resolving.accept({ question: q, answer: a, by }),
    );
    expect(resolution).toBe(q);
    expect(await Resolving._isResolved({ question: q })).toEqual([
      { resolved: true },
    ]);
    expect(await Resolving._getAnswer({ question: q })).toEqual([
      { answer: a },
    ]);
  });

  test("accepting again with a different answer moves the mark", async () => {
    const q = question("q2");
    const first = answer("replyA");
    const second = answer("replyB");
    const by = user("asker");
    ok(await Resolving.accept({ question: q, answer: first, by }));
    ok(await Resolving.accept({ question: q, answer: second, by }));
    // only the latest answer remains the accepted one
    expect(await Resolving._getAnswer({ question: q })).toEqual([
      { answer: second },
    ]);
    expect(await Resolving._isResolved({ question: q })).toEqual([
      { resolved: true },
    ]);
  });

  test("clearing a resolution makes the question unresolved again", async () => {
    const q = question("q3");
    const a = answer("reply");
    const by = user("staff");
    ok(await Resolving.accept({ question: q, answer: a, by }));
    const cleared = ok(await Resolving.clear({ question: q }));
    expect(cleared.question).toBe(q);
    expect(await Resolving._isResolved({ question: q })).toEqual([
      { resolved: false },
    ]);
    expect(await Resolving._getAnswer({ question: q })).toEqual([]);
  });

  test("clear requires an existing resolution", async () => {
    expect(
      await Resolving.clear({ question: question("ghost") }),
    ).toHaveProperty("error");
  });

  test("_getResolution returns the answer, resolver and time", async () => {
    const q = question("q4");
    const a = answer("reply");
    const by = user("moderator");
    const before = Date.now();
    ok(await Resolving.accept({ question: q, answer: a, by }));
    const after = Date.now();
    const rows = await Resolving._getResolution({ question: q });
    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row.answer).toBe(a);
    expect(row.resolvedBy).toBe(by);
    expect(row.resolvedAt).toBeInstanceOf(Date);
    expect(row.resolvedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(row.resolvedAt.getTime()).toBeLessThanOrEqual(after);
  });

  test("_getResolution is empty for an unresolved question", async () => {
    expect(
      await Resolving._getResolution({ question: question("none") }),
    ).toEqual([]);
  });

  test("resolutions are independent across questions", async () => {
    const q1 = question("q5");
    const q2 = question("q6");
    ok(
      await Resolving.accept({
        question: q1,
        answer: answer("a1"),
        by: user("u1"),
      }),
    );
    expect(await Resolving._isResolved({ question: q1 })).toEqual([
      { resolved: true },
    ]);
    expect(await Resolving._isResolved({ question: q2 })).toEqual([
      { resolved: false },
    ]);
  });

  test("namespaces isolate duplicate concept instances", async () => {
    const Forum = new ResolvingConcept(mongo.db, "Forum");
    const Helpdesk = new ResolvingConcept(mongo.db, "Helpdesk");
    const q = question("shared");

    ok(
      await Forum.accept({
        question: q,
        answer: answer("forumReply"),
        by: user("u1"),
      }),
    );

    expect(await Forum._isResolved({ question: q })).toEqual([
      { resolved: true },
    ]);
    expect(await Helpdesk._isResolved({ question: q })).toEqual([
      { resolved: false },
    ]);
    expect(await Resolving._isResolved({ question: q })).toEqual([
      { resolved: false },
    ]);
  });
});
