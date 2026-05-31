import { collectionName, freshID } from "@utils/database.ts";
import type { ID } from "@utils/types.ts";
import type { Collection, Db } from "mongodb";

// Generic types of this concept.
type User = ID;
type Session = ID;

/**
 * a set of Sessions with
 *   a user User
 *   a createdAt DateTime
 *   an optional expiresAt DateTime
 *
 * A Session is active when it exists and, if it has an `expiresAt`, the current
 * time is before `expiresAt`.
 */
interface SessionDoc {
  _id: Session;
  user: User;
  createdAt: Date;
  expiresAt?: Date;
}

/**
 * concept: Sessioning [User]
 *
 * purpose: keep a user signed in across many requests so they need not present
 * their credentials each time.
 */
export default class SessioningConcept {
  private readonly sessions: Collection<SessionDoc>;

  constructor(
    private readonly db: Db,
    namespace = "Sessioning",
  ) {
    this.sessions = this.db.collection(collectionName(namespace, "sessions"));
  }

  /**
   * start (user: User): (session: Session)
   *
   * **requires** true
   *
   * **effects** creates a fresh Session `s`; sets the user of `s` to `user`, its
   * `createdAt` to the current time, and leaves `expiresAt` unset; returns `s`
   * as `session`
   */
  async start({ user }: { user: User }): Promise<{ session: Session }> {
    const session = freshID() as Session;
    await this.sessions.insertOne({
      _id: session,
      user,
      createdAt: new Date(),
    });
    return { session };
  }

  /**
   * startWithExpiry (user: User, expiresAt: DateTime): (session: Session)
   *
   * **requires** `expiresAt` is after the current time
   *
   * **effects** creates a fresh Session `s`; sets the user of `s` to `user`, its
   * `createdAt` to the current time, and its `expiresAt` to `expiresAt`; returns
   * `s` as `session`
   */
  async startWithExpiry({
    user,
    expiresAt,
  }: {
    user: User;
    expiresAt: Date;
  }): Promise<{ session: Session } | { error: string }> {
    if (!(expiresAt.getTime() > Date.now())) {
      return { error: "expiresAt must be after the current time." };
    }
    const session = freshID() as Session;
    await this.sessions.insertOne({
      _id: session,
      user,
      createdAt: new Date(),
      expiresAt,
    });
    return { session };
  }

  /**
   * end (session: Session): (session: Session)
   *
   * **requires** a Session with the given id exists
   *
   * **effects** removes the Session from the state; returns the ended `session`
   *
   * end (session: Session): (error: String)
   *
   * **requires** no Session with the given id exists
   *
   * **effects** returns an explanatory `error`; state is unchanged
   */
  async end({
    session,
  }: {
    session: Session;
  }): Promise<{ session: Session } | { error: string }> {
    const { deletedCount } = await this.sessions.deleteOne({ _id: session });
    if (deletedCount === 0) {
      return { error: "Session not found." };
    }
    return { session };
  }

  /**
   * endAllForUser (user: User): (user: User)
   *
   * **requires** true
   *
   * **effects** removes every Session whose user is `user`; returns `user`
   */
  async endAllForUser({ user }: { user: User }): Promise<{ user: User }> {
    await this.sessions.deleteMany({ user });
    return { user };
  }

  /**
   * system expire (session: Session): (session: Session)
   *
   * **requires** the Session exists, has an `expiresAt`, and the current time is
   * at or after `expiresAt`
   *
   * **effects** removes the Session from the state; returns the expired
   * `session`
   */
  async expire({
    session,
  }: {
    session: Session;
  }): Promise<{ session: Session } | { error: string }> {
    const doc = await this.sessions.findOne({ _id: session });
    if (
      doc === null ||
      doc.expiresAt === undefined ||
      doc.expiresAt.getTime() > Date.now()
    ) {
      return { error: "Session is not expired." };
    }
    await this.sessions.deleteOne({ _id: session });
    return { session };
  }

  /**
   * _getUser (session: Session): (user: User)
   *
   * **requires** the Session exists and is active
   *
   * **effects** returns the user of the given active Session (zero results if it
   * does not exist or is not active)
   */
  async _getUser({ session }: { session: Session }): Promise<{ user: User }[]> {
    const doc = await this.sessions.findOne({ _id: session });
    if (doc === null || !this.isActive(doc)) {
      return [];
    }
    return [{ user: doc.user }];
  }

  /**
   * _getSessionsForUser (user: User): (session: Session)
   *
   * **requires** true
   *
   * **effects** returns every active Session whose user is `user`
   */
  async _getSessionsForUser({
    user,
  }: {
    user: User;
  }): Promise<{ session: Session }[]> {
    const docs = await this.sessions.find({ user }).toArray();
    return docs
      .filter((doc) => this.isActive(doc))
      .map((doc) => ({
        session: doc._id,
      }));
  }

  /**
   * _isActive (session: Session): (active: Flag)
   *
   * **requires** true
   *
   * **effects** returns a single result whose `active` is true iff a Session with
   * the given id exists and is active
   */
  async _isActive({
    session,
  }: {
    session: Session;
  }): Promise<{ active: boolean }[]> {
    const doc = await this.sessions.findOne({ _id: session });
    return [{ active: doc !== null && this.isActive(doc) }];
  }

  private isActive(doc: SessionDoc): boolean {
    return doc.expiresAt === undefined || doc.expiresAt.getTime() > Date.now();
  }
}
