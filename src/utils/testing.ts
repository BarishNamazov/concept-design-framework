import { type Db, MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";

/**
 * A disposable, in-memory MongoDB instance for tests. Each call spins up a
 * fresh `mongodb-memory-server`, connects a client, and hands back a clean
 * database. Call `stop()` (e.g. in an `afterAll` hook) to tear everything down.
 */
export interface TestMongo {
  db: Db;
  client: MongoClient;
  stop: () => Promise<void>;
}

/**
 * Starts an isolated in-memory MongoDB and returns a connected database.
 * Use this in concept tests instead of `getDb`/`testDb`, which require a real
 * `MONGODB_URL`.
 */
export async function setupTestDb(dbName = "test"): Promise<TestMongo> {
  const server = await MongoMemoryServer.create();
  const client = new MongoClient(server.getUri());
  await client.connect();
  const db = client.db(dbName);
  return {
    db,
    client,
    stop: async () => {
      await client.close();
      await server.stop();
    },
  };
}
