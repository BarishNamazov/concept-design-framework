import { Collection, Db } from "mongodb";
import { freshID } from "@utils/database.ts";
import type { ID } from "@utils/types.ts";

// Declare collection prefix, use concept name.
const PREFIX = "Profiling" + ".";

// Generic types of this concept.
type User = ID;

/**
 * a set of Users with
 *   a displayName String
 *   a bio String
 *   an avatar String
 *
 * `bio` and `avatar` may hold the empty string to indicate "not provided".
 * Each User in this set is a user that has a profile.
 */
interface ProfileDoc {
  _id: User;
  displayName: string;
  bio: string;
  avatar: string;
}

/**
 * concept: Profiling [User]
 *
 * purpose: give each user a human-facing presence — a display name, a short
 * biography, and an avatar — that others can read and recognize.
 */
export default class ProfilingConcept {
  private readonly profiles: Collection<ProfileDoc>;

  constructor(private readonly db: Db) {
    this.profiles = this.db.collection(PREFIX + "profiles");
  }

  /**
   * createProfile (user: User, displayName: String): (user: User)
   *
   * **requires** no profile exists for the given `user`
   *
   * **effects** adds `user` to the set with the given `displayName`, an empty
   * `bio`, and an empty `avatar`; returns `user`
   *
   * createProfile (user: User, displayName: String): (error: String)
   *
   * **requires** a profile already exists for the given `user`
   *
   * **effects** returns an explanatory `error`; state is unchanged
   */
  async createProfile(
    { user, displayName }: { user: User; displayName: string },
  ): Promise<{ user: User } | { error: string }> {
    const existing = await this.profiles.findOne({ _id: user });
    if (existing !== null) {
      return { error: "A profile already exists for this user." };
    }
    await this.profiles.insertOne({ _id: user, displayName, bio: "", avatar: "" });
    return { user };
  }

  /**
   * setDisplayName (user: User, displayName: String): (user: User)
   *
   * **requires** a profile exists for the given `user`
   *
   * **effects** sets the displayName of `user` to `displayName`; returns `user`
   */
  async setDisplayName(
    { user, displayName }: { user: User; displayName: string },
  ): Promise<{ user: User } | { error: string }> {
    const { matchedCount } = await this.profiles.updateOne(
      { _id: user },
      { $set: { displayName } },
    );
    if (matchedCount === 0) {
      return { error: "No profile exists for this user." };
    }
    return { user };
  }

  /**
   * setBio (user: User, bio: String): (user: User)
   *
   * **requires** a profile exists for the given `user`
   *
   * **effects** sets the bio of `user` to `bio`; returns `user`
   */
  async setBio(
    { user, bio }: { user: User; bio: string },
  ): Promise<{ user: User } | { error: string }> {
    const { matchedCount } = await this.profiles.updateOne(
      { _id: user },
      { $set: { bio } },
    );
    if (matchedCount === 0) {
      return { error: "No profile exists for this user." };
    }
    return { user };
  }

  /**
   * setAvatar (user: User, avatar: String): (user: User)
   *
   * **requires** a profile exists for the given `user`
   *
   * **effects** sets the avatar of `user` to `avatar`; returns `user`
   */
  async setAvatar(
    { user, avatar }: { user: User; avatar: string },
  ): Promise<{ user: User } | { error: string }> {
    const { matchedCount } = await this.profiles.updateOne(
      { _id: user },
      { $set: { avatar } },
    );
    if (matchedCount === 0) {
      return { error: "No profile exists for this user." };
    }
    return { user };
  }

  /**
   * deleteProfile (user: User): (user: User)
   *
   * **requires** a profile exists for the given `user`
   *
   * **effects** removes `user` and its displayName, bio and avatar from the
   * state; returns `user`
   *
   * deleteProfile (user: User): (error: String)
   *
   * **requires** no profile exists for the given `user`
   *
   * **effects** returns an explanatory `error`; state is unchanged
   */
  async deleteProfile(
    { user }: { user: User },
  ): Promise<{ user: User } | { error: string }> {
    const { deletedCount } = await this.profiles.deleteOne({ _id: user });
    if (deletedCount === 0) {
      return { error: "No profile exists for this user." };
    }
    return { user };
  }

  /**
   * _getProfile (user: User): (profile: {displayName: String, bio: String, avatar: String})
   *
   * **requires** a profile exists for the given `user`
   *
   * **effects** returns the displayName, bio and avatar of `user` as a single
   * `profile` record
   */
  async _getProfile(
    { user }: { user: User },
  ): Promise<
    { profile: { displayName: string; bio: string; avatar: string } }[]
  > {
    const doc = await this.profiles.findOne({ _id: user });
    return doc === null ? [] : [{
      profile: {
        displayName: doc.displayName,
        bio: doc.bio,
        avatar: doc.avatar,
      },
    }];
  }

  /**
   * _getDisplayName (user: User): (displayName: String)
   *
   * **requires** a profile exists for the given `user`
   *
   * **effects** returns the displayName of `user`
   */
  async _getDisplayName(
    { user }: { user: User },
  ): Promise<{ displayName: string }[]> {
    const doc = await this.profiles.findOne({ _id: user });
    return doc === null ? [] : [{ displayName: doc.displayName }];
  }

  /**
   * _getByDisplayName (displayName: String): (user: User)
   *
   * **requires** true
   *
   * **effects** returns every User whose displayName equals `displayName`
   */
  async _getByDisplayName(
    { displayName }: { displayName: string },
  ): Promise<{ user: User }[]> {
    const docs = await this.profiles.find({ displayName }).toArray();
    return docs.map((doc) => ({ user: doc._id }));
  }
}
