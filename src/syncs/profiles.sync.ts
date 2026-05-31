/**
 * Profile synchronizations.
 *
 * Endpoints:
 *   POST /profiles/get            { user }                 -> { profile }
 *   POST /profiles/setDisplayName { session, displayName } -> { user }
 *   POST /profiles/setBio         { session, bio }         -> { user }
 *   POST /profiles/setAvatar      { session, avatar }      -> { user }
 */
import { Profiling, Sessioning } from "@concepts";
import {
  defineFeature,
  requestingEndpoint,
  type ActionOk,
  type QueryRow,
} from "@concepts/Requesting/api.ts";

const getProfile = requestingEndpoint("/profiles/get");
const setDisplayName = requestingEndpoint("/profiles/setDisplayName");
const setBio = requestingEndpoint("/profiles/setBio");
const setAvatar = requestingEndpoint("/profiles/setAvatar");

type ProfileGetOutput = QueryRow<typeof Profiling, "_getProfile">;
type SetDisplayNameOutput = ActionOk<typeof Profiling, "setDisplayName">;
type SetBioOutput = ActionOk<typeof Profiling, "setBio">;
type SetAvatarOutput = ActionOk<typeof Profiling, "setAvatar">;

// --- get: public lookup of a user's profile ---

export const ProfileGetResponse = getProfile.sync(({ request, user, profile }) => ({
  when: getProfile.actions(getProfile.request({ user }, { request })),
  where: async (frames) =>
    await frames.query(Profiling._getProfile, { user }, { profile }),
  then: getProfile.actions(
    getProfile.respond<ProfileGetOutput>({ request, profile }),
  ),
}));

// --- setDisplayName ---

export const SetDisplayNameResponse = setDisplayName.sync((
  { request, session, displayName, user },
) => ({
  when: setDisplayName.actions(
    setDisplayName.request({ session, displayName }, { request }),
  ),
  where: async (frames) =>
    await frames.query(Sessioning._getUser, { session }, { user }),
  then: setDisplayName.actions([Profiling.setDisplayName, { user, displayName }]),
}));

export const SetDisplayNameRespond = setDisplayName.sync(({ request, user }) => ({
  when: setDisplayName.actions(
    setDisplayName.request({}, { request }),
    [Profiling.setDisplayName, {}, { user }],
  ),
  then: setDisplayName.actions(
    setDisplayName.respond<SetDisplayNameOutput>({ request, user }),
  ),
}));

export const SetDisplayNameInvalidSession = setDisplayName.sync((
  { request, session, active },
) => ({
  when: setDisplayName.actions(
    setDisplayName.request({ session }, { request }),
  ),
  where: async (frames) => {
    frames = await frames.query(Sessioning._isActive, { session }, { active });
    return frames.filter(($) => $[active] === false);
  },
  then: setDisplayName.actions(
    setDisplayName.error({ request, error: "Invalid or expired session." }),
  ),
}));

// --- setBio ---

export const SetBioResponse = setBio.sync(({ request, session, bio, user }) => ({
  when: setBio.actions(setBio.request({ session, bio }, { request })),
  where: async (frames) =>
    await frames.query(Sessioning._getUser, { session }, { user }),
  then: setBio.actions([Profiling.setBio, { user, bio }]),
}));

export const SetBioRespond = setBio.sync(({ request, user }) => ({
  when: setBio.actions(
    setBio.request({}, { request }),
    [Profiling.setBio, {}, { user }],
  ),
  then: setBio.actions(setBio.respond<SetBioOutput>({ request, user })),
}));

export const SetBioInvalidSession = setBio.sync(({ request, session, active }) => ({
  when: setBio.actions(setBio.request({ session }, { request })),
  where: async (frames) => {
    frames = await frames.query(Sessioning._isActive, { session }, { active });
    return frames.filter(($) => $[active] === false);
  },
  then: setBio.actions(
    setBio.error({ request, error: "Invalid or expired session." }),
  ),
}));

// --- setAvatar ---

export const SetAvatarResponse = setAvatar.sync((
  { request, session, avatar, user },
) => ({
  when: setAvatar.actions(
    setAvatar.request({ session, avatar }, { request }),
  ),
  where: async (frames) =>
    await frames.query(Sessioning._getUser, { session }, { user }),
  then: setAvatar.actions([Profiling.setAvatar, { user, avatar }]),
}));

export const SetAvatarRespond = setAvatar.sync(({ request, user }) => ({
  when: setAvatar.actions(
    setAvatar.request({}, { request }),
    [Profiling.setAvatar, {}, { user }],
  ),
  then: setAvatar.actions(setAvatar.respond<SetAvatarOutput>({ request, user })),
}));

export const SetAvatarInvalidSession = setAvatar.sync((
  { request, session, active },
) => ({
  when: setAvatar.actions(setAvatar.request({ session }, { request })),
  where: async (frames) => {
    frames = await frames.query(Sessioning._isActive, { session }, { active });
    return frames.filter(($) => $[active] === false);
  },
  then: setAvatar.actions(
    setAvatar.error({ request, error: "Invalid or expired session." }),
  ),
}));

export const profilesApi = defineFeature({
  get: getProfile.define({ ProfileGetResponse }),
  setDisplayName: setDisplayName.define({
    SetDisplayNameResponse,
    SetDisplayNameRespond,
    SetDisplayNameInvalidSession,
  }),
  setBio: setBio.define({
    SetBioResponse,
    SetBioRespond,
    SetBioInvalidSession,
  }),
  setAvatar: setAvatar.define({
    SetAvatarResponse,
    SetAvatarRespond,
    SetAvatarInvalidSession,
  }),
});
