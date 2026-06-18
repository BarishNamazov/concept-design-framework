import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import type { Db } from "mongodb";
import { setupTestDb } from "@utils/testing.ts";
import {
  runMigrations,
  rollbackMigration,
  type Migration,
} from "../src/db/migrate.ts";
import passwordHashMigration from "../migrations/001_hash_passwords.ts";

interface MigrationRecord {
  _id: number;
  name: string;
  appliedAt: Date;
}

interface TestDoc {
  _id: string;
  username: string;
  password: string;
  email: string;
}

interface StepDoc {
  _id?: string;
  step?: number;
  tracked?: boolean;
}

const mongo = await setupTestDb();
let db: Db;

afterAll(() => mongo.stop());

beforeEach(async () => {
  db = mongo.db;
  const collections = await db.listCollections().toArray();
  for (const { name } of collections) {
    if (name === "_migrations" || name.startsWith("system.")) continue;
    await db.collection(name).drop().catch(() => {});
  }
  await db.collection("_migrations").drop().catch(() => {});
});

describe("runMigrations", () => {
  test("applies all pending migrations in id order", async () => {
    const applied: string[] = [];
    const migrations: Migration[] = [
      {
        id: 2,
        name: "second",
        async up(db: Db) {
          await db.collection<StepDoc>("test").insertOne({ step: 2 });
          applied.push("2");
        },
      },
      {
        id: 1,
        name: "first",
        async up(db: Db) {
          await db.collection<StepDoc>("test").insertOne({ step: 1 });
          applied.push("1");
        },
      },
    ];

    const count = await runMigrations(db, migrations);
    expect(count).toBe(2);
    expect(applied).toEqual(["1", "2"]);
  });

  test("tracks applied migrations in _migrations collection", async () => {
    const migrations: Migration[] = [
      {
        id: 1,
        name: "tracked",
        async up(db: Db) {
          await db.collection<StepDoc>("test").insertOne({ tracked: true });
        },
      },
    ];

    await runMigrations(db, migrations);
    const migCol = db.collection<MigrationRecord>("_migrations");
    const records = await migCol.find({}).toArray();
    expect(records).toHaveLength(1);
    expect(records[0]._id).toBe(1);
    expect(records[0].name).toBe("tracked");
  });

  test("is idempotent — does not re-apply already-applied migrations", async () => {
    let runs = 0;
    const migrations: Migration[] = [
      {
        id: 1,
        name: "idempotent-check",
        async up() {
          runs++;
        },
      },
    ];

    await runMigrations(db, migrations);
    expect(runs).toBe(1);

    await runMigrations(db, migrations);
    expect(runs).toBe(1);

    const migCol = db.collection<MigrationRecord>("_migrations");
    const records = await migCol.find({}).toArray();
    expect(records).toHaveLength(1);
  });

  test("returns count of newly applied migrations", async () => {
    const migrations: Migration[] = [
      { id: 1, name: "a", async up() {} },
      { id: 2, name: "b", async up() {} },
    ];

    const c1 = await runMigrations(db, migrations);
    expect(c1).toBe(2);

    const c2 = await runMigrations(db, migrations);
    expect(c2).toBe(0);
  });
});

describe("rollbackMigration", () => {
  test("runs down() on the last applied migration and removes its record", async () => {
    let rolledBack = false;
    const migrations: Migration[] = [
      {
        id: 1,
        name: "rollback-test",
        async up() {},
        async down() {
          rolledBack = true;
        },
      },
    ];

    await runMigrations(db, migrations);

    const migCol = db.collection<MigrationRecord>("_migrations");
    let records = await migCol.find({}).toArray();
    expect(records).toHaveLength(1);

    await rollbackMigration(db, migrations);
    expect(rolledBack).toBe(true);

    records = await migCol.find({}).toArray();
    expect(records).toHaveLength(0);
  });

  test("does nothing when no migrations are applied", async () => {
    const migrations: Migration[] = [
      {
        id: 1,
        name: "nothing",
        async up() {},
        async down() {
          throw new Error("should not be called");
        },
      },
    ];

    await rollbackMigration(db, migrations);
  });

  test("handles migrations without down() gracefully", async () => {
    const migrations: Migration[] = [
      { id: 1, name: "no-down", async up() {} },
    ];

    await runMigrations(db, migrations);
    await rollbackMigration(db, migrations);

    const migCol = db.collection<MigrationRecord>("_migrations");
    const records = await migCol.find({}).toArray();
    expect(records).toHaveLength(0);
  });
});

describe("password hash migration (001_hash_passwords)", () => {
  test("hashes plaintext passwords and skips already-hashed ones", async () => {
    const usersCol = db.collection<TestDoc>("test.Authenticating.users");

    const plainPw = "secret123";
    const alreadyHashed = await Bun.password.hash("hashedPw1", {
      algorithm: "bcrypt",
      cost: 4,
    });

    await usersCol.insertMany([
      { _id: "u1", username: "alice", password: plainPw, email: "a@a.com" },
      {
        _id: "u2",
        username: "bob",
        password: alreadyHashed,
        email: "b@b.com",
      },
    ]);

    await passwordHashMigration.up(db);

    const alice = await usersCol.findOne({ _id: "u1" });
    if (alice === null) throw new Error("Expected alice to exist");
    expect(alice.password).toStartWith("$2");

    const isBcrypt = await Bun.password.verify(plainPw, alice.password);
    expect(isBcrypt).toBe(true);

    const bob = await usersCol.findOne({ _id: "u2" });
    if (bob === null) throw new Error("Expected bob to exist");
    expect(bob.password).toBe(alreadyHashed);
  });

  test("respects BCRYPT_ROUNDS environment variable", async () => {
    process.env.BCRYPT_ROUNDS = "6";

    const usersCol = db.collection<TestDoc>("other.Authenticating.users");
    await usersCol.insertOne({
      _id: "u3",
      username: "carol",
      password: "plain123",
      email: "c@c.com",
    });

    await passwordHashMigration.up(db);

    const carol = await usersCol.findOne({ _id: "u3" });
    if (carol === null) throw new Error("Expected carol to exist");
    expect(carol.password).toStartWith("$2b$06$");

    delete process.env.BCRYPT_ROUNDS;
  });

  test("handles collections with no unhashed passwords", async () => {
    const usersCol = db.collection<TestDoc>("empty.Authenticating.users");
    const hashed = await Bun.password.hash("pwd", {
      algorithm: "bcrypt",
      cost: 4,
    });
    await usersCol.insertOne({
      _id: "u4",
      username: "dave",
      password: hashed,
      email: "d@d.com",
    });

    await passwordHashMigration.up(db);

    const dave = await usersCol.findOne({ _id: "u4" });
    if (dave === null) throw new Error("Expected dave to exist");
    expect(dave.password).toBe(hashed);
  });
});
