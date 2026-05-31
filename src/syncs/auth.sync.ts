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
  defineFeature,
  requestingEndpoint,
  type ActionOk,
  type Prettify,
  type QueryRow,
} from "@concepts/Requesting/api.ts";

const register = requestingEndpoint("/auth/register");
const login = requestingEndpoint("/auth/login");
const logout = requestingEndpoint("/auth/logout");
const me = requestingEndpoint("/auth/me");
const changePassword = requestingEndpoint("/auth/changePassword");

type RegisterOutput = ActionOk<typeof Authenticating, "register">;
type LoginOutput = Prettify<
  & ActionOk<typeof Sessioning, "start">
  & ActionOk<typeof Authenticating, "authenticate">
>;
type LogoutOutput = { ok: true };
type MeOutput = Prettify<
  & QueryRow<typeof Sessioning, "_getUser">
  & QueryRow<typeof Authenticating, "_getById">
  & QueryRow<typeof Profiling, "_getProfile">
>;
type ChangePasswordOutput = ActionOk<
  typeof Authenticating,
  "changePassword"
>;

// --- register: create credentials, then a profile, then respond ---

export const RegisterRequest = register.sync(({ request, username, password }) => ({
  when: register.actions(
    register.request({ username, password }, { request }),
  ),
  then: register.actions([Authenticating.register, { username, password }]),
}));

export const RegisterCreatesProfile = register.sync((
  { request, displayName, user },
) => ({
  when: register.actions(
    register.request({ displayName }, { request }),
    [Authenticating.register, {}, { user }],
  ),
  then: register.actions([Profiling.createProfile, { user, displayName }]),
}));

export const RegisterResponse = register.sync(({ request, user }) => ({
  when: register.actions(
    register.request({}, { request }),
    [Authenticating.register, {}, { user }],
  ),
  then: register.actions(register.respond<RegisterOutput>({ request, user })),
}));

export const RegisterError = register.sync(({ request, error }) => ({
  when: register.actions(
    register.request({}, { request }),
    [Authenticating.register, {}, { error }],
  ),
  then: register.actions(register.error({ request, error })),
}));

// --- login: authenticate, then open a session ---

export const LoginRequest = login.sync(({ request, username, password }) => ({
  when: login.actions(login.request({ username, password }, { request })),
  then: login.actions([Authenticating.authenticate, { username, password }]),
}));

export const LoginStartsSession = login.sync(({ request, user }) => ({
  when: login.actions(
    login.request({}, { request }),
    [Authenticating.authenticate, {}, { user }],
  ),
  then: login.actions([Sessioning.start, { user }]),
}));

export const LoginResponse = login.sync(({ request, user, session }) => ({
  when: login.actions(
    login.request({}, { request }),
    [Authenticating.authenticate, {}, { user }],
    [Sessioning.start, {}, { session }],
  ),
  then: login.actions(login.respond<LoginOutput>({ request, session, user })),
}));

export const LoginError = login.sync(({ request, error }) => ({
  when: login.actions(
    login.request({}, { request }),
    [Authenticating.authenticate, {}, { error }],
  ),
  then: login.actions(login.error({ request, error })),
}));

// --- logout: end the session ---

export const LogoutRequest = logout.sync(({ request, session }) => ({
  when: logout.actions(logout.request({ session }, { request })),
  then: logout.actions([Sessioning.end, { session }]),
}));

export const LogoutResponse = logout.sync(({ request, session }) => ({
  when: logout.actions(
    logout.request({}, { request }),
    [Sessioning.end, {}, { session }],
  ),
  then: logout.actions(logout.respond<LogoutOutput>({ request, ok: true })),
}));

export const LogoutError = logout.sync(({ request, error }) => ({
  when: logout.actions(
    logout.request({}, { request }),
    [Sessioning.end, {}, { error }],
  ),
  then: logout.actions(logout.error({ request, error })),
}));

// --- me: resolve the session to the current user and profile ---

export const MeResponse = me.sync((
  { request, session, user, username, profile },
) => ({
  when: me.actions(me.request({ session }, { request })),
  where: async (frames) => {
    frames = await frames.query(Sessioning._getUser, { session }, { user });
    frames = await frames.query(Authenticating._getById, { user }, { username });
    return await frames.query(Profiling._getProfile, { user }, { profile });
  },
  then: me.actions(me.respond<MeOutput>({ request, user, username, profile })),
}));

export const MeInvalidSession = me.sync(({ request, session, active }) => ({
  when: me.actions(me.request({ session }, { request })),
  where: async (frames) => {
    frames = await frames.query(Sessioning._isActive, { session }, { active });
    return frames.filter(($) => $[active] === false);
  },
  then: me.actions(
    me.error({ request, error: "Invalid or expired session." }),
  ),
}));

// --- changePassword: resolve session, change credentials (auth-only) ---

export const ChangePasswordRequest = changePassword.sync((
  { request, session, oldPassword, newPassword, user },
) => ({
  when: changePassword.actions(
    changePassword.request({ session, oldPassword, newPassword }, { request }),
  ),
  where: async (frames) =>
    await frames.query(Sessioning._getUser, { session }, { user }),
  then: changePassword.actions([
    Authenticating.changePassword,
    { user, oldPassword, newPassword },
  ]),
}));

export const ChangePasswordResponse = changePassword.sync(({ request, user }) => ({
  when: changePassword.actions(
    changePassword.request({}, { request }),
    [Authenticating.changePassword, {}, { user }],
  ),
  then: changePassword.actions(
    changePassword.respond<ChangePasswordOutput>({ request, user }),
  ),
}));

export const ChangePasswordError = changePassword.sync(({ request, error }) => ({
  when: changePassword.actions(
    changePassword.request({}, { request }),
    [Authenticating.changePassword, {}, { error }],
  ),
  then: changePassword.actions(changePassword.error({ request, error })),
}));

export const ChangePasswordInvalidSession = changePassword.sync((
  { request, session, active },
) => ({
  when: changePassword.actions(changePassword.request({ session }, { request })),
  where: async (frames) => {
    frames = await frames.query(Sessioning._isActive, { session }, { active });
    return frames.filter(($) => $[active] === false);
  },
  then: changePassword.actions(
    changePassword.error({ request, error: "Invalid or expired session." }),
  ),
}));

export const authApi = defineFeature({
  register: register.define({
    RegisterRequest,
    RegisterCreatesProfile,
    RegisterResponse,
    RegisterError,
  }),
  login: login.define({
    LoginRequest,
    LoginStartsSession,
    LoginResponse,
    LoginError,
  }),
  logout: logout.define({
    LogoutRequest,
    LogoutResponse,
    LogoutError,
  }),
  me: me.define({
    MeResponse,
    MeInvalidSession,
  }),
  changePassword: changePassword.define({
    ChangePasswordRequest,
    ChangePasswordResponse,
    ChangePasswordError,
    ChangePasswordInvalidSession,
  }),
});
