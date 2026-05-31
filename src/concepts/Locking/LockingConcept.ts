import { collectionName } from "@utils/database.ts";
import type { ID } from "@utils/types.ts";
import type { Collection, Db } from "mongodb";

// Generic types of this concept.
type Target = ID;

/**
 * a set of LockedTargets with
 *   a target Target
 *   a lockedAt DateTime
 *
 * The target id is used as the Mongo `_id`, enforcing at most one lock record
 * per target.
 */
interface LockedTargetDoc {
  _id: Target;
  lockedAt: Date;
}

/**
 * concept: Locking [Target]
 *
 * purpose: stop further contributions to a target once a discussion is
 * concluded or needs to be frozen.
 */
export default class LockingConcept {
  private readonly locked: Collection<LockedTargetDoc>;

  constructor(
    private readonly db: Db,
    namespace = "Locking",
  ) {
    this.locked = this.db.collection(collectionName(namespace, "locked"));
  }

  /**
   * lock (target: Target): (target: Target)
   *
   * **requires** `target` is not already locked
   *
   * **effects** inserts a LockedTarget for `target` with `lockedAt` the current
   * time; returns `target`
   */
  async lock({
    target,
  }: {
    target: Target;
  }): Promise<{ target: Target } | { error: string }> {
    const existing = await this.locked.findOne({ _id: target });
    if (existing !== null) {
      return { error: "Target is already locked." };
    }
    const lockedAt: Date = new Date();
    await this.locked.insertOne({ _id: target, lockedAt });
    return { target };
  }

  /**
   * unlock (target: Target): (target: Target)
   *
   * **requires** `target` is locked
   *
   * **effects** removes the lock record for `target`; returns `target`
   */
  async unlock({
    target,
  }: {
    target: Target;
  }): Promise<{ target: Target } | { error: string }> {
    const existing = await this.locked.findOne({ _id: target });
    if (existing === null) {
      return { error: "Target is not locked." };
    }
    await this.locked.deleteOne({ _id: target });
    return { target };
  }

  /**
   * _isLocked (target: Target): (locked: Flag)
   *
   * **requires** true
   *
   * **effects** returns a single result whose `locked` is true iff `target` has
   * a lock record
   */
  async _isLocked({
    target,
  }: {
    target: Target;
  }): Promise<{ locked: boolean }[]> {
    const doc = await this.locked.findOne({ _id: target });
    return [{ locked: doc !== null }];
  }

  /**
   * _getLocked (): (target: {target: Target, lockedAt: DateTime})
   *
   * **requires** true
   *
   * **effects** returns every locked target, each with its target id and the
   * time it was locked
   */
  async _getLocked(): Promise<{ target: Target; lockedAt: Date }[]> {
    const docs = await this.locked.find({}).toArray();
    return docs.map((d) => ({ target: d._id, lockedAt: d.lockedAt }));
  }
}
