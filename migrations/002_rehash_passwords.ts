import type { Db } from "mongodb";
import type { Migration } from "../src/db/migrate.ts";

const migration: Migration = {
  id: 2,
  name: "hash_remaining_passwords",
  async up(db: Db) {
    const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || "12", 10);
    const collections = await db.listCollections().toArray();
    const userCollections = collections.filter((c) =>
      c.name === "Authenticating.users" ||
      c.name.endsWith(".Authenticating.users"),
    );

    for (const { name } of userCollections) {
      const col = db.collection(name);
      const cursor = col.find({ password: { $not: /^\$2/ } });
      let count = 0;
      while (await cursor.hasNext()) {
        const doc = await cursor.next();
        if (!doc) continue;
        const hashed = await Bun.password.hash(doc.password, {
          algorithm: "bcrypt",
          cost: BCRYPT_ROUNDS,
        });
        await col.updateOne(
          { _id: doc._id },
          { $set: { password: hashed } },
        );
        count++;
      }
      if (count > 0) {
        console.log(`  Hashed ${count} passwords in ${name}`);
      }
    }
  },
};

export default migration;
