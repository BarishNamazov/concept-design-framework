import { collectionName, freshID } from "@utils/database.ts";
import type { ID } from "@utils/types.ts";
import type { Collection, Db } from "mongodb";
import { ForumErrorCode } from "../../sdk/error-codes.ts";

// Generic types of this concept.
type User = ID;
type Context = ID;
type Role = ID;
type Grant = ID;

/**
 * a set of Roles with
 *   a name String
 *   a capabilities set of String
 *
 * Invariant: role names are unique across the set of Roles.
 */
interface RoleDoc {
  _id: Role;
  name: string;
  capabilities: string[];
}

/**
 * a set of Grants with
 *   a user User
 *   a context Context
 *   a role Role
 *
 * Invariant: at most one Grant exists for a given (`user`, `context`, `role`)
 * triple.
 */
interface GrantDoc {
  _id: Grant;
  user: User;
  context: Context;
  role: Role;
}

/**
 * concept: Roling [User, Context]
 *
 * purpose: decide which users are allowed to perform privileged operations
 * within a given context, by granting them named roles that carry
 * capabilities.
 */
export default class RolingConcept {
  private readonly roles: Collection<RoleDoc>;
  private readonly grants: Collection<GrantDoc>;

  constructor(
    private readonly db: Db,
    namespace = "Roling",
  ) {
    this.roles = this.db.collection(collectionName(namespace, "roles"));
    this.grants = this.db.collection(collectionName(namespace, "grants"));
  }

  /**
   * defineRole (name: String, capabilities: set of String): (role: Role)
   *
   * **requires** no Role with the given `name` exists
   *
   * **effects** creates a fresh Role `r` with the given `name` and
   * `capabilities`; returns `r` as `role`
   */
  async defineRole({
    name,
    capabilities,
  }: {
    name: string;
    capabilities: string[];
  }): Promise<{ role: Role } | { error: ForumErrorCode; detail?: string }> {
    const existing = await this.roles.findOne({ name });
    if (existing !== null) {
      return { error: ForumErrorCode.ROLE_ALREADY_EXISTS, detail: name };
    }
    const role = freshID() as Role;
    await this.roles.insertOne({ _id: role, name, capabilities });
    return { role };
  }

  /**
   * grant (user: User, context: Context, role: Role): (grant: Grant)
   *
   * **requires** the `role` exists and no Grant exists for the given `user`,
   * `context` and `role`
   *
   * **effects** creates a fresh Grant `g` with the given `user`, `context` and
   * `role`; returns `g` as `grant`
   */
  async grant({
    user,
    context,
    role,
  }: {
    user: User;
    context: Context;
    role: Role;
  }): Promise<{ grant: Grant } | { error: ForumErrorCode; detail?: string }> {
    const roleDoc = await this.roles.findOne({ _id: role });
    if (roleDoc === null) {
      return { error: ForumErrorCode.ROLE_NOT_FOUND };
    }
    const existing = await this.grants.findOne({ user, context, role });
    if (existing !== null) {
      return { error: ForumErrorCode.GRANT_ALREADY_EXISTS };
    }
    const grant = freshID() as Grant;
    await this.grants.insertOne({ _id: grant, user, context, role });
    return { grant };
  }

  /**
   * revoke (user: User, context: Context, role: Role): (grant: Grant)
   *
   * **requires** a Grant exists for the given `user`, `context` and `role`
   *
   * **effects** removes that Grant from the state; returns the removed `grant`
   */
  async revoke({
    user,
    context,
    role,
  }: {
    user: User;
    context: Context;
    role: Role;
  }): Promise<{ grant: Grant } | { error: ForumErrorCode; detail?: string }> {
    const doc = await this.grants.findOne({ user, context, role });
    if (doc === null) {
      return { error: ForumErrorCode.GRANT_NOT_FOUND };
    }
    await this.grants.deleteOne({ _id: doc._id });
    return { grant: doc._id };
  }

  /**
   * _hasCapability (user: User, context: Context, capability: String): (allowed: Flag)
   *
   * **requires** true
   *
   * **effects** returns a single result whose `allowed` is true iff some Grant
   * for the given `user` and `context` references a Role whose capabilities
   * include the given `capability`
   */
  async _hasCapability({
    user,
    context,
    capability,
  }: {
    user: User;
    context: Context;
    capability: string;
  }): Promise<{ allowed: boolean }[]> {
    const grants = await this.grants.find({ user, context }).toArray();
    if (grants.length === 0) {
      return [{ allowed: false }];
    }
    const roleIds = grants.map((g) => g.role);
    const role = await this.roles.findOne({
      _id: { $in: roleIds },
      capabilities: capability,
    });
    return [{ allowed: role !== null }];
  }

  /**
   * _hasCapabilityHolder (context: Context, capability: String): (present: Flag)
   *
   * **requires** true
   *
   * **effects** returns a single result whose `present` is true iff some Grant
   * in the given `context` references a Role whose capabilities include the
   * given `capability` — i.e. at least one user already holds that capability
   * there. Used by syncs to detect whether a context has been "claimed" (e.g.
   * whether the forum already has an administrator) so the very first such
   * grant can bootstrap before enforcement begins.
   */
  async _hasCapabilityHolder({
    context,
    capability,
  }: {
    context: Context;
    capability: string;
  }): Promise<{ present: boolean }[]> {
    const roles = await this.roles.find({ capabilities: capability }).toArray();
    if (roles.length === 0) {
      return [{ present: false }];
    }
    const roleIds = roles.map((r) => r._id);
    const grant = await this.grants.findOne({
      context,
      role: { $in: roleIds },
    });
    return [{ present: grant !== null }];
  }

  /**
   * _getRoles (user: User, context: Context): (role: Role)
   *
   * **requires** true
   *
   * **effects** returns every Role granted to the given `user` in the given
   * `context`
   */
  async _getRoles({
    user,
    context,
  }: {
    user: User;
    context: Context;
  }): Promise<{ role: Role }[]> {
    const docs = await this.grants.find({ user, context }).toArray();
    return docs.map((d) => ({ role: d.role }));
  }

  /**
   * _getUsersWithRole (context: Context, role: Role): (user: User)
   *
   * **requires** true
   *
   * **effects** returns every User granted the given `role` in the given
   * `context`
   */
  async _getUsersWithRole({
    context,
    role,
  }: {
    context: Context;
    role: Role;
  }): Promise<{ user: User }[]> {
    const docs = await this.grants.find({ context, role }).toArray();
    return docs.map((d) => ({ user: d.user }));
  }

  /**
   * _getRoleByName (name: String): (role: Role)
   *
   * **requires** true
   *
   * **effects** returns the Role (zero or one) whose name equals `name`
   */
  async _getRoleByName({ name }: { name: string }): Promise<{ role: Role }[]> {
    const doc = await this.roles.findOne({ name });
    return doc === null ? [] : [{ role: doc._id }];
  }

  /**
   * _getRoleDetail (role: Role): (name: String, capabilities: set of String)
   *
   * **requires** true
   *
   * **effects** returns the Role name and capabilities for the given role id
   */
  async _getRoleDetail({
    role,
  }: {
    role: Role;
  }): Promise<{ name: string; capabilities: string[] }[]> {
    const doc = await this.roles.findOne({ _id: role });
    return doc === null
      ? []
      : [{ name: doc.name, capabilities: doc.capabilities }];
  }

  /**
   * _getCapabilities (role: Role): (capability: String)
   *
   * **requires** true
   *
   * **effects** returns one result per capability carried by the given `role`
   */
  async _getCapabilities({
    role,
  }: {
    role: Role;
  }): Promise<{ capability: string }[]> {
    const doc = await this.roles.findOne({ _id: role });
    if (doc === null) {
      return [];
    }
    return doc.capabilities.map((capability) => ({ capability }));
  }

  /**
   * _listRoles (): (role: Role, name: String, capabilities: set of String)
   *
   * **requires** true
   *
   * **effects** returns every defined Role with its name and capabilities
   *
   * The empty _params parameter exists for sync-engine query compatibility
   * (frames.query always passes a bound input object, even for parameterless
   * queries).
   */
  async _listRoles(
    _params?: Record<string, never>,
  ): Promise<{ role: Role; name: string; capabilities: string[] }[]> {
    const docs = await this.roles.find().toArray();
    return docs.map((doc) => ({
      role: doc._id,
      name: doc.name,
      capabilities: doc.capabilities,
    }));
  }
}
