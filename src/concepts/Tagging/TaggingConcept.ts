import { Collection, Db } from "mongodb";
import { collectionName, freshID } from "@utils/database.ts";
import type { ID } from "@utils/types.ts";

// Generic types of this concept.
type Target = ID;
type Tag = ID;

/**
 * a set of Tags with
 *   a name String
 *
 * Invariant: tag names are unique across the set of Tags.
 */
interface TagDoc {
  _id: Tag;
  name: string;
}

/**
 * a set of Targets with
 *   a tags set of Tag
 *
 * A Target appears in this set once it has at least one tag.
 */
interface TargetDoc {
  _id: Target;
  tags: Tag[];
}

/**
 * concept: Tagging [Target]
 *
 * purpose: classify targets with shared, reusable labels so that all targets
 * bearing a given label can be found together.
 */
export default class TaggingConcept {
  private readonly tags: Collection<TagDoc>;
  private readonly targets: Collection<TargetDoc>;

  constructor(private readonly db: Db, namespace = "Tagging") {
    this.tags = this.db.collection(collectionName(namespace, "tags"));
    this.targets = this.db.collection(collectionName(namespace, "targets"));
  }

  /**
   * createTag (name: String): (tag: Tag)
   *
   * **requires** no Tag with the given `name` exists
   *
   * **effects** creates a fresh Tag `t` with the given `name`; returns `t` as
   * `tag`
   */
  async createTag(
    { name }: { name: string },
  ): Promise<{ tag: Tag } | { error: string }> {
    const existing = await this.tags.findOne({ name });
    if (existing !== null) {
      return { error: `Tag "${name}" already exists.` };
    }
    const tag = freshID() as Tag;
    await this.tags.insertOne({ _id: tag, name });
    return { tag };
  }

  /**
   * addTag (target: Target, tag: Tag): (target: Target)
   *
   * **requires** the `tag` exists and is not already in the tags of `target`
   *
   * **effects** adds `tag` to the tags of `target` (adding `target` to the set
   * if it was absent); returns `target`
   */
  async addTag(
    { target, tag }: { target: Target; tag: Tag },
  ): Promise<{ target: Target } | { error: string }> {
    const tagDoc = await this.tags.findOne({ _id: tag });
    if (tagDoc === null) {
      return { error: "Tag does not exist." };
    }
    const targetDoc = await this.targets.findOne({ _id: target });
    if (targetDoc !== null && targetDoc.tags.includes(tag)) {
      return { error: "Tag is already applied to this target." };
    }
    await this.targets.updateOne(
      { _id: target },
      { $addToSet: { tags: tag } },
      { upsert: true },
    );
    return { target };
  }

  /**
   * removeTag (target: Target, tag: Tag): (target: Target)
   *
   * **requires** `tag` is in the tags of `target`
   *
   * **effects** removes `tag` from the tags of `target` (removing `target` from
   * the set if it now has no tags); returns `target`
   */
  async removeTag(
    { target, tag }: { target: Target; tag: Tag },
  ): Promise<{ target: Target } | { error: string }> {
    const targetDoc = await this.targets.findOne({ _id: target });
    if (targetDoc === null || !targetDoc.tags.includes(tag)) {
      return { error: "Tag is not applied to this target." };
    }
    const remaining = targetDoc.tags.filter((t) => t !== tag);
    if (remaining.length === 0) {
      await this.targets.deleteOne({ _id: target });
    } else {
      await this.targets.updateOne(
        { _id: target },
        { $set: { tags: remaining } },
      );
    }
    return { target };
  }

  /**
   * deleteTag (tag: Tag): (tag: Tag)
   *
   * **requires** the `tag` exists
   *
   * **effects** removes `tag` from the tags of every Target and removes the Tag
   * itself from the state; returns the deleted `tag`
   */
  async deleteTag(
    { tag }: { tag: Tag },
  ): Promise<{ tag: Tag } | { error: string }> {
    const tagDoc = await this.tags.findOne({ _id: tag });
    if (tagDoc === null) {
      return { error: "Tag does not exist." };
    }
    await this.targets.updateMany({ tags: tag }, { $pull: { tags: tag } });
    await this.targets.deleteMany({ tags: { $size: 0 } });
    await this.tags.deleteOne({ _id: tag });
    return { tag };
  }

  /**
   * clearTarget (target: Target): (target: Target)
   *
   * **requires** true
   *
   * **effects** removes the given `target` from the set of Targets, so it no
   * longer bears any tags (the Tags themselves are left intact); returns
   * `target`
   */
  async clearTarget(
    { target }: { target: Target },
  ): Promise<{ target: Target }> {
    await this.targets.deleteOne({ _id: target });
    return { target };
  }

  /**
   * _getTags (target: Target): (tag: {tag: Tag, name: String})
   *
   * **requires** true
   *
   * **effects** returns every Tag applied to the given `target`, each with its
   * tag id and name
   */
  async _getTags(
    { target }: { target: Target },
  ): Promise<{ tag: Tag; name: string }[]> {
    const targetDoc = await this.targets.findOne({ _id: target });
    if (targetDoc === null) {
      return [];
    }
    const docs = await this.tags.find({ _id: { $in: targetDoc.tags } })
      .toArray();
    return docs.map((d) => ({ tag: d._id, name: d.name }));
  }

  /**
   * _getTargets (tag: Tag): (target: Target)
   *
   * **requires** true
   *
   * **effects** returns every Target that has the given `tag`
   */
  async _getTargets(
    { tag }: { tag: Tag },
  ): Promise<{ target: Target }[]> {
    const docs = await this.targets.find({ tags: tag }).toArray();
    return docs.map((d) => ({ target: d._id }));
  }

  /**
   * _getTagByName (name: String): (tag: Tag)
   *
   * **requires** true
   *
   * **effects** returns the Tag (zero or one) whose name equals `name`
   */
  async _getTagByName(
    { name }: { name: string },
  ): Promise<{ tag: Tag }[]> {
    const doc = await this.tags.findOne({ name });
    return doc === null ? [] : [{ tag: doc._id }];
  }

  /**
   * _getAllTags (): (tag: {tag: Tag, name: String})
   *
   * **requires** true
   *
   * **effects** returns every Tag with its id and name
   */
  async _getAllTags(): Promise<{ tag: Tag; name: string }[]> {
    const docs = await this.tags.find({}).toArray();
    return docs.map((d) => ({ tag: d._id, name: d.name }));
  }
}
