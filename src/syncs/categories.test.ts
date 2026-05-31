import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { setupApp, type TestApp } from "@utils/app_testing.ts";

let app: TestApp;

beforeEach(async () => {
  if (!app) app = await setupApp();
  await app.reset();
});

afterAll(async () => {
  await app?.stop();
});

async function registerAndLogin(
  username: string,
  displayName = username,
): Promise<{ user: string; session: string }> {
  const { user } = await app.send("/auth/register", {
    username,
    password: "pw",
    displayName,
  });
  const { session } = await app.send("/auth/login", {
    username,
    password: "pw",
  });
  return { user, session };
}

describe("category synchronizations", () => {
  test("create a category and list includes it", async () => {
    const { session } = await registerAndLogin("c_alice");

    const created = await app.send("/categories/create", {
      session,
      name: "General",
      description: "General discussion",
    });
    expect(created.category).toBeDefined();
    expect(created.error).toBeUndefined();

    const list = await app.send("/categories/list", {});
    expect(list.categories).toEqual([
      {
        category: created.category,
        name: "General",
        description: "General discussion",
      },
    ]);
  });

  test("creating a category with a duplicate name errors", async () => {
    const { session } = await registerAndLogin("c_dup");
    await app.send("/categories/create", {
      session,
      name: "General",
      description: "General discussion",
    });
    const dup = await app.send("/categories/create", {
      session,
      name: "General",
      description: "Another one",
    });
    expect(dup.error).toBeDefined();
    expect(dup.category).toBeUndefined();
  });

  test("assign an item to a category, forItem and items reflect it", async () => {
    const { session } = await registerAndLogin("c_assign");
    const { category } = await app.send("/categories/create", {
      session,
      name: "General",
      description: "General discussion",
    });

    const assigned = await app.send("/categories/assign", {
      session,
      item: "p1",
      category,
    });
    expect(assigned.item).toBe("p1");

    const forItem = await app.send("/categories/forItem", { item: "p1" });
    expect(forItem.category).toHaveLength(1);
    expect(forItem.category[0].category).toBe(category);
    expect(forItem.category[0].name).toBe("General");

    const items = await app.send("/categories/items", { category });
    expect(items.items).toEqual([{ item: "p1" }]);
  });

  test("reassigning an item replaces its previous home", async () => {
    const { session } = await registerAndLogin("c_reassign");
    const first = await app.send("/categories/create", {
      session,
      name: "General",
      description: "General discussion",
    });
    const second = await app.send("/categories/create", {
      session,
      name: "Logistics",
      description: "Logistics talk",
    });

    await app.send("/categories/assign", {
      session,
      item: "p1",
      category: first.category,
    });
    await app.send("/categories/assign", {
      session,
      item: "p1",
      category: second.category,
    });

    const forItem = await app.send("/categories/forItem", { item: "p1" });
    expect(forItem.category).toHaveLength(1);
    expect(forItem.category[0].category).toBe(second.category);
    expect(forItem.category[0].name).toBe("Logistics");

    const oldItems = await app.send("/categories/items", {
      category: first.category,
    });
    expect(oldItems.items).toEqual([]);

    const newItems = await app.send("/categories/items", {
      category: second.category,
    });
    expect(newItems.items).toEqual([{ item: "p1" }]);
  });

  test("unassign removes the item's home; forItem returns an empty array", async () => {
    const { session } = await registerAndLogin("c_unassign");
    const { category } = await app.send("/categories/create", {
      session,
      name: "General",
      description: "General discussion",
    });
    await app.send("/categories/assign", {
      session,
      item: "p1",
      category,
    });

    const unassigned = await app.send("/categories/unassign", {
      session,
      item: "p1",
    });
    expect(unassigned.item).toBe("p1");

    const forItem = await app.send("/categories/forItem", { item: "p1" });
    expect(forItem.category).toEqual([]);
  });

  test("assigning to a non-existent category errors", async () => {
    const { session } = await registerAndLogin("c_missing");
    const res = await app.send("/categories/assign", {
      session,
      item: "p1",
      category: "does-not-exist",
    });
    expect(res.error).toBeDefined();
    expect(res.item).toBeUndefined();
  });

  test("delete removes the category from the list", async () => {
    const { session } = await registerAndLogin("c_delete");
    const { category } = await app.send("/categories/create", {
      session,
      name: "General",
      description: "General discussion",
    });

    const deleted = await app.send("/categories/delete", {
      session,
      category,
    });
    expect(deleted.category).toBe(category);

    const list = await app.send("/categories/list", {});
    expect(list.categories).toEqual([]);
  });

  test("create rejects an invalid session", async () => {
    const res = await app.send("/categories/create", {
      session: "nope",
      name: "General",
      description: "General discussion",
    });
    expect(res.error).toBe("Invalid or expired session.");
    expect(res.category).toBeUndefined();
  });

  test("assign rejects an invalid session", async () => {
    const res = await app.send("/categories/assign", {
      session: "nope",
      item: "p1",
      category: "anything",
    });
    expect(res.error).toBe("Invalid or expired session.");
    expect(res.item).toBeUndefined();
  });

  test("unassign rejects an invalid session", async () => {
    const res = await app.send("/categories/unassign", {
      session: "nope",
      item: "p1",
    });
    expect(res.error).toBe("Invalid or expired session.");
    expect(res.item).toBeUndefined();
  });

  test("delete rejects an invalid session", async () => {
    const res = await app.send("/categories/delete", {
      session: "nope",
      category: "anything",
    });
    expect(res.error).toBe("Invalid or expired session.");
    expect(res.category).toBeUndefined();
  });
});
