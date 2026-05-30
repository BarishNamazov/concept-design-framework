import { Collection, Db } from "mongodb";
import type { ID } from "@utils/types.ts";

// Declare collection prefix, use concept name.
const PREFIX = "Tracking" + ".";

// Generic types of this concept.
type User = ID;
type Item = ID;
type Scope = ID;

/**
 * a set of Items with
 *   a scope Scope
 *   a createdAt DateTime
 */
interface ItemDoc {
  _id: Item;
  scope: Scope;
  createdAt: Date;
}

/**
 * a set of SeenMarks with
 *   a user User
 *   an item Item
 *   a seenAt DateTime
 *
 * Invariant: at most one SeenMark exists per (`user`, `item`) pair.
 */
interface SeenMarkDoc {
  user: User;
  item: Item;
  seenAt: Date;
}

/**
 * concept: Tracking [User, Item, Scope]
 *
 * purpose: remember which items each user has already seen so that the items
 * still new to them can be surfaced.
 */
export default class TrackingConcept {
  private readonly items: Collection<ItemDoc>;
  private readonly seenMarks: Collection<SeenMarkDoc>;

  constructor(private readonly db: Db) {
    this.items = this.db.collection(PREFIX + "items");
    this.seenMarks = this.db.collection(PREFIX + "seenMarks");
  }

  /**
   * register (item: Item, scope: Scope): (item: Item)
   *
   * **requires** the given `item` is not already registered
   *
   * **effects** adds `item` to the set with the given `scope` and `createdAt`
   * the current time; returns `item`
   */
  async register(
    { item, scope }: { item: Item; scope: Scope },
  ): Promise<{ item: Item } | { error: string }> {
    const existing = await this.items.findOne({ _id: item });
    if (existing !== null) {
      return { error: "Item is already registered." };
    }
    await this.items.insertOne({ _id: item, scope, createdAt: new Date() });
    return { item };
  }

  /**
   * unregister (item: Item): (item: Item)
   *
   * **requires** the given `item` is registered
   *
   * **effects** removes `item` from the set and removes every SeenMark for
   * `item`; returns `item`
   */
  async unregister(
    { item }: { item: Item },
  ): Promise<{ item: Item } | { error: string }> {
    const { deletedCount } = await this.items.deleteOne({ _id: item });
    if (deletedCount === 0) {
      return { error: "Item is not registered." };
    }
    await this.seenMarks.deleteMany({ item });
    return { item };
  }

  /**
   * markSeen (user: User, item: Item): (item: Item)
   *
   * **requires** the given `item` is registered and no SeenMark exists for
   * (`user`, `item`)
   *
   * **effects** creates a SeenMark for (`user`, `item`) with `seenAt` the
   * current time; returns `item`
   */
  async markSeen(
    { user, item }: { user: User; item: Item },
  ): Promise<{ item: Item } | { error: string }> {
    const registered = await this.items.findOne({ _id: item });
    if (registered === null) {
      return { error: "Item is not registered." };
    }
    const mark = await this.seenMarks.findOne({ user, item });
    if (mark !== null) {
      return { error: "Item is already marked seen for this user." };
    }
    await this.seenMarks.insertOne({ user, item, seenAt: new Date() });
    return { item };
  }

  /**
   * markUnseen (user: User, item: Item): (item: Item)
   *
   * **requires** a SeenMark exists for (`user`, `item`)
   *
   * **effects** removes the SeenMark for (`user`, `item`); returns `item`
   */
  async markUnseen(
    { user, item }: { user: User; item: Item },
  ): Promise<{ item: Item } | { error: string }> {
    const { deletedCount } = await this.seenMarks.deleteOne({ user, item });
    if (deletedCount === 0) {
      return { error: "No SeenMark exists for this user and item." };
    }
    return { item };
  }

  /**
   * markAllSeen (user: User, scope: Scope): (user: User)
   *
   * **requires** true
   *
   * **effects** for every registered Item in `scope` that has no SeenMark for
   * `user`, creates a SeenMark for (`user`, item) with `seenAt` the current
   * time; returns `user`
   */
  async markAllSeen(
    { user, scope }: { user: User; scope: Scope },
  ): Promise<{ user: User }> {
    const items = await this.items.find({ scope }).toArray();
    const seen = await this.seenMarks.find({ user }).toArray();
    const seenItems = new Set(seen.map((m) => m.item));
    const now = new Date();
    const toInsert = items
      .filter((it) => !seenItems.has(it._id))
      .map((it) => ({ user, item: it._id, seenAt: now }));
    if (toInsert.length > 0) {
      await this.seenMarks.insertMany(toInsert);
    }
    return { user };
  }

  /**
   * _getUnread (user: User, scope: Scope): (item: Item)
   *
   * **requires** true
   *
   * **effects** returns every registered Item in `scope` for which no SeenMark
   * exists for `user`
   */
  async _getUnread(
    { user, scope }: { user: User; scope: Scope },
  ): Promise<{ item: Item }[]> {
    const items = await this.items.find({ scope }).toArray();
    const seen = await this.seenMarks.find({ user }).toArray();
    const seenItems = new Set(seen.map((m) => m.item));
    return items
      .filter((it) => !seenItems.has(it._id))
      .map((it) => ({ item: it._id }));
  }

  /**
   * _getUnreadCount (user: User, scope: Scope): (count: Number)
   *
   * **requires** true
   *
   * **effects** returns a single result with the number of registered Items in
   * `scope` that have no SeenMark for `user`
   */
  async _getUnreadCount(
    { user, scope }: { user: User; scope: Scope },
  ): Promise<{ count: number }[]> {
    const unread = await this._getUnread({ user, scope });
    return [{ count: unread.length }];
  }

  /**
   * _getSeen (user: User, scope: Scope): (item: Item)
   *
   * **requires** true
   *
   * **effects** returns every registered Item in `scope` for which a SeenMark
   * exists for `user`
   */
  async _getSeen(
    { user, scope }: { user: User; scope: Scope },
  ): Promise<{ item: Item }[]> {
    const items = await this.items.find({ scope }).toArray();
    const seen = await this.seenMarks.find({ user }).toArray();
    const seenItems = new Set(seen.map((m) => m.item));
    return items
      .filter((it) => seenItems.has(it._id))
      .map((it) => ({ item: it._id }));
  }

  /**
   * _isSeen (user: User, item: Item): (seen: Flag)
   *
   * **requires** true
   *
   * **effects** returns a single result whose `seen` is true iff a SeenMark
   * exists for (`user`, `item`)
   */
  async _isSeen(
    { user, item }: { user: User; item: Item },
  ): Promise<{ seen: boolean }[]> {
    const mark = await this.seenMarks.findOne({ user, item });
    return [{ seen: mark !== null }];
  }

  /**
   * _getItemsInScope (scope: Scope): (item: Item)
   *
   * **requires** true
   *
   * **effects** returns every registered Item whose scope is `scope`
   */
  async _getItemsInScope(
    { scope }: { scope: Scope },
  ): Promise<{ item: Item }[]> {
    const items = await this.items.find({ scope }).toArray();
    return items.map((it) => ({ item: it._id }));
  }
}
