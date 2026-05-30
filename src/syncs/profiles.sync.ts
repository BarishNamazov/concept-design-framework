/**
 * Profile synchronizations.
 *
 * Endpoints:
 *   POST /profiles/get            { user }                 -> { profile }
 *   POST /profiles/setDisplayName { session, displayName } -> { user }
 *   POST /profiles/setBio         { session, bio }         -> { user }
 *   POST /profiles/setAvatar      { session, avatar }      -> { user }
 */
import { actions, type Sync } from "@engine";
import { Profiling, Requesting, Sessioning } from "@concepts";

// --- get: public lookup of a user's profile ---

export const ProfileGetResponse: Sync = ({ request, user, profile }) => ({
  when: actions([
    Requesting.request,
    { path: "/profiles/get", user },
    { request },
  ]),
  where: async (frames) =>
    await frames.query(Profiling._getProfile, { user }, { profile }),
  then: actions([Requesting.respond, { request, profile }]),
});

// --- setDisplayName ---

export const SetDisplayNameResponse: Sync = (
  { request, session, displayName, user },
) => ({
  when: actions([
    Requesting.request,
    { path: "/profiles/setDisplayName", session, displayName },
    { request },
  ]),
  where: async (frames) =>
    await frames.query(Sessioning._getUser, { session }, { user }),
  then: actions([Profiling.setDisplayName, { user, displayName }]),
});

export const SetDisplayNameRespond: Sync = ({ request, user }) => ({
  when: actions(
    [Requesting.request, { path: "/profiles/setDisplayName" }, { request }],
    [Profiling.setDisplayName, {}, { user }],
  ),
  then: actions([Requesting.respond, { request, user }]),
});

export const SetDisplayNameInvalidSession: Sync = (
  { request, session, active },
) => ({
  when: actions([
    Requesting.request,
    { path: "/profiles/setDisplayName", session },
    { request },
  ]),
  where: async (frames) => {
    frames = await frames.query(Sessioning._isActive, { session }, { active });
    return frames.filter(($) => $[active] === false);
  },
  then: actions([
    Requesting.respond,
    { request, error: "Invalid or expired session." },
  ]),
});

// --- setBio ---

export const SetBioResponse: Sync = ({ request, session, bio, user }) => ({
  when: actions([
    Requesting.request,
    { path: "/profiles/setBio", session, bio },
    { request },
  ]),
  where: async (frames) =>
    await frames.query(Sessioning._getUser, { session }, { user }),
  then: actions([Profiling.setBio, { user, bio }]),
});

export const SetBioRespond: Sync = ({ request, user }) => ({
  when: actions(
    [Requesting.request, { path: "/profiles/setBio" }, { request }],
    [Profiling.setBio, {}, { user }],
  ),
  then: actions([Requesting.respond, { request, user }]),
});

export const SetBioInvalidSession: Sync = ({ request, session, active }) => ({
  when: actions([
    Requesting.request,
    { path: "/profiles/setBio", session },
    { request },
  ]),
  where: async (frames) => {
    frames = await frames.query(Sessioning._isActive, { session }, { active });
    return frames.filter(($) => $[active] === false);
  },
  then: actions([
    Requesting.respond,
    { request, error: "Invalid or expired session." },
  ]),
});

// --- setAvatar ---

export const SetAvatarResponse: Sync = (
  { request, session, avatar, user },
) => ({
  when: actions([
    Requesting.request,
    { path: "/profiles/setAvatar", session, avatar },
    { request },
  ]),
  where: async (frames) =>
    await frames.query(Sessioning._getUser, { session }, { user }),
  then: actions([Profiling.setAvatar, { user, avatar }]),
});

export const SetAvatarRespond: Sync = ({ request, user }) => ({
  when: actions(
    [Requesting.request, { path: "/profiles/setAvatar" }, { request }],
    [Profiling.setAvatar, {}, { user }],
  ),
  then: actions([Requesting.respond, { request, user }]),
});

export const SetAvatarInvalidSession: Sync = (
  { request, session, active },
) => ({
  when: actions([
    Requesting.request,
    { path: "/profiles/setAvatar", session },
    { request },
  ]),
  where: async (frames) => {
    frames = await frames.query(Sessioning._isActive, { session }, { active });
    return frames.filter(($) => $[active] === false);
  },
  then: actions([
    Requesting.respond,
    { request, error: "Invalid or expired session." },
  ]),
});
