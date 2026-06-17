/**
 * Authentication & session synchronizations.
 *
 * Endpoints:
 *   POST /auth/register  { username, password, displayName } -> { user }
 *   POST /auth/login     { username, password }              -> { session, user }
 *   POST /auth/logout    { session }                         -> { ok }
 *   POST /auth/me        { session }                         -> { user, username, profile }
 *   POST /auth/changePassword { session, oldPassword, newPassword } -> { user }
 */
import {
  Authenticating,
  Profiling,
  Requesting,
  Roling,
  Sessioning,
} from "@concepts";
import {
  type ActionOk,
  defineEndpoint,
  type Prettify,
  type QueryRow,
} from "@concepts/Requesting/api.ts";
import { actions, type Frames, type Sync } from "@engine";
import { ForumErrorCode } from "../sdk/error-codes.ts";
import {
  ADMIN_CAPABILITY,
  FORUM_CONTEXT,
  MODERATE_CAPABILITY,
} from "./authorization.ts";

type RegisterOutput = ActionOk<typeof Authenticating, "register">;
type LoginOutput = Prettify<
  ActionOk<typeof Sessioning, "start"> &
    ActionOk<typeof Authenticating, "authenticate">
>;
type LogoutOutput = { ok: true };
type MeOutput = Prettify<
  QueryRow<typeof Sessioning, "_getUser"> &
    QueryRow<typeof Authenticating, "_getById"> &
    QueryRow<typeof Profiling, "_getProfile">
>;
type ChangePasswordOutput = ActionOk<typeof Authenticating, "changePassword">;

const ADMIN_ROLE_NAME = "administrator";
const PIN_CAPABILITY = "pin";
const INITIAL_ADMIN_CAPABILITIES = [
  ADMIN_CAPABILITY,
  MODERATE_CAPABILITY,
  PIN_CAPABILITY,
];

/** Keep only bootstrap frames: exactly one user exists and no admin has claimed the forum. */
async function onlySoleUserInUnclaimedForum(
  frames: Frames,
  {
    count,
    present,
  }: {
    count: symbol;
    present: symbol;
  },
): Promise<Frames> {
  frames = await frames.query(Authenticating._getUserCount, {}, { count });
  frames = await frames.query(
    Roling._hasCapabilityHolder,
    { context: FORUM_CONTEXT, capability: ADMIN_CAPABILITY },
    { present },
  );
  return frames.filter(($) => $[count] === 1 && $[present] === false);
}

/** Find the bootstrap admin role when it was already defined but not yet granted. */
async function existingInitialAdminRole(
  frames: Frames,
  {
    count,
    present,
    role,
  }: {
    count: symbol;
    present: symbol;
    role: symbol;
  },
): Promise<Frames> {
  frames = await onlySoleUserInUnclaimedForum(frames, { count, present });
  return await frames.query(
    Roling._getRoleByName,
    { name: ADMIN_ROLE_NAME },
    { role },
  );
}

// --- register: create credentials, profile, bootstrap first admin, then respond ---

const register = defineEndpoint(
  "/auth/register",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    RegisterRequest: Sync(({ username, password }) => ({
      when: Actions(Request({ username, password })),
      then: Actions([Authenticating.register, { username, password }]),
    })),

    RegisterCreatesProfile: Sync(({ displayName, user }) => ({
      when: Actions(Request({ displayName }), [
        Authenticating.register,
        {},
        { user },
      ]),
      then: Actions([Profiling.createProfile, { user, displayName }]),
    })),

    // First registration defines the forum administrator role.
    RegisterDefinesInitialAdminRole: Sync(({ user, count, present }) => ({
      when: Actions([Authenticating.register, {}, { user }]),
      where: (frames) =>
        onlySoleUserInUnclaimedForum(frames, { count, present }),
      then: Actions([
        Roling.defineRole,
        { name: ADMIN_ROLE_NAME, capabilities: INITIAL_ADMIN_CAPABILITIES },
      ]),
    })),

    // If registration just created the role, grant it to that first user.
    RegisterGrantsNewInitialAdminRole: Sync(({ user, role }) => ({
      when: Actions(
        [Authenticating.register, {}, { user }],
        [Roling.defineRole, { name: ADMIN_ROLE_NAME }, { role }],
      ),
      then: Actions([Roling.grant, { user, context: FORUM_CONTEXT, role }]),
    })),

    // If the role already exists without a holder, grant it to that first user.
    RegisterGrantsExistingInitialAdminRole: Sync(
      ({ user, count, present, role }) => ({
        when: Actions([Authenticating.register, {}, { user }]),
        where: (frames) =>
          existingInitialAdminRole(frames, { count, present, role }),
        then: Actions([Roling.grant, { user, context: FORUM_CONTEXT, role }]),
      }),
    ),

    RegisterResponse: Sync(({ user }) => ({
      when: Actions([Authenticating.register, {}, { user }]),
      then: Actions(Respond<RegisterOutput>({ user })),
    })),

    RegisterError: Sync(({ error }) => ({
      when: Actions([Authenticating.register, {}, { error }]),
      then: Actions(Fail(error)),
    })),
  }),
);

// --- login: authenticate, then open a session ---

const login = defineEndpoint(
  "/auth/login",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    LoginRequest: Sync(({ username, password }) => ({
      when: Actions(Request({ username, password })),
      then: Actions([Authenticating.authenticate, { username, password }]),
    })),

    // First login backfills the administrator role for a sole pre-existing user.
    LoginDefinesInitialAdminRole: Sync(({ user, count, present }) => ({
      when: Actions([Authenticating.authenticate, {}, { user }]),
      where: (frames) =>
        onlySoleUserInUnclaimedForum(frames, { count, present }),
      then: Actions([
        Roling.defineRole,
        { name: ADMIN_ROLE_NAME, capabilities: INITIAL_ADMIN_CAPABILITIES },
      ]),
    })),

    // If login just created the role, grant it to the sole user.
    LoginGrantsNewInitialAdminRole: Sync(({ user, role }) => ({
      when: Actions(
        [Authenticating.authenticate, {}, { user }],
        [Roling.defineRole, { name: ADMIN_ROLE_NAME }, { role }],
      ),
      then: Actions([Roling.grant, { user, context: FORUM_CONTEXT, role }]),
    })),

    // If the role already exists without a holder, login grants it to the sole user.
    LoginGrantsExistingInitialAdminRole: Sync(
      ({ user, count, present, role }) => ({
        when: Actions([Authenticating.authenticate, {}, { user }]),
        where: (frames) =>
          existingInitialAdminRole(frames, { count, present, role }),
        then: Actions([Roling.grant, { user, context: FORUM_CONTEXT, role }]),
      }),
    ),

    // This could be an independent app sync if "authenticate success starts a
    // session" becomes a global invariant instead of /auth/login behavior:
    //
    // export const LoginStartsSession: Sync = ({ user }) => ({
    //   when: actions([Authenticating.authenticate, {}, { user }]),
    //   then: actions([Sessioning.start, { user }]),
    // });
    //
    // It would then be registered beside syncMap(api), not inside authApi. Kept
    // endpoint-scoped for now so only /auth/login creates sessions.
    LoginStartsSession: Sync(({ user }) => ({
      when: Actions([Authenticating.authenticate, {}, { user }]),
      then: Actions([Sessioning.start, { user }]),
    })),

    LoginResponse: Sync(({ user, session }) => ({
      when: Actions(
        [Authenticating.authenticate, {}, { user }],
        [Sessioning.start, {}, { session }],
      ),
      then: Actions(Respond<LoginOutput>({ session, user })),
    })),

    LoginError: Sync(({ error }) => ({
      when: Actions([Authenticating.authenticate, {}, { error }]),
      then: Actions(Fail(error)),
    })),
  }),
);

// --- logout: end the session ---

const logout = defineEndpoint(
  "/auth/logout",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    LogoutRequest: Sync(({ session }) => ({
      when: Actions(Request({ session })),
      then: Actions([Sessioning.end, { session }]),
    })),

    LogoutResponse: Sync(({ session }) => ({
      when: Actions([Sessioning.end, {}, { session }]),
      then: Actions(Respond<LogoutOutput>({ ok: true })),
    })),

    LogoutError: Sync(({ error }) => ({
      when: Actions([Sessioning.end, {}, { error }]),
      then: Actions(Fail(error)),
    })),
  }),
);

// --- me: resolve the session to the current user and profile ---

const me = defineEndpoint(
  "/auth/me",
  ({ Sync, Actions, Request, Respond }) => ({
    MeResponse: Sync(({ session, user, username, profile }) => ({
      when: Actions(Request({ session })),
      where: async (frames) => {
        frames = await frames.query(Sessioning._getUser, { session }, { user });
        frames = await frames.query(
          Authenticating._getById,
          { user },
          { username },
        );
        return await frames.query(Profiling._getProfile, { user }, { profile });
      },
      then: Actions(Respond<MeOutput>({ user, username, profile })),
    })),
  }),
);

// --- changePassword: resolve session, change credentials (auth-only) ---

const changePassword = defineEndpoint(
  "/auth/changePassword",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    ChangePasswordRequest: Sync(
      ({ session, oldPassword, newPassword, user }) => ({
        when: Actions(Request({ session, oldPassword, newPassword })),
        where: async (frames) =>
          await frames.query(Sessioning._getUser, { session }, { user }),
        then: Actions([
          Authenticating.changePassword,
          { user, oldPassword, newPassword },
        ]),
      }),
    ),

    ChangePasswordResponse: Sync(({ user }) => ({
      when: Actions([Authenticating.changePassword, {}, { user }]),
      then: Actions(Respond<ChangePasswordOutput>({ user })),
    })),

    ChangePasswordError: Sync(({ error }) => ({
      when: Actions([Authenticating.changePassword, {}, { error }]),
      then: Actions(Fail(error)),
    })),
  }),
);

// --- resolve: public lookup of a user id by username ---

type ResolveOutput = QueryRow<typeof Authenticating, "_getByUsername">;

const resolve = defineEndpoint(
  "/auth/resolve",
  ({ Sync, Actions, Request, Respond }) => ({
    ResolveResponse: Sync(({ username, user }) => ({
      when: Actions(Request({ username })),
      where: async (frames) =>
        await frames.query(
          Authenticating._getByUsername,
          { username },
          { user },
        ),
      then: Actions(Respond<ResolveOutput>({ user })),
    })),
  }),
);

export const authApi = {
  register,
  login,
  logout,
  me,
  changePassword,
  resolve,
};

// --- global session guard ---

// "A request bearing an inactive session is rejected" is a forum-wide invariant,
// not per-endpoint behavior, so it lives here as a single app sync rather than a
// copy of `*InvalidSession` inside every endpoint. Like the LoginStartsSession
// note above, it is registered beside syncMap(api) (see syncs/app.ts) instead of
// inside an endpoint. It anchors on the raw `Requesting.request` action and so
// matches any request that carries a `session`, regardless of path.
export const InvalidSession: Sync = ({ request, session, active }) => ({
  when: actions([Requesting.request, { session }, { request }]),
  where: async (frames) => {
    frames = await frames.query(Sessioning._isActive, { session }, { active });
    return frames.filter(($) => $[active] === false);
  },
  then: actions([
    Requesting.respond,
    { request, error: ForumErrorCode.INVALID_SESSION },
  ]),
});
