import { collectionName, freshID } from "@utils/database.ts";
import type { ID } from "@utils/types.ts";
import type { Collection, Db } from "mongodb";

type Learner = ID;
type Item = ID;
type Grant = ID;
type Use = ID;

interface PolicyDoc {
  _id: "singleton";
  defaultDays: number;
  unitHours: number;
  maxDaysPerItem: number;
}

interface GrantDoc {
  _id: Grant;
  learner: Learner;
  days: number;
  reason: string;
  grantedAt: Date;
}

interface UseDoc {
  _id: Use;
  learner: Learner;
  item: Item;
  days: number;
  appliedAt: Date;
  status: "APPLIED" | "CANCELED";
}

const DEFAULT_POLICY: PolicyDoc = {
  _id: "singleton",
  defaultDays: 0,
  unitHours: 24,
  maxDaysPerItem: 5,
};

/**
 * concept: LateBanking [Learner, Item]
 *
 * purpose: manage late-day policy, student balances, and per-assignment late-day
 * usage so instructors can enforce submission deadlines with flexibility.
 */
export default class LateBankingConcept {
  private readonly policy: Collection<PolicyDoc>;
  private readonly grants: Collection<GrantDoc>;
  private readonly uses: Collection<UseDoc>;

  constructor(
    private readonly db: Db,
    namespace = "LateBanking",
  ) {
    this.policy = this.db.collection(collectionName(namespace, "policy"));
    this.grants = this.db.collection(collectionName(namespace, "grants"));
    this.uses = this.db.collection(collectionName(namespace, "uses"));
  }

  /**
   * configurePolicy ({ defaultDays, unitHours, maxDaysPerItem }):
   *   (policy: Flag)
   *
   * **requires** true
   *
   * **effects** upserts the singleton policy document with the supplied values;
   * omitted fields keep their previous values (defaulting to 0, 24, and 5
   * respectively); returns `{ policy: true }`
   */
  async configurePolicy({
    defaultDays,
    unitHours,
    maxDaysPerItem,
  }: {
    defaultDays?: number;
    unitHours?: number;
    maxDaysPerItem?: number;
  }): Promise<{ policy: true } | { error: string }> {
    const existing = await this.policy.findOne({ _id: "singleton" });
    if (existing !== null) {
      const $set: Record<string, number> = {};
      if (defaultDays !== undefined) $set.defaultDays = defaultDays;
      if (unitHours !== undefined) $set.unitHours = unitHours;
      if (maxDaysPerItem !== undefined) $set.maxDaysPerItem = maxDaysPerItem;
      if (Object.keys($set).length > 0) {
        await this.policy.updateOne({ _id: "singleton" }, { $set });
      }
    } else {
      await this.policy.insertOne({
        _id: "singleton",
        defaultDays: defaultDays ?? DEFAULT_POLICY.defaultDays,
        unitHours: unitHours ?? DEFAULT_POLICY.unitHours,
        maxDaysPerItem: maxDaysPerItem ?? DEFAULT_POLICY.maxDaysPerItem,
      });
    }
    return { policy: true };
  }

  /**
   * grant ({ learner, days, reason }): (grant: Grant) | (error: string)
   *
   * **requires** `days` is positive
   *
   * **effects** creates a fresh Grant for the given `learner` with the specified
   * `days`, `reason` and current time; returns the new grant id
   */
  async grant({
    learner,
    days,
    reason,
  }: {
    learner: Learner;
    days: number;
    reason: string;
  }): Promise<{ grant: Grant } | { error: string }> {
    if (days <= 0) {
      return { error: "Grant days must be positive." };
    }
    const _id = freshID() as Grant;
    const grantedAt: Date = new Date();
    await this.grants.insertOne({ _id, learner, days, reason, grantedAt });
    return { grant: _id };
  }

  /**
   * apply ({ learner, item, days }): (use: Use) | (error: string)
   *
   * **requires** `days` is positive, not exceeding maxDaysPerItem, and the
   * learner has sufficient remaining balance; also requires no existing APPLIED
   * Use exists for the same (`learner`, `item`)
   *
   * **effects** creates a fresh APPLIED Use for the given `learner` and `item`
   * with the specified `days` and current time; returns the new use id
   */
  async apply({
    learner,
    item,
    days,
  }: {
    learner: Learner;
    item: Item;
    days: number;
  }): Promise<{ use: Use } | { error: string }> {
    if (days <= 0) {
      return { error: "Applied days must be positive." };
    }

    const policyDoc = await this.getPolicy();
    if (days > policyDoc.maxDaysPerItem) {
      return {
        error: `Applied days (${days}) exceed the maximum allowed per item (${policyDoc.maxDaysPerItem}).`,
      };
    }

    const existing = await this.uses.findOne({
      learner,
      item,
      status: "APPLIED",
    });
    if (existing !== null) {
      return {
        error: "This learner already has an active late-day use for this item.",
      };
    }

    const [{ remaining }] = await this._getBalance({ learner });
    if (days > remaining) {
      return {
        error: `Insufficient balance. Requested ${days} day(s) but only ${remaining} remaining.`,
      };
    }

    const _id = freshID() as Use;
    const appliedAt: Date = new Date();
    await this.uses.insertOne({
      _id,
      learner,
      item,
      days,
      appliedAt,
      status: "APPLIED",
    });
    return { use: _id };
  }

  /**
   * changeUse ({ learner, item, days }): (use: Use) | (error: string)
   *
   * **requires** an APPLIED Use exists for the given (`learner`, `item`); `days`
   * is >= 0, does not exceed maxDaysPerItem, and the learner has sufficient
   * remaining balance
   *
   * **effects** updates the existing APPLIED Use's `days` to the new value;
   * returns the use id
   */
  async changeUse({
    learner,
    item,
    days,
  }: {
    learner: Learner;
    item: Item;
    days: number;
  }): Promise<{ use: Use } | { error: string }> {
    const existing = await this.uses.findOne({
      learner,
      item,
      status: "APPLIED",
    });
    if (existing === null) {
      return {
        error: "No active late-day use exists for this learner and item.",
      };
    }

    if (days < 0) {
      return { error: "Days must be non-negative." };
    }

    const policyDoc = await this.getPolicy();
    if (days > policyDoc.maxDaysPerItem) {
      return {
        error: `Days (${days}) exceed the maximum allowed per item (${policyDoc.maxDaysPerItem}).`,
      };
    }

    const [{ remaining }] = await this._getBalance({ learner });
    const delta = days - existing.days;
    if (delta > remaining) {
      return {
        error: `Insufficient balance. Increasing by ${delta} day(s) requires ${existing.days + delta} total, but only ${remaining + existing.days} available.`,
      };
    }

    await this.uses.updateOne({ _id: existing._id }, { $set: { days } });
    return { use: existing._id };
  }

  /**
   * cancelUse ({ learner, item }): (use: Use) | (error: string)
   *
   * **requires** an APPLIED Use exists for the given (`learner`, `item`)
   *
   * **effects** changes the status of the existing APPLIED Use to CANCELED;
   * returns the use id
   */
  async cancelUse({
    learner,
    item,
  }: {
    learner: Learner;
    item: Item;
  }): Promise<{ use: Use } | { error: string }> {
    const existing = await this.uses.findOne({
      learner,
      item,
      status: "APPLIED",
    });
    if (existing === null) {
      return {
        error: "No active late-day use exists for this learner and item.",
      };
    }
    await this.uses.updateOne(
      { _id: existing._id },
      { $set: { status: "CANCELED" } },
    );
    return { use: existing._id };
  }

  /**
   * _getPolicy (): (defaultDays: number, unitHours: number, maxDaysPerItem: number)
   *
   * **requires** true
   *
   * **effects** returns the current policy values, using defaults (0, 24, 5)
   * when the singleton has not been configured
   */
  async _getPolicy(): Promise<
    { defaultDays: number; unitHours: number; maxDaysPerItem: number }[]
  > {
    const doc = await this.getPolicy();
    return [
      {
        defaultDays: doc.defaultDays,
        unitHours: doc.unitHours,
        maxDaysPerItem: doc.maxDaysPerItem,
      },
    ];
  }

  /**
   * _getBalance ({ learner }):
   *   (granted: number, used: number, remaining: number)
   *
   * **requires** true
   *
   * **effects** returns the total granted days, total used days, and remaining
   * balance for the given `learner`
   */
  async _getBalance({
    learner,
  }: {
    learner: Learner;
  }): Promise<{ granted: number; used: number; remaining: number }[]> {
    const policyDoc = await this.getPolicy();

    const grantDocs = await this.grants.find({ learner }).toArray();
    const granted =
      policyDoc.defaultDays + grantDocs.reduce((sum, g) => sum + g.days, 0);

    const useDocs = await this.uses
      .find({
        learner,
        status: "APPLIED",
      })
      .toArray();
    const used = useDocs.reduce((sum, u) => sum + u.days, 0);

    const remaining = granted - used;
    return [{ granted, used, remaining }];
  }

  /**
   * _getApplied ({ learner, item }): (days: number)
   *
   * **requires** true
   *
   * **effects** returns the number of applied days for the given `learner` and
   * `item` (0 if none)
   */
  async _getApplied({
    learner,
    item,
  }: {
    learner: Learner;
    item: Item;
  }): Promise<{ days: number }[]> {
    const doc = await this.uses.findOne({
      learner,
      item,
      status: "APPLIED",
    });
    return [{ days: doc !== null ? doc.days : 0 }];
  }

  /**
   * _getUses ({ learner }):
   *   (item: Item, days: number, status: "APPLIED" | "CANCELED", appliedAt: DateTime)
   *
   * **requires** true
   *
   * **effects** returns all uses for the given `learner` with their item, days,
   * status, and application time
   */
  async _getUses({ learner }: { learner: Learner }): Promise<
    {
      item: Item;
      days: number;
      status: "APPLIED" | "CANCELED";
      appliedAt: Date;
    }[]
  > {
    const docs = await this.uses.find({ learner }).toArray();
    return docs.map((d) => ({
      item: d.item,
      days: d.days,
      status: d.status,
      appliedAt: d.appliedAt,
    }));
  }

  /**
   * _getUsersForItem ({ item }): (learner: Learner, days: number)
   *
   * **requires** true
   *
   * **effects** returns every learner who has an APPLIED use for the given
   * `item`, each with the number of days applied
   */
  async _getUsersForItem({
    item,
  }: {
    item: Item;
  }): Promise<{ learner: Learner; days: number }[]> {
    const docs = await this.uses.find({ item, status: "APPLIED" }).toArray();
    return docs.map((d) => ({ learner: d.learner, days: d.days }));
  }

  /** Returns the current policy document, or the defaults. */
  private async getPolicy(): Promise<PolicyDoc> {
    const doc = await this.policy.findOne({ _id: "singleton" });
    return doc ?? DEFAULT_POLICY;
  }
}
