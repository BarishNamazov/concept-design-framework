import type { Db } from "mongodb";

export interface Migration {
  id: number;
  name: string;
  up(db: Db): Promise<void>;
  down?(db: Db): Promise<void>;
}

interface MigrationRecord {
  _id: number;
  name: string;
  appliedAt: Date;
}

export async function runMigrations(
  db: Db,
  migrations: Migration[],
): Promise<number> {
  const migCol = db.collection<MigrationRecord>("_migrations");
  const applied = await migCol.find({}).toArray();
  const appliedIds = new Set(applied.map((d) => d._id));

  const sorted = [...migrations].sort((a, b) => a.id - b.id);
  let count = 0;
  for (const mig of sorted) {
    if (!appliedIds.has(mig.id)) {
      await mig.up(db);
      await migCol.insertOne({
        _id: mig.id,
        name: mig.name,
        appliedAt: new Date(),
      });
      count++;
    }
  }
  return count;
}

export async function rollbackMigration(
  db: Db,
  migrations: Migration[],
): Promise<void> {
  const migCol = db.collection<MigrationRecord>("_migrations");
  const applied = await migCol
    .find({})
    .sort({ _id: -1 })
    .limit(1)
    .toArray();
  if (applied.length === 0) return;

  const lastId = applied[0]._id;
  const migration = migrations.find((m) => m.id === lastId);
  if (migration?.down) {
    await migration.down(db);
  }
  await migCol.deleteOne({ _id: lastId });
}
