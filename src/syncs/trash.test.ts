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

describe("trash synchronizations", () => {
  test("trash removes an item and reflects in isTrashed and list", async () => {
    const { user, session } = await registerAndLogin("trash_alice");

    const res = await app.send("/trash/trash", { session, item: "x1" });
    expect(res).toEqual({ item: "x1" });

    const isTrashed = await app.send("/trash/isTrashed", { item: "x1" });
    expect(isTrashed.trashed).toBe(true);

    const list = await app.send("/trash/list", {});
    const entry = list.trashed.find(($: { item: string }) => $.item === "x1");
    expect(entry).toBeDefined();
    expect(entry.trashedBy).toBe(user);
  });

  test("trashing an already trashed item errors", async () => {
    const { session } = await registerAndLogin("trash_bob");
    await app.send("/trash/trash", { session, item: "x1" });

    const dup = await app.send("/trash/trash", { session, item: "x1" });
    expect(dup.error).toBeDefined();
    expect(dup.item).toBeUndefined();
  });

  test("restore brings an item back", async () => {
    const { session } = await registerAndLogin("trash_carol");
    await app.send("/trash/trash", { session, item: "x1" });

    const res = await app.send("/trash/restore", { session, item: "x1" });
    expect(res).toEqual({ item: "x1" });

    const isTrashed = await app.send("/trash/isTrashed", { item: "x1" });
    expect(isTrashed.trashed).toBe(false);

    const list = await app.send("/trash/list", {});
    expect(list.trashed).toEqual([]);
  });

  test("restoring an item that is not trashed errors", async () => {
    const { session } = await registerAndLogin("trash_dave");

    const res = await app.send("/trash/restore", { session, item: "x1" });
    expect(res.error).toBeDefined();
    expect(res.item).toBeUndefined();
  });

  test("purge permanently removes a trashed item", async () => {
    const { session } = await registerAndLogin("trash_erin");
    await app.send("/trash/trash", { session, item: "x1" });

    const res = await app.send("/trash/purge", { session, item: "x1" });
    expect(res).toEqual({ item: "x1" });

    const isTrashed = await app.send("/trash/isTrashed", { item: "x1" });
    expect(isTrashed.trashed).toBe(false);

    const list = await app.send("/trash/list", {});
    expect(list.trashed).toEqual([]);
  });

  test("purging an item that is not trashed errors", async () => {
    const { session } = await registerAndLogin("trash_frank");

    const res = await app.send("/trash/purge", { session, item: "x1" });
    expect(res.error).toBeDefined();
    expect(res.item).toBeUndefined();
  });

  test("trash with an invalid session errors", async () => {
    const res = await app.send("/trash/trash", {
      session: "nope",
      item: "x1",
    });
    expect(res.error).toBe("Invalid or expired session.");
  });

  test("restore with an invalid session errors", async () => {
    const res = await app.send("/trash/restore", {
      session: "nope",
      item: "x1",
    });
    expect(res.error).toBe("Invalid or expired session.");
  });

  test("purge with an invalid session errors", async () => {
    const res = await app.send("/trash/purge", {
      session: "nope",
      item: "x1",
    });
    expect(res.error).toBe("Invalid or expired session.");
  });
});
