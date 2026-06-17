import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { setupTestDb } from "@utils/testing.ts";
import type { ID } from "@utils/types.ts";
import type { ForumErrorCode } from "../../sdk/error-codes.ts";
import ProfilingConcept from "./ProfilingConcept.ts";

const mongo = await setupTestDb();
const Profiling = new ProfilingConcept(mongo.db);

afterAll(() => mongo.stop());

beforeEach(async () => {
  await mongo.db.collection("Profiling.profiles").deleteMany({});
});

/** Narrow a result union to its success branch, failing the test otherwise. */
function ok<T>(result: T | { error: ForumErrorCode; detail?: string }): T {
  if (result && typeof result === "object" && "error" in result) {
    throw new Error(`Expected success but got error: ${String(result.error)}`);
  }
  return result as T;
}

const userA = "user:Alice" as ID;
const userB = "user:Bob" as ID;

describe("Profiling", () => {
  test("principle: create a profile, viewers see it, edits are reflected", async () => {
    ok(await Profiling.createProfile({ user: userA, displayName: "Alice" }));
    expect(await Profiling._getProfile({ user: userA })).toEqual([
      { profile: { displayName: "Alice", bio: "", avatar: "" } },
    ]);

    ok(await Profiling.setBio({ user: userA, bio: "hi there" }));
    ok(await Profiling.setAvatar({ user: userA, avatar: "a.png" }));
    ok(await Profiling.setDisplayName({ user: userA, displayName: "Ali" }));
    expect(await Profiling._getProfile({ user: userA })).toEqual([
      { profile: { displayName: "Ali", bio: "hi there", avatar: "a.png" } },
    ]);
  });

  test("createProfile requires no existing profile", async () => {
    ok(await Profiling.createProfile({ user: userA, displayName: "Alice" }));
    expect(
      await Profiling.createProfile({ user: userA, displayName: "Again" }),
    ).toHaveProperty("error");
  });

  test("setters require an existing profile", async () => {
    expect(
      await Profiling.setDisplayName({ user: userB, displayName: "x" }),
    ).toHaveProperty("error");
    expect(await Profiling.setBio({ user: userB, bio: "x" })).toHaveProperty(
      "error",
    );
    expect(
      await Profiling.setAvatar({ user: userB, avatar: "x" }),
    ).toHaveProperty("error");
  });

  test("deleteProfile removes the profile and requires it to exist", async () => {
    ok(await Profiling.createProfile({ user: userA, displayName: "Alice" }));
    ok(await Profiling.deleteProfile({ user: userA }));
    expect(await Profiling._getProfile({ user: userA })).toEqual([]);
    expect(await Profiling.deleteProfile({ user: userA })).toHaveProperty(
      "error",
    );
  });

  test("_getDisplayName returns the current display name", async () => {
    ok(await Profiling.createProfile({ user: userA, displayName: "Alice" }));
    expect(await Profiling._getDisplayName({ user: userA })).toEqual([
      { displayName: "Alice" },
    ]);
    expect(await Profiling._getDisplayName({ user: userB })).toEqual([]);
  });

  test("_getByDisplayName returns all matching users", async () => {
    ok(await Profiling.createProfile({ user: userA, displayName: "Sam" }));
    ok(await Profiling.createProfile({ user: userB, displayName: "Sam" }));
    const result = await Profiling._getByDisplayName({ displayName: "Sam" });
    expect(result.map((r) => r.user).sort()).toEqual([userA, userB].sort());
    expect(await Profiling._getByDisplayName({ displayName: "None" })).toEqual(
      [],
    );
  });
});
