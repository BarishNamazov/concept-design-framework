import { collectionName, freshID } from "@utils/database.ts";
import type { ID } from "@utils/types.ts";
import type { Collection, Db } from "mongodb";
import { ForumErrorCode } from "../../sdk/error-codes.ts";

// Generic types of this concept.
type User = ID;

const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS) || 12;
const USERNAME_ALLOWED_RE = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

/**
 * a set of Users with
 *   a username String
 *   a password String (bcrypt hash)
 *   an email String
 *
 * Invariant: usernames are unique across the set of Users.
 */
interface UserDoc {
  _id: User;
  username: string;
  password: string;
  email: string;
}

/**
 * concept: Authenticating
 *
 * purpose: let a person establish and later prove a persistent identity within
 * the system.
 */
export default class AuthenticatingConcept {
  private readonly users: Collection<UserDoc>;

  constructor(
    private readonly db: Db,
    namespace = "Authenticating",
  ) {
    this.users = this.db.collection(collectionName(namespace, "users"));
  }

  /**
   * register (username: String, password: String, email: String): (user: User)
   *
   * **requires** no User with the given `username` exists, `email` is non-empty
   * and contains `@`, username is 3-32 chars starting with a letter using only
   * `[a-zA-Z0-9_-]`, password is 8-128 chars
   *
   * **effects** creates a fresh User `u`; sets the username of `u` to `username`,
   * the bcrypt hash of `password` as the password, and the email of `u` to `email`;
   * returns `u` as `user`
   */
  async register({
    username,
    password,
    email,
  }: {
    username: string;
    password: string;
    email: string;
  }): Promise<{ user: User } | { error: ForumErrorCode; detail?: string }> {
    if (!email?.includes("@")) {
      return { error: ForumErrorCode.INVALID_BODY };
    }
    if (username.length < 3 || username.length > 32) {
      return {
        error: ForumErrorCode.USERNAME_INVALID_LENGTH,
        detail: username,
      };
    }
    if (!USERNAME_ALLOWED_RE.test(username)) {
      return {
        error: ForumErrorCode.USERNAME_INVALID_CHARS,
        detail: username,
      };
    }
    if (password.length < 8 || password.length > 128) {
      return {
        error: ForumErrorCode.PASSWORD_TOO_SHORT,
        detail: "Must be 8-128 characters",
      };
    }
    const existing = await this.users.findOne({ username });
    if (existing !== null) {
      return { error: ForumErrorCode.USERNAME_TAKEN, detail: username };
    }
    const user = freshID() as User;
    const hashed = await Bun.password.hash(password, {
      algorithm: "bcrypt",
      cost: BCRYPT_ROUNDS,
    });
    await this.users.insertOne({
      _id: user,
      username,
      password: hashed,
      email,
    });
    return { user };
  }

  /**
   * authenticate (username: String, password: String): (user: User)
   *
   * **requires** a User with the given `username` exists and its password
   * equals `password`
   *
   * **effects** none; returns the matching User as `user`
   */
  async authenticate({
    username,
    password,
  }: {
    username: string;
    password: string;
  }): Promise<{ user: User } | { error: ForumErrorCode; detail?: string }> {
    const doc = await this.users.findOne({ username });
    if (doc === null) {
      return { error: ForumErrorCode.INVALID_CREDENTIALS };
    }

    if (doc.password.startsWith("$2")) {
      if (!(await Bun.password.verify(password, doc.password))) {
        return { error: ForumErrorCode.INVALID_CREDENTIALS };
      }
    } else {
      if (doc.password !== password) {
        return { error: ForumErrorCode.INVALID_CREDENTIALS };
      }
      const hashed = await Bun.password.hash(password, {
        algorithm: "bcrypt",
        cost: BCRYPT_ROUNDS,
      });
      await this.users.updateOne(
        { _id: doc._id },
        { $set: { password: hashed } },
      );
    }

    return { user: doc._id };
  }

  /**
   * changePassword (user: User, oldPassword: String, newPassword: String): (user: User)
   *
   * **requires** the given `user` exists and its password equals `oldPassword`,
   * `newPassword` is 8-128 chars
   *
   * **effects** sets the password of `user` to the bcrypt hash of `newPassword`;
   * returns `user`
   */
  async changePassword({
    user,
    oldPassword,
    newPassword,
  }: {
    user: User;
    oldPassword: string;
    newPassword: string;
  }): Promise<{ user: User } | { error: ForumErrorCode; detail?: string }> {
    const doc = await this.users.findOne({ _id: user });
    if (doc === null) {
      return { error: ForumErrorCode.NOT_FOUND };
    }
    let validOld = false;
    if (doc.password.startsWith("$2")) {
      validOld = await Bun.password.verify(oldPassword, doc.password);
    } else {
      validOld = doc.password === oldPassword;
    }
    if (!validOld) {
      return { error: ForumErrorCode.INVALID_CREDENTIALS };
    }
    if (newPassword.length < 8 || newPassword.length > 128) {
      return {
        error: ForumErrorCode.PASSWORD_TOO_SHORT,
        detail: "Must be 8-128 characters",
      };
    }
    const hashed = await Bun.password.hash(newPassword, {
      algorithm: "bcrypt",
      cost: BCRYPT_ROUNDS,
    });
    await this.users.updateOne({ _id: user }, { $set: { password: hashed } });
    return { user };
  }

  /**
   * changeUsername (user: User, username: String): (user: User)
   *
   * **requires** the given `user` exists and no other User has the given
   * `username`
   *
   * **effects** sets the username of `user` to `username`; returns `user`
   */
  async changeUsername({
    user,
    username,
  }: {
    user: User;
    username: string;
  }): Promise<{ user: User } | { error: ForumErrorCode; detail?: string }> {
    const doc = await this.users.findOne({ _id: user });
    if (doc === null) {
      return { error: ForumErrorCode.NOT_FOUND };
    }
    const clash = await this.users.findOne({ username });
    if (clash !== null && clash._id !== user) {
      return { error: ForumErrorCode.USERNAME_TAKEN, detail: username };
    }
    await this.users.updateOne({ _id: user }, { $set: { username } });
    return { user };
  }

  /**
   * changeEmail (user: User, email: String): (user: User)
   *
   * **requires** the given `user` exists, `email` is non-empty and contains `@`
   *
   * **effects** sets the email of `user` to `email`; returns `user`
   */
  async changeEmail({
    user,
    email,
  }: {
    user: User;
    email: string;
  }): Promise<{ user: User } | { error: ForumErrorCode; detail?: string }> {
    if (!email?.includes("@")) {
      return { error: ForumErrorCode.INVALID_BODY };
    }
    const doc = await this.users.findOne({ _id: user });
    if (doc === null) {
      return { error: ForumErrorCode.NOT_FOUND };
    }
    await this.users.updateOne({ _id: user }, { $set: { email } });
    return { user };
  }

  /**
   * unregister (user: User): (user: User)
   *
   * **requires** the given `user` exists
   *
   * **effects** removes `user` and its username and password from the state;
   * returns `user`
   */
  async unregister({
    user,
  }: {
    user: User;
  }): Promise<{ user: User } | { error: ForumErrorCode; detail?: string }> {
    const { deletedCount } = await this.users.deleteOne({ _id: user });
    if (deletedCount === 0) {
      return { error: ForumErrorCode.NOT_FOUND };
    }
    return { user };
  }

  /**
   * _getById (user: User): (username: String, email: String)
   *
   * **requires** the given `user` exists
   *
   * **effects** returns the username and email of `user`
   */
  async _getById({
    user,
  }: {
    user: User;
  }): Promise<{ username: string; email: string }[]> {
    const doc = await this.users.findOne({ _id: user });
    return doc === null ? [] : [{ username: doc.username, email: doc.email }];
  }

  /**
   * _getByUsername (username: String): (user: User)
   *
   * **requires** true
   *
   * **effects** returns the User (zero or one) whose username equals `username`
   */
  async _getByUsername({
    username,
  }: {
    username: string;
  }): Promise<{ user: User }[]> {
    const doc = await this.users.findOne({ username });
    return doc === null ? [] : [{ user: doc._id }];
  }

  /**
   * _existsByUsername (username: String): (exists: Flag)
   *
   * **requires** true
   *
   * **effects** returns a single result whose `exists` is true iff some User has
   * the given `username`
   */
  async _existsByUsername({
    username,
  }: {
    username: string;
  }): Promise<{ exists: boolean }[]> {
    const doc = await this.users.findOne({ username });
    return [{ exists: doc !== null }];
  }

  /**
   * _search (query: String): (user: User, username: String)
   *
   * **requires** true
   *
   * **effects** returns every User whose username starts with `query`
   * (case-insensitive), up to 10 results sorted alphabetically
   */
  async _search({
    query,
  }: {
    query: string;
  }): Promise<{ user: User; username: string }[]> {
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const docs = await this.users
      .find({ username: new RegExp(`^${escaped}`, "i") })
      .limit(10)
      .sort({ username: 1 })
      .toArray();
    return docs.map((doc) => ({ user: doc._id, username: doc.username }));
  }

  /**
   * _getUserCount (): (count: Number)
   *
   * **requires** true
   *
   * **effects** returns a single result with the number of registered Users
   */
  async _getUserCount(): Promise<{ count: number }[]> {
    const count = await this.users.countDocuments();
    return [{ count }];
  }
}
