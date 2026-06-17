import { collectionName, freshID } from "@utils/database.ts";
import type { ID } from "@utils/types.ts";
import type { Collection, Db } from "mongodb";
import { ForumErrorCode } from "../../sdk/error-codes.ts";

// Generic types of this concept.
type Item = ID;
type Scope = ID;
type Pin = ID;

/**
 * a set of Pins with
 *   an item Item
 *   a scope Scope
 *   a priority Number
 *   a pinnedAt DateTime
 *
 * Invariant: at most one Pin exists for a given (`item`, `scope`) pair.
 */
interface PinDoc {
  _id: Pin;
  item: Item;
  scope: Scope;
  priority: number;
  pinnedAt: Date;
}

/**
 * concept: Pinning [Item, Scope]
 *
 * purpose: keep important items at the top of a listing within a scope,
 * regardless of recency, so announcements stay visible.
 */
export default class PinningConcept {
  private readonly pins: Collection<PinDoc>;

  constructor(
    private readonly db: Db,
    namespace = "Pinning",
  ) {
    this.pins = this.db.collection(collectionName(namespace, "pins"));
  }

  /**
   * pin (item: Item, scope: Scope, priority: Number): (pin: Pin)
   *
   * **requires** no Pin exists for the given `item` and `scope`
   *
   * **effects** creates a fresh Pin `p` with the given `item`, `scope` and
   * `priority`, and `pinnedAt` the current time; returns `p` as `pin`
   */
  async pin({
    item,
    scope,
    priority,
  }: {
    item: Item;
    scope: Scope;
    priority: number;
  }): Promise<{ pin: Pin } | { error: ForumErrorCode; detail?: string }> {
    const existing = await this.pins.findOne({ item, scope });
    if (existing !== null) {
      return { error: ForumErrorCode.ITEM_ALREADY_PINNED };
    }
    const pin = freshID() as Pin;
    const pinnedAt: Date = new Date();
    await this.pins.insertOne({
      _id: pin,
      item,
      scope,
      priority,
      pinnedAt,
    });
    return { pin };
  }

  /**
   * unpin (item: Item, scope: Scope): (pin: Pin)
   *
   * **requires** a Pin exists for the given `item` and `scope`
   *
   * **effects** removes that Pin from the state; returns the removed pin id as
   * `pin`
   */
  async unpin({
    item,
    scope,
  }: {
    item: Item;
    scope: Scope;
  }): Promise<{ pin: Pin } | { error: ForumErrorCode; detail?: string }> {
    const doc = await this.pins.findOne({ item, scope });
    if (doc === null) {
      return { error: ForumErrorCode.ITEM_NOT_PINNED };
    }
    await this.pins.deleteOne({ _id: doc._id });
    return { pin: doc._id };
  }

  /**
   * setPriority (item: Item, scope: Scope, priority: Number): (pin: Pin)
   *
   * **requires** a Pin exists for the given `item` and `scope`
   *
   * **effects** updates that Pin's `priority` to the given value; returns the
   * pin id as `pin`
   */
  async setPriority({
    item,
    scope,
    priority,
  }: {
    item: Item;
    scope: Scope;
    priority: number;
  }): Promise<{ pin: Pin } | { error: ForumErrorCode; detail?: string }> {
    const doc = await this.pins.findOne({ item, scope });
    if (doc === null) {
      return { error: ForumErrorCode.ITEM_NOT_PINNED };
    }
    await this.pins.updateOne({ _id: doc._id }, { $set: { priority } });
    return { pin: doc._id };
  }

  /**
   * _getPinned (scope: Scope): (item: {item: Item, priority: Number})
   *
   * **requires** true
   *
   * **effects** returns every pinned item in the given `scope`, each with its
   * item and priority, ordered by `priority` descending (highest first)
   */
  async _getPinned({
    scope,
  }: {
    scope: Scope;
  }): Promise<{ item: Item; priority: number }[]> {
    const docs = await this.pins
      .find({ scope })
      .sort({ priority: -1, _id: -1 })
      .toArray();
    return docs.map((d) => ({ item: d.item, priority: d.priority }));
  }

  /**
   * _isPinned (item: Item, scope: Scope): (pinned: Flag)
   *
   * **requires** true
   *
   * **effects** returns a single result whose `pinned` is true iff a Pin exists
   * for the given `item` and `scope`
   */
  async _isPinned({
    item,
    scope,
  }: {
    item: Item;
    scope: Scope;
  }): Promise<{ pinned: boolean }[]> {
    const doc = await this.pins.findOne({ item, scope });
    return [{ pinned: doc !== null }];
  }
}
