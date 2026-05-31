import { collectionName, freshID } from "@utils/database.ts";
import type { ID } from "@utils/types.ts";
import type { Collection, Db } from "mongodb";

// Generic types of this concept.
type Item = ID;
type Revision = ID;

/**
 * a set of Revisions with
 *   an item Item
 *   a number Number
 *   a content String
 *   a savedAt DateTime
 *
 * Invariant: revision numbers increase monotonically per `item`, starting at 1,
 * with no gaps or duplicates.
 */
interface RevisionDoc {
  _id: Revision;
  item: Item;
  number: number;
  content: string;
  savedAt: Date;
}

/**
 * concept: Revisioning [Item]
 *
 * purpose: preserve prior versions of an item's content so changes are
 * transparent and auditable.
 */
export default class RevisioningConcept {
  private readonly revisions: Collection<RevisionDoc>;

  constructor(
    private readonly db: Db,
    namespace = "Revisioning",
  ) {
    this.revisions = this.db.collection(collectionName(namespace, "revisions"));
  }

  /**
   * record (item: Item, content: String): (revision: Revision, number: Number)
   *
   * **requires** true
   *
   * **effects** computes the next revision number for `item` (the current
   * maximum for that item plus 1, or 1 if none exists), inserts a fresh
   * Revision with that number, the given `content` and `savedAt` the current
   * time; returns the new `revision` id and its `number`
   */
  async record({
    item,
    content,
  }: {
    item: Item;
    content: string;
  }): Promise<{ revision: Revision; number: number }> {
    const latest = await this.revisions.findOne(
      { item },
      { sort: { number: -1 } },
    );
    const number = (latest?.number ?? 0) + 1;
    const revision = freshID() as Revision;
    const savedAt: Date = new Date();
    await this.revisions.insertOne({
      _id: revision,
      item,
      number,
      content,
      savedAt,
    });
    return { revision, number };
  }

  /**
   * _getRevisions (item: Item): (revision: {revision: Revision, number: Number, content: String, savedAt: DateTime})
   *
   * **requires** true
   *
   * **effects** returns every Revision of the given `item`, each with its
   * revision id, number, content and savedAt, ordered by number ascending
   */
  async _getRevisions({
    item,
  }: {
    item: Item;
  }): Promise<
    { revision: Revision; number: number; content: string; savedAt: Date }[]
  > {
    const docs = await this.revisions
      .find({ item })
      .sort({ number: 1 })
      .toArray();
    return docs.map((d) => ({
      revision: d._id,
      number: d.number,
      content: d.content,
      savedAt: d.savedAt,
    }));
  }

  /**
   * _getRevision (item: Item, number: Number): (content: String, savedAt: DateTime)
   *
   * **requires** true
   *
   * **effects** returns the Revision (zero or one) with the given `number` for
   * the given `item`, with its content and savedAt
   */
  async _getRevision({
    item,
    number,
  }: {
    item: Item;
    number: number;
  }): Promise<{ content: string; savedAt: Date }[]> {
    const doc = await this.revisions.findOne({ item, number });
    return doc === null ? [] : [{ content: doc.content, savedAt: doc.savedAt }];
  }

  /**
   * _getLatest (item: Item): (revision: {revision: Revision, number: Number, content: String, savedAt: DateTime})
   *
   * **requires** true
   *
   * **effects** returns the highest-numbered Revision (zero or one) for the
   * given `item`, with its revision id, number, content and savedAt
   */
  async _getLatest({
    item,
  }: {
    item: Item;
  }): Promise<
    { revision: Revision; number: number; content: string; savedAt: Date }[]
  > {
    const doc = await this.revisions.findOne(
      { item },
      { sort: { number: -1 } },
    );
    return doc === null
      ? []
      : [
          {
            revision: doc._id,
            number: doc.number,
            content: doc.content,
            savedAt: doc.savedAt,
          },
        ];
  }
}
