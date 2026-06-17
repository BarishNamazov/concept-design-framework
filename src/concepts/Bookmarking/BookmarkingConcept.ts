import { collectionName, freshID } from "@utils/database.ts";
import type { ID } from "@utils/types.ts";
import type { Collection, Db } from "mongodb";
import { ForumErrorCode } from "../../sdk/error-codes.ts";

// Generic types of this concept.
type User = ID;
type Item = ID;
type Bookmark = ID;

/**
 * a set of Bookmarks with
 *   a user User
 *   an item Item
 *   a savedAt DateTime
 *
 * Invariant: at most one Bookmark exists for a given (`user`, `item`) pair.
 */
interface BookmarkDoc {
  _id: Bookmark;
  user: User;
  item: Item;
  savedAt: Date;
}

/**
 * concept: Bookmarking [User, Item]
 *
 * purpose: let a user keep a private, personal shortlist of items to return to
 * later.
 */
export default class BookmarkingConcept {
  private readonly bookmarks: Collection<BookmarkDoc>;

  constructor(
    private readonly db: Db,
    namespace = "Bookmarking",
  ) {
    this.bookmarks = this.db.collection(collectionName(namespace, "bookmarks"));
  }

  /**
   * save (user: User, item: Item): (bookmark: Bookmark)
   *
   * **requires** no Bookmark exists for the given `user` and `item`
   *
   * **effects** creates a fresh Bookmark `b` with the given `user` and `item`,
   * and `savedAt` the current time; returns `b` as `bookmark`
   */
  async save({
    user,
    item,
  }: {
    user: User;
    item: Item;
  }): Promise<
    { bookmark: Bookmark } | { error: ForumErrorCode; detail?: string }
  > {
    const existing = await this.bookmarks.findOne({ user, item });
    if (existing !== null) {
      return { error: ForumErrorCode.BOOKMARK_ALREADY_EXISTS };
    }
    const bookmark = freshID() as Bookmark;
    const savedAt: Date = new Date();
    await this.bookmarks.insertOne({ _id: bookmark, user, item, savedAt });
    return { bookmark };
  }

  /**
   * unsave (user: User, item: Item): (bookmark: Bookmark)
   *
   * **requires** a Bookmark exists for the given `user` and `item`
   *
   * **effects** removes that Bookmark from the state; returns the removed
   * `bookmark`
   */
  async unsave({
    user,
    item,
  }: {
    user: User;
    item: Item;
  }): Promise<
    { bookmark: Bookmark } | { error: ForumErrorCode; detail?: string }
  > {
    const doc = await this.bookmarks.findOne({ user, item });
    if (doc === null) {
      return { error: ForumErrorCode.BOOKMARK_NOT_FOUND };
    }
    await this.bookmarks.deleteOne({ _id: doc._id });
    return { bookmark: doc._id };
  }

  /**
   * _getSaved (user: User): (saved: {item: Item, savedAt: DateTime})
   *
   * **requires** true
   *
   * **effects** returns every item the given `user` has saved, each with its
   * item and savedAt time, newest-first
   */
  async _getSaved({
    user,
  }: {
    user: User;
  }): Promise<{ item: Item; savedAt: Date }[]> {
    const docs = await this.bookmarks
      .find({ user })
      .sort({ savedAt: -1, _id: -1 })
      .toArray();
    return docs.map((d) => ({ item: d.item, savedAt: d.savedAt }));
  }

  /**
   * _isSaved (user: User, item: Item): (saved: Flag)
   *
   * **requires** true
   *
   * **effects** returns a single result whose `saved` is true iff a Bookmark
   * exists for the given `user` and `item`
   */
  async _isSaved({
    user,
    item,
  }: {
    user: User;
    item: Item;
  }): Promise<{ saved: boolean }[]> {
    const doc = await this.bookmarks.findOne({ user, item });
    return [{ saved: doc !== null }];
  }
}
