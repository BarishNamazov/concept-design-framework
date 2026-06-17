import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { setupApp, type TestApp } from "@utils/app_testing.ts";
import { ForumErrorCode } from "../sdk/error-codes.ts";

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
    email: `${username}@example.com`,
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
    expect(res.error).toBe(ForumErrorCode.INVALID_SESSION);
    expect(res.category).toBeUndefined();
  });

  test("assign rejects an invalid session", async () => {
    const res = await app.send("/categories/assign", {
      session: "nope",
      item: "p1",
      category: "anything",
    });
    expect(res.error).toBe(ForumErrorCode.INVALID_SESSION);
    expect(res.item).toBeUndefined();
  });

  test("unassign rejects an invalid session", async () => {
    const res = await app.send("/categories/unassign", {
      session: "nope",
      item: "p1",
    });
    expect(res.error).toBe(ForumErrorCode.INVALID_SESSION);
    expect(res.item).toBeUndefined();
  });

  test("delete rejects an invalid session", async () => {
    const res = await app.send("/categories/delete", {
      session: "nope",
      category: "anything",
    });
    expect(res.error).toBe(ForumErrorCode.INVALID_SESSION);
    expect(res.category).toBeUndefined();
  });
});

/** Bootstrap a forum administrator (holds both `administer` and `moderate`). */
async function establishAdmin(
  username: string,
): Promise<{ user: string; session: string }> {
  const admin = await registerAndLogin(username);
  await app.send("/roles/define", {
    session: admin.session,
    name: "administrator",
    capabilities: ["administer", "moderate"],
  });
  await app.send("/roles/grant", {
    session: admin.session,
    user: admin.user,
    context: "forum",
    role: "administrator",
  });
  return admin;
}

describe("category authorization", () => {
  test("once the forum has an admin, members cannot create or delete categories", async () => {
    const admin = await establishAdmin("cat_admin");
    const member = await registerAndLogin("cat_member");

    const create = await app.send("/categories/create", {
      session: member.session,
      name: "General",
      description: "General discussion",
    });
    expect(create.error).toBe(ForumErrorCode.FORBIDDEN);
    expect(create.category).toBeUndefined();

    // An admin can still create, and a member cannot delete it.
    const created = await app.send("/categories/create", {
      session: admin.session,
      name: "General",
      description: "General discussion",
    });
    const del = await app.send("/categories/delete", {
      session: member.session,
      category: created.category,
    });
    expect(del.error).toBe(ForumErrorCode.FORBIDDEN);

    const list = await app.send("/categories/list", {});
    expect(list.categories).toHaveLength(1);
  });

  test("assigning items requires moderate; an ordinary member is rejected", async () => {
    const admin = await establishAdmin("cat_admin2");
    const member = await registerAndLogin("cat_member2");
    const { category } = await app.send("/categories/create", {
      session: admin.session,
      name: "General",
      description: "General discussion",
    });

    const assign = await app.send("/categories/assign", {
      session: member.session,
      item: "p1",
      category,
    });
    expect(assign.error).toBe(ForumErrorCode.FORBIDDEN);

    const unassign = await app.send("/categories/unassign", {
      session: member.session,
      item: "p1",
    });
    expect(unassign.error).toBe(ForumErrorCode.FORBIDDEN);

    const items = await app.send("/categories/items", { category });
    expect(items.items).toEqual([]);
  });

  test("a forum moderator can assign and unassign items", async () => {
    const admin = await establishAdmin("cat_admin3");
    const mod = await registerAndLogin("cat_mod");
    await app.send("/roles/define", {
      session: admin.session,
      name: "moderator",
      capabilities: ["moderate"],
    });
    await app.send("/roles/grant", {
      session: admin.session,
      user: mod.user,
      context: "forum",
      role: "moderator",
    });
    const { category } = await app.send("/categories/create", {
      session: admin.session,
      name: "General",
      description: "General discussion",
    });

    const assigned = await app.send("/categories/assign", {
      session: mod.session,
      item: "p1",
      category,
    });
    expect(assigned.item).toBe("p1");

    const unassigned = await app.send("/categories/unassign", {
      session: mod.session,
      item: "p1",
    });
    expect(unassigned.item).toBe("p1");
  });

  test("forItem returns categories for a given item", async () => {
    const { session } = await registerAndLogin("cat_alice");

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

    const result = await app.send("/categories/forItem", { item: "p1" });
    expect(result.category).toBeDefined();
    expect(result.category).toHaveLength(1);
    expect(result.category[0].category).toBe(category);
    expect(result.category[0].name).toBe("General");
    expect(result.category[0].description).toBe("General discussion");
  });

  test("forItem returns empty array for unassigned item", async () => {
    const result = await app.send("/categories/forItem", {
      item: "nonexistent",
    });
    expect(result.category).toBeDefined();
    expect(result.category).toHaveLength(0);
  });
});
