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
import { Authenticating, Profiling, Sessioning } from "@concepts";
import {
  type ActionOk,
  defineEndpoint,
  type Prettify,
  type QueryRow,
} from "@concepts/Requesting/api.ts";

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

// --- register: create credentials, then a profile, then respond ---

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
  ({ Sync, Actions, Request, Respond, Fail }) => ({
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

    MeInvalidSession: Sync(({ session, active }) => ({
      when: Actions(Request({ session })),
      where: async (frames) => {
        frames = await frames.query(
          Sessioning._isActive,
          { session },
          { active },
        );
        return frames.filter(($) => $[active] === false);
      },
      then: Actions(Fail("Invalid or expired session.")),
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

    ChangePasswordInvalidSession: Sync(({ session, active }) => ({
      when: Actions(Request({ session })),
      where: async (frames) => {
        frames = await frames.query(
          Sessioning._isActive,
          { session },
          { active },
        );
        return frames.filter(($) => $[active] === false);
      },
      then: Actions(Fail("Invalid or expired session.")),
    })),
  }),
);

export const authApi = {
  register,
  login,
  logout,
  me,
  changePassword,
};
