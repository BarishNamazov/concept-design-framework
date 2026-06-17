import { collectionName, freshID } from "@utils/database.ts";
import type { ID } from "@utils/types.ts";
import type { Collection, Db } from "mongodb";
import { ForumErrorCode } from "../../sdk/error-codes.ts";

// Generic types of this concept.
type Item = ID;
type Category = ID;

/**
 * a set of Categories with
 *   a name String
 *   a description String
 *
 * Invariant: category names are unique across the set of Categories.
 */
interface CategoryDoc {
  _id: Category;
  name: string;
  description: string;
}

/**
 * a set of Memberships with
 *   an item Item
 *   a category Category
 *
 * Invariant: at most one Membership exists per item (single home). The item id
 * is used as the Mongo `_id`, enforcing this directly.
 */
interface MembershipDoc {
  _id: Item;
  category: Category;
}

/**
 * concept: Categorizing [Item, Category]
 *
 * purpose: give each item a single home section so the forum can be browsed by
 * area (e.g. "Logistics", "HW1", "Exams").
 */
export default class CategorizingConcept {
  private readonly categories: Collection<CategoryDoc>;
  private readonly memberships: Collection<MembershipDoc>;

  constructor(
    private readonly db: Db,
    namespace = "Categorizing",
  ) {
    this.categories = this.db.collection(
      collectionName(namespace, "categories"),
    );
    this.memberships = this.db.collection(
      collectionName(namespace, "memberships"),
    );
  }

  /**
   * createCategory (name: String, description: String): (category: Category)
   *
   * **requires** no Category with the given `name` exists
   *
   * **effects** creates a fresh Category `c` with the given `name` and
   * `description`; returns `c` as `category`
   */
  async createCategory({
    name,
    description,
  }: {
    name: string;
    description: string;
  }): Promise<
    { category: Category } | { error: ForumErrorCode; detail?: string }
  > {
    const existing = await this.categories.findOne({ name });
    if (existing !== null) {
      return { error: ForumErrorCode.CATEGORY_ALREADY_EXISTS, detail: name };
    }
    const category = freshID() as Category;
    await this.categories.insertOne({ _id: category, name, description });
    return { category };
  }

  /**
   * assign (item: Item, category: Category): (item: Item)
   *
   * **requires** the `category` exists
   *
   * **effects** sets the item's single home to `category`, replacing any prior
   * Membership for `item`; returns `item`
   */
  async assign({
    item,
    category,
  }: {
    item: Item;
    category: Category;
  }): Promise<{ item: Item } | { error: ForumErrorCode; detail?: string }> {
    const categoryDoc = await this.categories.findOne({ _id: category });
    if (categoryDoc === null) {
      return { error: ForumErrorCode.CATEGORY_NOT_FOUND };
    }
    await this.memberships.updateOne(
      { _id: item },
      { $set: { category } },
      { upsert: true },
    );
    return { item };
  }

  /**
   * unassign (item: Item): (item: Item)
   *
   * **requires** the `item` currently has a Membership
   *
   * **effects** removes the item's Membership; returns `item`
   */
  async unassign({
    item,
  }: {
    item: Item;
  }): Promise<{ item: Item } | { error: ForumErrorCode; detail?: string }> {
    const doc = await this.memberships.findOne({ _id: item });
    if (doc === null) {
      return { error: ForumErrorCode.ITEM_NOT_CATEGORIZED };
    }
    await this.memberships.deleteOne({ _id: item });
    return { item };
  }

  /**
   * deleteCategory (category: Category): (category: Category)
   *
   * **requires** the `category` exists
   *
   * **effects** removes the Category and every Membership pointing at it;
   * returns the deleted `category`
   */
  async deleteCategory({
    category,
  }: {
    category: Category;
  }): Promise<
    { category: Category } | { error: ForumErrorCode; detail?: string }
  > {
    const categoryDoc = await this.categories.findOne({ _id: category });
    if (categoryDoc === null) {
      return { error: ForumErrorCode.CATEGORY_NOT_FOUND };
    }
    await this.memberships.deleteMany({ category });
    await this.categories.deleteOne({ _id: category });
    return { category };
  }

  /**
   * _getCategory (item: Item): (home: {category: Category, name: String, description: String})
   *
   * **requires** true
   *
   * **effects** returns the item's home Category (zero or one), with its id,
   * name and description
   */
  async _getCategory({
    item,
  }: {
    item: Item;
  }): Promise<{ category: Category; name: string; description: string }[]> {
    const membership = await this.memberships.findOne({ _id: item });
    if (membership === null) {
      return [];
    }
    const categoryDoc = await this.categories.findOne({
      _id: membership.category,
    });
    if (categoryDoc === null) {
      return [];
    }
    return [
      {
        category: categoryDoc._id,
        name: categoryDoc.name,
        description: categoryDoc.description,
      },
    ];
  }

  /**
   * _getItems (category: Category): (item: Item)
   *
   * **requires** true
   *
   * **effects** returns every Item whose home is the given `category`
   */
  async _getItems({
    category,
  }: {
    category: Category;
  }): Promise<{ item: Item }[]> {
    const docs = await this.memberships.find({ category }).toArray();
    return docs.map((d) => ({ item: d._id }));
  }

  /**
   * _getCategoryByName (name: String): (category: Category)
   *
   * **requires** true
   *
   * **effects** returns the Category (zero or one) whose name equals `name`
   */
  async _getCategoryByName({
    name,
  }: {
    name: string;
  }): Promise<{ category: Category }[]> {
    const doc = await this.categories.findOne({ name });
    return doc === null ? [] : [{ category: doc._id }];
  }

  /**
   * _getAllCategories (): (category: {category: Category, name: String, description: String})
   *
   * **requires** true
   *
   * **effects** returns every Category with its id, name and description
   */
  async _getAllCategories(): Promise<
    { category: Category; name: string; description: string }[]
  > {
    const docs = await this.categories.find({}).toArray();
    return docs.map((d) => ({
      category: d._id,
      name: d.name,
      description: d.description,
    }));
  }
}
