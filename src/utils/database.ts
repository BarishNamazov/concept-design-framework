import { Db, MongoClient } from "mongodb";
import { v7 as uuidv7 } from "uuid";
import type { ID } from "@utils/types.ts";

/**
 * Connects a MongoClient using the `MONGODB_URL` environment variable.
 * Bun loads variables from `.env` automatically.
 */
async function initMongoClient(): Promise<MongoClient> {
  const DB_CONN = process.env.MONGODB_URL;
  if (DB_CONN === undefined) {
    throw new Error("Could not find environment variable: MONGODB_URL");
  }
  const client = new MongoClient(DB_CONN);
  try {
    await client.connect();
  } catch (e) {
    throw new Error("MongoDB connection failed: " + e);
  }
  return client;
}

async function init(): Promise<[MongoClient, string]> {
  const client = await initMongoClient();
  const DB_NAME = process.env.DB_NAME;
  if (DB_NAME === undefined) {
    throw new Error("Could not find environment variable: DB_NAME");
  }
  return [client, DB_NAME];
}

/**
 * MongoDB database configured by `.env`.
 * @returns initialized database and client
 */
export async function getDb(): Promise<[Db, MongoClient]> {
  const [client, DB_NAME] = await init();
  return [client.db(DB_NAME), client];
}

/**
 * Creates a fresh ID.
 * @returns a UUID v7 generic ID.
 */
export function freshID(): ID {
  return uuidv7() as ID;
}

/** Builds a namespaced MongoDB collection name for a concept instance. */
export function collectionName(namespace: string, name: string): string {
  return `${namespace}.${name}`;
}
