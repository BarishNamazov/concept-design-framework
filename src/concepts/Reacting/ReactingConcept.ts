import { Collection, Db } from "mongodb";
import { freshID } from "@utils/database.ts";
import type { ID } from "@utils/types.ts";

// Declare collection prefix, use concept name.
const PREFIX = "Reacting" + ".";

// Generic types of this concept.
type User = ID;
type Target = ID;
type Reaction = ID;

/**
 * a set of Reactions with
 *   a user User
 *   a target Target
 *   a kind String
 *   a createdAt DateTime
 *
 * Invariant: at most one Reaction exists for a given (`user`, `target`, `kind`)
 * triple.
 */
interface ReactionDoc {
  _id: Reaction;
  user: User;
  target: Target;
  kind: string;
  createdAt: Date;
}

/**
 * concept: Reacting [User, Target]
 *
 * purpose: let users register a lightweight, named response (such as a like or
 * an emoji) to a target so that crowd sentiment toward that target can be
 * gauged.
 */
export default class ReactingConcept {
  private readonly reactions: Collection<ReactionDoc>;

  constructor(private readonly db: Db) {
    this.reactions = this.db.collection(PREFIX + "reactions");
  }

  /**
   * react (user: User, target: Target, kind: String): (reaction: Reaction)
   *
   * **requires** no Reaction exists with the given `user`, `target` and `kind`
   *
   * **effects** creates a fresh Reaction `r` with the given `user`, `target`
   * and `kind`, and `createdAt` the current time; returns `r` as `reaction`
   */
  async react(
    { user, target, kind }: { user: User; target: Target; kind: string },
  ): Promise<{ reaction: Reaction } | { error: string }> {
    const existing = await this.reactions.findOne({ user, target, kind });
    if (existing !== null) {
      return {
        error: "Reaction already exists for this user, target and kind.",
      };
    }
    const reaction = freshID() as Reaction;
    await this.reactions.insertOne({
      _id: reaction,
      user,
      target,
      kind,
      createdAt: new Date(),
    });
    return { reaction };
  }

  /**
   * unreact (user: User, target: Target, kind: String): (reaction: Reaction)
   *
   * **requires** a Reaction exists with the given `user`, `target` and `kind`
   *
   * **effects** removes that Reaction from the state; returns the removed
   * `reaction`
   */
  async unreact(
    { user, target, kind }: { user: User; target: Target; kind: string },
  ): Promise<{ reaction: Reaction } | { error: string }> {
    const doc = await this.reactions.findOne({ user, target, kind });
    if (doc === null) {
      return { error: "No matching reaction to remove." };
    }
    await this.reactions.deleteOne({ _id: doc._id });
    return { reaction: doc._id };
  }

  /**
   * _getReactionsForTarget (target: Target): (reaction: {reaction: Reaction, user: User, kind: String})
   *
   * **requires** true
   *
   * **effects** returns every Reaction on the given `target`, each with its
   * reaction id, user and kind
   */
  async _getReactionsForTarget(
    { target }: { target: Target },
  ): Promise<{ reaction: Reaction; user: User; kind: string }[]> {
    const docs = await this.reactions.find({ target }).toArray();
    return docs.map((d) => ({ reaction: d._id, user: d.user, kind: d.kind }));
  }

  /**
   * _getReactionsByUser (user: User): (reaction: {reaction: Reaction, target: Target, kind: String})
   *
   * **requires** true
   *
   * **effects** returns every Reaction by the given `user`, each with its
   * reaction id, target and kind
   */
  async _getReactionsByUser(
    { user }: { user: User },
  ): Promise<{ reaction: Reaction; target: Target; kind: string }[]> {
    const docs = await this.reactions.find({ user }).toArray();
    return docs.map((d) => ({
      reaction: d._id,
      target: d.target,
      kind: d.kind,
    }));
  }

  /**
   * _countByKind (target: Target): (kind: String, count: Number)
   *
   * **requires** true
   *
   * **effects** returns, for each `kind` present on the given `target`, the
   * number of Reactions of that kind
   */
  async _countByKind(
    { target }: { target: Target },
  ): Promise<{ kind: string; count: number }[]> {
    const docs = await this.reactions.find({ target }).toArray();
    const counts = new Map<string, number>();
    for (const d of docs) {
      counts.set(d.kind, (counts.get(d.kind) ?? 0) + 1);
    }
    return [...counts].map(([kind, count]) => ({ kind, count }));
  }

  /**
   * _hasReacted (user: User, target: Target, kind: String): (hasReacted: Flag)
   *
   * **requires** true
   *
   * **effects** returns a single result whose `hasReacted` is true iff a
   * Reaction exists with the given `user`, `target` and `kind`
   */
  async _hasReacted(
    { user, target, kind }: { user: User; target: Target; kind: string },
  ): Promise<{ hasReacted: boolean }[]> {
    const doc = await this.reactions.findOne({ user, target, kind });
    return [{ hasReacted: doc !== null }];
  }
}
