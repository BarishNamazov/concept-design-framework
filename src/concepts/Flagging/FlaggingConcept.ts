import { collectionName, freshID } from "@utils/database.ts";
import type { ID } from "@utils/types.ts";
import type { Collection, Db } from "mongodb";
import { ForumErrorCode } from "../../sdk/error-codes.ts";

// Generic types of this concept.
type User = ID;
type Target = ID;
type Flag = ID;

/**
 * a set of Flags with
 *   a reporter User
 *   a target Target
 *   a reason String
 *   a createdAt DateTime
 *   a status String ("open" | "upheld" | "dismissed")
 *
 * Invariant: at most one OPEN flag exists for a given (`reporter`, `target`)
 * pair.
 */
interface FlagDoc {
  _id: Flag;
  reporter: User;
  target: Target;
  reason: string;
  createdAt: Date;
  status: "open" | "upheld" | "dismissed";
}

/**
 * concept: Flagging [User, Target]
 *
 * purpose: let the community surface content that may violate standards so
 * staff can review and act on it.
 */
export default class FlaggingConcept {
  private readonly flags: Collection<FlagDoc>;

  constructor(
    private readonly db: Db,
    namespace = "Flagging",
  ) {
    this.flags = this.db.collection(collectionName(namespace, "flags"));
  }

  /**
   * flag (reporter: User, target: Target, reason: String): (flag: Flag)
   *
   * **requires** no OPEN Flag by `reporter` on `target` exists
   *
   * **effects** creates a fresh Flag `f` with the given `reporter`, `target`
   * and `reason`, `status` "open" and `createdAt` the current time; returns `f`
   * as `flag`
   */
  async flag({
    reporter,
    target,
    reason,
  }: {
    reporter: User;
    target: Target;
    reason: string;
  }): Promise<{ flag: Flag } | { error: ForumErrorCode; detail?: string }> {
    const existing = await this.flags.findOne({
      reporter,
      target,
      status: "open",
    });
    if (existing !== null) {
      return { error: ForumErrorCode.FLAG_ALREADY_EXISTS };
    }
    const flag = freshID() as Flag;
    const createdAt: Date = new Date();
    await this.flags.insertOne({
      _id: flag,
      reporter,
      target,
      reason,
      createdAt,
      status: "open",
    });
    return { flag };
  }

  /**
   * resolve (target: Target, outcome: String): (target: Target)
   *
   * **requires** `outcome` is "upheld" or "dismissed" and at least one OPEN
   * Flag on `target` exists
   *
   * **effects** sets the status of every OPEN Flag on `target` to `outcome`,
   * removing it from the open review queue; returns `target`
   */
  async resolve({
    target,
    outcome,
  }: {
    target: Target;
    outcome: string;
  }): Promise<{ target: Target } | { error: ForumErrorCode; detail?: string }> {
    if (outcome !== "upheld" && outcome !== "dismissed") {
      return {
        error: ForumErrorCode.VALIDATION_FAILED,
        detail: 'Outcome must be "upheld" or "dismissed".',
      };
    }
    const open = await this.flags.findOne({ target, status: "open" });
    if (open === null) {
      return { error: ForumErrorCode.FLAG_NOT_FOUND };
    }
    await this.flags.updateMany(
      { target, status: "open" },
      { $set: { status: outcome } },
    );
    return { target };
  }

  /**
   * _getOpenTargets (): (target: {target: Target, count: Number})
   *
   * **requires** true
   *
   * **effects** returns every Target with at least one OPEN Flag, each with its
   * number of open flags, ordered by `count` descending (busiest first)
   */
  async _getOpenTargets(): Promise<{ target: Target; count: number }[]> {
    const docs = await this.flags.find({ status: "open" }).toArray();
    const counts = new Map<Target, number>();
    for (const d of docs) {
      counts.set(d.target, (counts.get(d.target) ?? 0) + 1);
    }
    return [...counts]
      .map(([target, count]) => ({ target, count }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * _getFlags (target: Target): (flag: {flag: Flag, reporter: User, reason: String, status: String, createdAt: DateTime})
   *
   * **requires** true
   *
   * **effects** returns every Flag on the given `target`, each with its flag id,
   * reporter, reason, status and createdAt
   */
  async _getFlags({ target }: { target: Target }): Promise<
    {
      flag: Flag;
      reporter: User;
      reason: string;
      status: string;
      createdAt: Date;
    }[]
  > {
    const docs = await this.flags.find({ target }).toArray();
    return docs.map((d) => ({
      flag: d._id,
      reporter: d.reporter,
      reason: d.reason,
      status: d.status,
      createdAt: d.createdAt,
    }));
  }

  /**
   * _hasFlagged (reporter: User, target: Target): (flagged: Flag)
   *
   * **requires** true
   *
   * **effects** returns a single result whose `flagged` is true iff an OPEN
   * Flag by `reporter` on `target` exists
   */
  async _hasFlagged({
    reporter,
    target,
  }: {
    reporter: User;
    target: Target;
  }): Promise<{ flagged: boolean }[]> {
    const doc = await this.flags.findOne({
      reporter,
      target,
      status: "open",
    });
    return [{ flagged: doc !== null }];
  }
}
