import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { setupTestDb } from "@utils/testing.ts";
import type { ID } from "@utils/types.ts";
import ConversingConcept from "./ConversingConcept.ts";

const mongo = await setupTestDb();
const Conversing = new ConversingConcept(mongo.db);

afterAll(() => mongo.stop());

beforeEach(async () => {
  await mongo.db.collection("Conversing.conversations").deleteMany({});
  await mongo.db.collection("Conversing.nodes").deleteMany({});
});

/** Narrow a result union to its success branch, failing the test otherwise. */
function ok<T>(result: T | { error: string }): T {
  if (result && typeof result === "object" && "error" in result) {
    throw new Error(`Expected success but got error: ${result.error}`);
  }
  return result as T;
}

const item = (s: string) => s as ID;

describe("Conversing", () => {
  test("principle: thread, replies, and ancestors follow the conversation tree", async () => {
    const root = ok(await Conversing.start({ item: item("i-root") }));
    const r1 = ok(
      await Conversing.reply({ item: item("i-1"), parent: root.node }),
    );
    const r2 = ok(
      await Conversing.reply({ item: item("i-2"), parent: root.node }),
    );
    const r11 = ok(
      await Conversing.reply({ item: item("i-1-1"), parent: r1.node }),
    );

    // reading the conversation yields all items in createdAt order
    const thread = await Conversing._getThread({
      conversation: root.conversation,
    });
    expect(thread.map((n) => n.node)).toEqual([
      root.node,
      r1.node,
      r2.node,
      r11.node,
    ]);
    expect(thread[0]).toEqual({
      node: root.node,
      item: item("i-root"),
      parent: null,
      depth: 0,
    });
    expect(thread[3]).toEqual({
      node: r11.node,
      item: item("i-1-1"),
      parent: r1.node,
      depth: 2,
    });

    // direct replies of the root, in order
    expect(await Conversing._getReplies({ node: root.node })).toEqual([
      { reply: r1.node },
      { reply: r2.node },
    ]);

    // ancestors of a deep node, nearest first up to the root
    expect(await Conversing._getAncestors({ node: r11.node })).toEqual([
      { ancestor: r1.node },
      { ancestor: root.node },
    ]);
  });

  test("start requires the item to be unplaced", async () => {
    ok(await Conversing.start({ item: item("dup") }));
    expect(await Conversing.start({ item: item("dup") })).toHaveProperty(
      "error",
    );
  });

  test("reply requires an existing parent and an unplaced item", async () => {
    const root = ok(await Conversing.start({ item: item("p-root") }));
    expect(
      await Conversing.reply({ item: item("p-x"), parent: item("ghost") }),
    ).toHaveProperty("error");
    ok(await Conversing.reply({ item: item("p-1"), parent: root.node }));
    // item already placed elsewhere cannot reply
    expect(
      await Conversing.reply({ item: item("p-root"), parent: root.node }),
    ).toHaveProperty("error");
  });

  test("reply sets the same conversation and incremented depth", async () => {
    const root = ok(await Conversing.start({ item: item("c-root") }));
    const child = ok(
      await Conversing.reply({ item: item("c-1"), parent: root.node }),
    );
    expect(await Conversing._getConversation({ node: child.node })).toEqual([
      { conversation: root.conversation },
    ]);
    const thread = await Conversing._getThread({
      conversation: root.conversation,
    });
    expect(thread.find((n) => n.node === child.node)?.depth).toBe(1);
  });

  test("remove requires the node to exist and have no children", async () => {
    const root = ok(await Conversing.start({ item: item("rm-root") }));
    const child = ok(
      await Conversing.reply({ item: item("rm-1"), parent: root.node }),
    );
    expect(await Conversing.remove({ node: item("ghost") })).toHaveProperty(
      "error",
    );
    // cannot remove the root while it has a child
    expect(await Conversing.remove({ node: root.node })).toHaveProperty(
      "error",
    );
    // removing a leaf works
    ok(await Conversing.remove({ node: child.node }));
    expect(await Conversing._getNodeByItem({ item: item("rm-1") })).toEqual([]);
  });

  test("removing the last node removes the conversation", async () => {
    const root = ok(await Conversing.start({ item: item("solo") }));
    ok(await Conversing.remove({ node: root.node }));
    expect(
      await Conversing._getRoot({ conversation: root.conversation }),
    ).toEqual([]);
    expect(
      await Conversing._getThread({ conversation: root.conversation }),
    ).toEqual([]);
  });

  test("queries: node lookups by item, item by node, root, parent", async () => {
    const root = ok(await Conversing.start({ item: item("q-root") }));
    const child = ok(
      await Conversing.reply({ item: item("q-1"), parent: root.node }),
    );
    expect(await Conversing._getNodeByItem({ item: item("q-root") })).toEqual([
      { node: root.node },
    ]);
    expect(await Conversing._getItem({ node: child.node })).toEqual([
      { item: item("q-1") },
    ]);
    expect(
      await Conversing._getRoot({ conversation: root.conversation }),
    ).toEqual([{ node: root.node }]);
    expect(await Conversing._getParent({ node: child.node })).toEqual([
      { parent: root.node },
    ]);
    // root has no parent
    expect(await Conversing._getParent({ node: root.node })).toEqual([]);
    expect(await Conversing._getAncestors({ node: root.node })).toEqual([]);
  });

  test("start sets lastActivityAt equal to createdAt", async () => {
    const root = ok(await Conversing.start({ item: item("la-root") }));
    const convos = await Conversing._getConversations();
    const convo = convos.find((c) => c.conversation === root.conversation);
    expect(convo).toBeDefined();
    expect(convo?.lastActivityAt).toEqual(convo?.createdAt);
  });

  test("_getConversations includes lastActivityAt for every row", async () => {
    ok(await Conversing.start({ item: item("la-a") }));
    ok(await Conversing.start({ item: item("la-b") }));
    const convos = await Conversing._getConversations();
    expect(convos.length).toBeGreaterThanOrEqual(2);
    for (const c of convos) {
      expect(c.lastActivityAt).toBeInstanceOf(Date);
    }
  });

  test("a reply bumps lastActivityAt on the conversation", async () => {
    const root = ok(await Conversing.start({ item: item("bump-root") }));
    const before = (await Conversing._getConversations()).find(
      (c) => c.conversation === root.conversation,
    );
    if (!before) throw new Error("expected conversation to exist");
    // Pause so the bump produces a distinct later timestamp.
    await new Promise((r) => setTimeout(r, 10));
    ok(await Conversing.reply({ item: item("bump-1"), parent: root.node }));
    const after = (await Conversing._getConversations()).find(
      (c) => c.conversation === root.conversation,
    );
    if (!after) throw new Error("expected conversation to exist");
    expect(after.lastActivityAt.getTime()).toBeGreaterThan(
      before.lastActivityAt.getTime(),
    );
  });

  test("a deep reply bumps lastActivityAt on the root conversation", async () => {
    const root = ok(await Conversing.start({ item: item("deep-root") }));
    const r1 = ok(
      await Conversing.reply({ item: item("deep-1"), parent: root.node }),
    );
    const before = (await Conversing._getConversations()).find(
      (c) => c.conversation === root.conversation,
    );
    if (!before) throw new Error("expected conversation to exist");
    await new Promise((r) => setTimeout(r, 10));
    ok(await Conversing.reply({ item: item("deep-2"), parent: r1.node }));
    const after = (await Conversing._getConversations()).find(
      (c) => c.conversation === root.conversation,
    );
    if (!after) throw new Error("expected conversation to exist");
    expect(after.lastActivityAt.getTime()).toBeGreaterThan(
      before.lastActivityAt.getTime(),
    );
  });

  test("_getConversationsByLastActivity returns rows sorted by lastActivityAt descending", async () => {
    const a = ok(await Conversing.start({ item: item("sort-a") }));
    const b = ok(await Conversing.start({ item: item("sort-b") }));
    // Reply to a so it becomes the most recently active.
    await new Promise((r) => setTimeout(r, 10));
    ok(await Conversing.reply({ item: item("sort-a-1"), parent: a.node }));
    const byActivity = await Conversing._getConversationsByLastActivity();
    const ids = byActivity.map((c) => c.conversation);
    expect(ids.indexOf(a.conversation)).toBeLessThan(
      ids.indexOf(b.conversation),
    );
  });
});
