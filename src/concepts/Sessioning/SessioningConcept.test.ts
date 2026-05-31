import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { setupTestDb } from "@utils/testing.ts";
import type { ID } from "@utils/types.ts";
import SessioningConcept from "./SessioningConcept.ts";

const mongo = await setupTestDb();
const Sessioning = new SessioningConcept(mongo.db);

afterAll(() => mongo.stop());

beforeEach(async () => {
  await mongo.db.collection("Sessioning.sessions").deleteMany({});
});

/** Narrow a result union to its success branch, failing the test otherwise. */
function ok<T>(result: T | { error: string }): T {
  if (result && typeof result === "object" && "error" in result) {
    throw new Error(`Expected success but got error: ${result.error}`);
  }
  return result as T;
}

const userA = "user:Alice" as ID;
const userB = "user:Bob" as ID;

const sessions = mongo.db.collection<{
  _id: ID;
  user: ID;
  createdAt: Date;
  expiresAt?: Date;
}>("Sessioning.sessions");

/** Insert a session that has already expired, to simulate elapsed time. */
function insertExpired(id: string, user: ID) {
  return sessions.insertOne({
    _id: id as ID,
    user,
    createdAt: new Date(Date.now() - 10_000),
    expiresAt: new Date(Date.now() - 1000),
  });
}

describe("Sessioning", () => {
  test("principle: an active session identifies its user, ending it stops that", async () => {
    const { session } = await Sessioning.start({ user: userA });
    expect(await Sessioning._getUser({ session })).toEqual([{ user: userA }]);
    expect(await Sessioning._isActive({ session })).toEqual([{ active: true }]);

    ok(await Sessioning.end({ session }));
    expect(await Sessioning._getUser({ session })).toEqual([]);
    expect(await Sessioning._isActive({ session })).toEqual([
      { active: false },
    ]);
  });

  test("start creates an active session with no expiry", async () => {
    const { session } = await Sessioning.start({ user: userA });
    expect(await Sessioning._isActive({ session })).toEqual([{ active: true }]);
  });

  test("startWithExpiry requires a future expiry", async () => {
    const past = new Date(Date.now() - 1000);
    expect(
      await Sessioning.startWithExpiry({ user: userA, expiresAt: past }),
    ).toHaveProperty("error");

    const future = new Date(Date.now() + 60_000);
    const { session } = ok(
      await Sessioning.startWithExpiry({ user: userA, expiresAt: future }),
    );
    expect(await Sessioning._isActive({ session })).toEqual([{ active: true }]);
  });

  test("a session past its expiry is not active and yields no user", async () => {
    // Insert directly with a past expiry to simulate an expired session.
    const expired = "session:expired" as ID;
    await insertExpired(expired, userA);
    expect(await Sessioning._isActive({ session: expired })).toEqual([
      { active: false },
    ]);
    expect(await Sessioning._getUser({ session: expired })).toEqual([]);
  });

  test("end requires an existing session", async () => {
    expect(await Sessioning.end({ session: "nope" as ID })).toHaveProperty(
      "error",
    );
  });

  test("endAllForUser removes only that user's sessions", async () => {
    const a1 = await Sessioning.start({ user: userA });
    const a2 = await Sessioning.start({ user: userA });
    const b1 = await Sessioning.start({ user: userB });

    expect(await Sessioning.endAllForUser({ user: userA })).toEqual({
      user: userA,
    });
    expect(await Sessioning._isActive({ session: a1.session })).toEqual([
      { active: false },
    ]);
    expect(await Sessioning._isActive({ session: a2.session })).toEqual([
      { active: false },
    ]);
    expect(await Sessioning._isActive({ session: b1.session })).toEqual([
      { active: true },
    ]);
  });

  test("expire requires an expired session and then removes it", async () => {
    const active = await Sessioning.start({ user: userA });
    expect(await Sessioning.expire({ session: active.session })).toHaveProperty(
      "error",
    );

    const expired = "session:exp" as ID;
    await insertExpired(expired, userA);
    expect(ok(await Sessioning.expire({ session: expired }))).toEqual({
      session: expired,
    });
    expect(await Sessioning._isActive({ session: expired })).toEqual([
      { active: false },
    ]);
  });

  test("_getSessionsForUser returns only active sessions for the user", async () => {
    const a1 = await Sessioning.start({ user: userA });
    await Sessioning.start({ user: userB });
    const expired = "session:old" as ID;
    await insertExpired(expired, userA);

    const result = await Sessioning._getSessionsForUser({ user: userA });
    expect(result).toEqual([{ session: a1.session }]);
  });

  test("queries on unknown sessions", async () => {
    expect(await Sessioning._getUser({ session: "ghost" as ID })).toEqual([]);
    expect(await Sessioning._isActive({ session: "ghost" as ID })).toEqual([
      { active: false },
    ]);
  });
});
