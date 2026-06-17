import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { setupTestDb } from "@utils/testing.ts";
import type { ID } from "@utils/types.ts";
import type { ForumErrorCode } from "../../sdk/error-codes.ts";
import ReactingConcept from "./ReactingConcept.ts";

const mongo = await setupTestDb();
const Reacting = new ReactingConcept(mongo.db);

afterAll(() => mongo.stop());

beforeEach(async () => {
  await mongo.db.collection("Reacting.reactions").deleteMany({});
});

/** Narrow a result union to its success branch, failing the test otherwise. */
function ok<T>(result: T | { error: ForumErrorCode; detail?: string }): T {
  if (result && typeof result === "object" && "error" in result) {
    throw new Error(`Expected success but got error: ${result.error}`);
  }
  return result as T;
}

const user = (s: string) => s as ID;
const target = (s: string) => s as ID;

describe("Reacting", () => {
  test("principle: a reaction is recorded once and counts reflect current reactors", async () => {
    const u = user("alice");
    const t = target("post1");
    ok(await Reacting.react({ user: u, target: t, kind: "like" }));
    // reacting again with the same kind has no further effect
    expect(
      await Reacting.react({ user: u, target: t, kind: "like" }),
    ).toHaveProperty("error");
    expect(await Reacting._countByKind({ target: t })).toEqual([
      { kind: "like", count: 1 },
    ]);
    // removing the reaction drops it from the count
    ok(await Reacting.unreact({ user: u, target: t, kind: "like" }));
    expect(await Reacting._countByKind({ target: t })).toEqual([]);
  });

  test("react requires no existing reaction for the triple", async () => {
    const u = user("bob");
    const t = target("post2");
    const { reaction } = ok(
      await Reacting.react({ user: u, target: t, kind: "love" }),
    );
    expect(reaction).toBeString();
    expect(
      await Reacting.react({ user: u, target: t, kind: "love" }),
    ).toHaveProperty("error");
  });

  test("a user may react with different kinds to the same target", async () => {
    const u = user("carol");
    const t = target("post3");
    ok(await Reacting.react({ user: u, target: t, kind: "like" }));
    ok(await Reacting.react({ user: u, target: t, kind: "love" }));
    const counts = await Reacting._countByKind({ target: t });
    expect(counts).toHaveLength(2);
    expect(counts).toContainEqual({ kind: "like", count: 1 });
    expect(counts).toContainEqual({ kind: "love", count: 1 });
  });

  test("unreact requires an existing reaction", async () => {
    const u = user("dave");
    const t = target("post4");
    expect(
      await Reacting.unreact({ user: u, target: t, kind: "like" }),
    ).toHaveProperty("error");
    const { reaction } = ok(
      await Reacting.react({ user: u, target: t, kind: "like" }),
    );
    const removed = ok(
      await Reacting.unreact({ user: u, target: t, kind: "like" }),
    );
    expect(removed.reaction).toBe(reaction);
  });

  test("_countByKind counts distinct users per kind", async () => {
    const t = target("post5");
    ok(await Reacting.react({ user: user("u1"), target: t, kind: "like" }));
    ok(await Reacting.react({ user: user("u2"), target: t, kind: "like" }));
    ok(await Reacting.react({ user: user("u3"), target: t, kind: "wow" }));
    const counts = await Reacting._countByKind({ target: t });
    expect(counts).toContainEqual({ kind: "like", count: 2 });
    expect(counts).toContainEqual({ kind: "wow", count: 1 });
  });

  test("_getReactionsForTarget and _getReactionsByUser", async () => {
    const u = user("erin");
    const t1 = target("p1");
    const t2 = target("p2");
    const r1 = ok(await Reacting.react({ user: u, target: t1, kind: "like" }));
    const r2 = ok(await Reacting.react({ user: u, target: t2, kind: "love" }));
    const byUser = await Reacting._getReactionsByUser({ user: u });
    expect(byUser).toHaveLength(2);
    expect(byUser).toContainEqual({
      reaction: r1.reaction,
      target: t1,
      kind: "like",
    });
    expect(byUser).toContainEqual({
      reaction: r2.reaction,
      target: t2,
      kind: "love",
    });
    const forT1 = await Reacting._getReactionsForTarget({ target: t1 });
    expect(forT1).toEqual([{ reaction: r1.reaction, user: u, kind: "like" }]);
  });

  test("_hasReacted reflects current state", async () => {
    const u = user("frank");
    const t = target("p6");
    expect(
      await Reacting._hasReacted({ user: u, target: t, kind: "like" }),
    ).toEqual([{ hasReacted: false }]);
    ok(await Reacting.react({ user: u, target: t, kind: "like" }));
    expect(
      await Reacting._hasReacted({ user: u, target: t, kind: "like" }),
    ).toEqual([{ hasReacted: true }]);
  });
});
