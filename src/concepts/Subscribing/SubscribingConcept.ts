import { collectionName, freshID } from "@utils/database.ts";
import type { ID } from "@utils/types.ts";
import type { Collection, Db } from "mongodb";
import { ForumErrorCode } from "../../sdk/error-codes.ts";

// Generic types of this concept.
type User = ID;
type Target = ID;
type Subscription = ID;

/**
 * a set of Subscriptions with
 *   a user User
 *   a target Target
 *   a createdAt DateTime
 *
 * Invariant: at most one Subscription exists for a given (`user`, `target`)
 * pair.
 */
interface SubscriptionDoc {
  _id: Subscription;
  user: User;
  target: Target;
  createdAt: Date;
}

/**
 * concept: Subscribing [User, Target]
 *
 * purpose: record a user's standing interest in a target so that future events
 * on that target can be routed to them.
 */
export default class SubscribingConcept {
  private readonly subscriptions: Collection<SubscriptionDoc>;

  constructor(
    private readonly db: Db,
    namespace = "Subscribing",
  ) {
    this.subscriptions = this.db.collection(
      collectionName(namespace, "subscriptions"),
    );
  }

  /**
   * subscribe (user: User, target: Target): (subscription: Subscription)
   *
   * **requires** no Subscription exists for the given `user` and `target`
   *
   * **effects** creates a fresh Subscription `s` with the given `user` and
   * `target`, and `createdAt` the current time; returns `s` as `subscription`
   */
  async subscribe({
    user,
    target,
  }: {
    user: User;
    target: Target;
  }): Promise<
    { subscription: Subscription } | { error: ForumErrorCode; detail?: string }
  > {
    const existing = await this.subscriptions.findOne({ user, target });
    if (existing !== null) {
      return { error: ForumErrorCode.ALREADY_SUBSCRIBED };
    }
    const subscription = freshID() as Subscription;
    await this.subscriptions.insertOne({
      _id: subscription,
      user,
      target,
      createdAt: new Date(),
    });
    return { subscription };
  }

  /**
   * unsubscribe (user: User, target: Target): (subscription: Subscription)
   *
   * **requires** a Subscription exists for the given `user` and `target`
   *
   * **effects** removes that Subscription from the state; returns the removed
   * `subscription`
   */
  async unsubscribe({
    user,
    target,
  }: {
    user: User;
    target: Target;
  }): Promise<
    { subscription: Subscription } | { error: ForumErrorCode; detail?: string }
  > {
    const doc = await this.subscriptions.findOne({ user, target });
    if (doc === null) {
      return { error: ForumErrorCode.NOT_SUBSCRIBED };
    }
    await this.subscriptions.deleteOne({ _id: doc._id });
    return { subscription: doc._id };
  }

  /**
   * _getSubscribers (target: Target): (user: User)
   *
   * **requires** true
   *
   * **effects** returns every User subscribed to the given `target`
   */
  async _getSubscribers({
    target,
  }: {
    target: Target;
  }): Promise<{ user: User }[]> {
    const docs = await this.subscriptions.find({ target }).toArray();
    return docs.map((d) => ({ user: d.user }));
  }

  /**
   * _getSubscriptions (user: User): (target: Target, createdAt: DateTime)
   *
   * **requires** true
   *
   * **effects** returns every Target the given `user` follows, each with the
   * time it was subscribed, ordered newest-first
   */
  async _getSubscriptions({
    user,
  }: {
    user: User;
  }): Promise<{ target: Target; createdAt: Date }[]> {
    const docs = await this.subscriptions
      .find({ user })
      .sort({ createdAt: -1, _id: -1 })
      .toArray();
    return docs.map((d) => ({ target: d.target, createdAt: d.createdAt }));
  }

  /**
   * _isSubscribed (user: User, target: Target): (subscribed: Flag)
   *
   * **requires** true
   *
   * **effects** returns a single result whose `subscribed` is true iff a
   * Subscription exists for the given `user` and `target`
   */
  async _isSubscribed({
    user,
    target,
  }: {
    user: User;
    target: Target;
  }): Promise<{ subscribed: boolean }[]> {
    const doc = await this.subscriptions.findOne({ user, target });
    return [{ subscribed: doc !== null }];
  }
}
