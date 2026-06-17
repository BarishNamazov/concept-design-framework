import { collectionName } from "@utils/database.ts";
import type { ID } from "@utils/types.ts";
import type { Collection, Db } from "mongodb";
import { ForumErrorCode } from "../../sdk/error-codes.ts";

// Generic types of this concept.
type Item = ID;

/**
 * a set of TrashedItems with
 *   an item Item
 *   a trashedBy Item
 *   a trashedAt DateTime
 *
 * An item is "live" iff it is not in this set. The item id itself is used as the
 * Mongo `_id` so that at most one TrashedItem can exist per item.
 */
interface TrashedItemDoc {
  _id: Item;
  trashedBy: Item;
  trashedAt: Date;
}

/**
 * concept: Trashing [Item]
 *
 * purpose: support deletion of items with the possibility of restoring them, so
 * an accidental or contested removal can be undone.
 */
export default class TrashingConcept {
  private readonly items: Collection<TrashedItemDoc>;

  constructor(
    private readonly db: Db,
    namespace = "Trashing",
  ) {
    this.items = this.db.collection(collectionName(namespace, "items"));
  }

  /**
   * trash (item: Item, by: Item): (item: Item)
   *
   * **requires** `item` is not already trashed
   *
   * **effects** inserts a TrashedItem with the given `item`, `trashedBy` the
   * given `by` and `trashedAt` the current time; returns `item`
   */
  async trash({
    item,
    by,
  }: {
    item: Item;
    by: Item;
  }): Promise<{ item: Item } | { error: ForumErrorCode; detail?: string }> {
    const existing = await this.items.findOne({ _id: item });
    if (existing !== null) {
      return { error: ForumErrorCode.ITEM_ALREADY_TRASHED };
    }
    const trashedAt: Date = new Date();
    await this.items.insertOne({ _id: item, trashedBy: by, trashedAt });
    return { item };
  }

  /**
   * restore (item: Item): (item: Item)
   *
   * **requires** `item` is trashed
   *
   * **effects** removes the trash record of `item`, restoring its visibility;
   * returns `item`
   */
  async restore({
    item,
  }: {
    item: Item;
  }): Promise<{ item: Item } | { error: ForumErrorCode; detail?: string }> {
    const doc = await this.items.findOne({ _id: item });
    if (doc === null) {
      return { error: ForumErrorCode.ITEM_NOT_TRASHED };
    }
    await this.items.deleteOne({ _id: item });
    return { item };
  }

  /**
   * purge (item: Item): (item: Item)
   *
   * **requires** `item` is trashed
   *
   * **effects** permanently removes the trash record of `item`, forgetting it
   * for good; returns `item`
   */
  async purge({
    item,
  }: {
    item: Item;
  }): Promise<{ item: Item } | { error: ForumErrorCode; detail?: string }> {
    const doc = await this.items.findOne({ _id: item });
    if (doc === null) {
      return { error: ForumErrorCode.ITEM_NOT_TRASHED };
    }
    await this.items.deleteOne({ _id: item });
    return { item };
  }

  /**
   * _isTrashed (item: Item): (trashed: Flag)
   *
   * **requires** true
   *
   * **effects** returns a single result whose `trashed` is true iff `item` is
   * currently trashed
   */
  async _isTrashed({ item }: { item: Item }): Promise<{ trashed: boolean }[]> {
    const doc = await this.items.findOne({ _id: item });
    return [{ trashed: doc !== null }];
  }

  /**
   * _getTrashed (): (trashed: {item: Item, trashedBy: Item, trashedAt: DateTime})
   *
   * **requires** true
   *
   * **effects** returns every trashed item with its id, the actor that trashed
   * it and the time it was trashed
   */
  async _getTrashed(): Promise<
    { item: Item; trashedBy: Item; trashedAt: Date }[]
  > {
    const docs = await this.items.find({}).toArray();
    return docs.map((d) => ({
      item: d._id,
      trashedBy: d.trashedBy,
      trashedAt: d.trashedAt,
    }));
  }
}
