import { getDb } from "@utils/database.ts";
import { runMigrations } from "../src/db/migrate.ts";
import passwordHashMigration from "../migrations/001_hash_passwords.ts";
import rehashPasswordsMigration from "../migrations/002_rehash_passwords.ts";

const MIGRATIONS = [passwordHashMigration, rehashPasswordsMigration];

const [db, client] = await getDb();
try {
  const count = await runMigrations(db, MIGRATIONS);
  console.log(`Applied ${count} migration(s)`);
} finally {
  await client.close();
}
process.exit(0);
