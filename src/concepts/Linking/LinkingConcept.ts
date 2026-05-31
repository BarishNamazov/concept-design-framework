import { Collection, Db } from "mongodb";
import { collectionName, freshID } from "@utils/database.ts";
import type { ID } from "@utils/types.ts";

// Generic types of this concept.
type Item = ID;
type Link = ID;

/**
 * a set of Links with
 *   a source Item
 *   a target Item
 *   a createdAt DateTime
 *
 * Invariant: at most one Link exists for a given (`source`, `target`) pair.
 */
interface LinkDoc {
  _id: Link;
  source: Item;
  target: Item;
  createdAt: Date;
}

/**
 * concept: Linking [Item]
 *
 * purpose: maintain a directed reference graph between items so that, given any
 * item, one can find both what it points to and what points back to it.
 */
export default class LinkingConcept {
  private readonly links: Collection<LinkDoc>;

  constructor(private readonly db: Db, namespace = "Linking") {
    this.links = this.db.collection(collectionName(namespace, "links"));
  }

  /**
   * link (source: Item, target: Item): (link: Link)
   *
   * **requires** no Link exists with the given `source` and `target`
   *
   * **effects** creates a fresh Link `l` with the given `source` and `target`,
   * and `createdAt` the current time; returns `l` as `link`
   */
  async link(
    { source, target }: { source: Item; target: Item },
  ): Promise<{ link: Link } | { error: string }> {
    const existing = await this.links.findOne({ source, target });
    if (existing !== null) {
      return { error: "Link already exists for this source and target." };
    }
    const link = freshID() as Link;
    await this.links.insertOne({
      _id: link,
      source,
      target,
      createdAt: new Date(),
    });
    return { link };
  }

  /**
   * unlink (source: Item, target: Item): (link: Link)
   *
   * **requires** a Link exists with the given `source` and `target`
   *
   * **effects** removes that Link from the state; returns the removed `link`
   */
  async unlink(
    { source, target }: { source: Item; target: Item },
  ): Promise<{ link: Link } | { error: string }> {
    const doc = await this.links.findOne({ source, target });
    if (doc === null) {
      return { error: "No Link exists for this source and target." };
    }
    await this.links.deleteOne({ _id: doc._id });
    return { link: doc._id };
  }

  /**
   * setLinks (source: Item, targets: set of Item): (source: Item)
   *
   * **requires** true
   *
   * **effects** replaces all Links whose source is `source` so that, afterward,
   * there is exactly one Link from `source` to each item in `targets` and no
   * others (links to items no longer in `targets` are removed; links to newly
   * listed items are created with `createdAt` the current time); returns
   * `source`
   */
  async setLinks(
    { source, targets }: { source: Item; targets: Item[] },
  ): Promise<{ source: Item }> {
    const desired = new Set(targets);
    const existing = await this.links.find({ source }).toArray();
    const existingTargets = new Set(existing.map((l) => l.target));

    const toRemove = existing.filter((l) => !desired.has(l.target));
    if (toRemove.length > 0) {
      await this.links.deleteMany({
        _id: { $in: toRemove.map((l) => l._id) },
      });
    }

    const now = new Date();
    const toAdd = [...desired]
      .filter((t) => !existingTargets.has(t))
      .map((target) => ({
        _id: freshID() as Link,
        source,
        target,
        createdAt: now,
      }));
    if (toAdd.length > 0) {
      await this.links.insertMany(toAdd);
    }
    return { source };
  }

  /**
   * clearLinks (source: Item): (source: Item)
   *
   * **requires** true
   *
   * **effects** removes every Link whose source is `source`; returns `source`
   */
  async clearLinks(
    { source }: { source: Item },
  ): Promise<{ source: Item }> {
    await this.links.deleteMany({ source });
    return { source };
  }

  /**
   * _getForwardLinks (source: Item): (target: Item)
   *
   * **requires** true
   *
   * **effects** returns the target of every Link whose source is `source`
   */
  async _getForwardLinks(
    { source }: { source: Item },
  ): Promise<{ target: Item }[]> {
    const docs = await this.links.find({ source }).toArray();
    return docs.map((l) => ({ target: l.target }));
  }

  /**
   * _getBacklinks (target: Item): (source: Item)
   *
   * **requires** true
   *
   * **effects** returns the source of every Link whose target is `target`
   */
  async _getBacklinks(
    { target }: { target: Item },
  ): Promise<{ source: Item }[]> {
    const docs = await this.links.find({ target }).toArray();
    return docs.map((l) => ({ source: l.source }));
  }

  /**
   * _hasLink (source: Item, target: Item): (linked: Flag)
   *
   * **requires** true
   *
   * **effects** returns a single result whose `linked` is true iff a Link
   * exists with the given `source` and `target`
   */
  async _hasLink(
    { source, target }: { source: Item; target: Item },
  ): Promise<{ linked: boolean }[]> {
    const doc = await this.links.findOne({ source, target });
    return [{ linked: doc !== null }];
  }

  /**
   * _getOutgoingCount (source: Item): (count: Number)
   *
   * **requires** true
   *
   * **effects** returns a single result with the number of Links whose source
   * is `source`
   */
  async _getOutgoingCount(
    { source }: { source: Item },
  ): Promise<{ count: number }[]> {
    const count = await this.links.countDocuments({ source });
    return [{ count }];
  }

  /**
   * _getBacklinkCount (target: Item): (count: Number)
   *
   * **requires** true
   *
   * **effects** returns a single result with the number of Links whose target
   * is `target`
   */
  async _getBacklinkCount(
    { target }: { target: Item },
  ): Promise<{ count: number }[]> {
    const count = await this.links.countDocuments({ target });
    return [{ count }];
  }
}
