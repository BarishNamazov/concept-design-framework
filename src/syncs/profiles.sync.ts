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
  type ActionOk,
  defineEndpoint,
  type QueryRow,
} from "@concepts/Requesting/api.ts";

type ProfileGetOutput = QueryRow<typeof Profiling, "_getProfile">;
type SetDisplayNameOutput = ActionOk<typeof Profiling, "setDisplayName">;
type SetBioOutput = ActionOk<typeof Profiling, "setBio">;
type SetAvatarOutput = ActionOk<typeof Profiling, "setAvatar">;

// --- get: public lookup of a user's profile ---

const getProfile = defineEndpoint(
  "/profiles/get",
  ({ Sync, Actions, Request, Respond }) => ({
    ProfileGetResponse: Sync(({ user, profile }) => ({
      when: Actions(Request({ user })),
      where: async (frames) =>
        await frames.query(Profiling._getProfile, { user }, { profile }),
      then: Actions(Respond<ProfileGetOutput>({ profile })),
    })),
  }),
);

// --- setDisplayName ---

const setDisplayName = defineEndpoint(
  "/profiles/setDisplayName",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    SetDisplayNameResponse: Sync(({ session, displayName, user }) => ({
      when: Actions(Request({ session, displayName })),
      where: async (frames) =>
        await frames.query(Sessioning._getUser, { session }, { user }),
      then: Actions([Profiling.setDisplayName, { user, displayName }]),
    })),

    SetDisplayNameRespond: Sync(({ user }) => ({
      when: Actions([Profiling.setDisplayName, {}, { user }]),
      then: Actions(Respond<SetDisplayNameOutput>({ user })),
    })),

    SetDisplayNameInvalidSession: Sync(({ session, active }) => ({
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

// --- setBio ---

const setBio = defineEndpoint(
  "/profiles/setBio",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    SetBioResponse: Sync(({ session, bio, user }) => ({
      when: Actions(Request({ session, bio })),
      where: async (frames) =>
        await frames.query(Sessioning._getUser, { session }, { user }),
      then: Actions([Profiling.setBio, { user, bio }]),
    })),

    SetBioRespond: Sync(({ user }) => ({
      when: Actions([Profiling.setBio, {}, { user }]),
      then: Actions(Respond<SetBioOutput>({ user })),
    })),

    SetBioInvalidSession: Sync(({ session, active }) => ({
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

// --- setAvatar ---

const setAvatar = defineEndpoint(
  "/profiles/setAvatar",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    SetAvatarResponse: Sync(({ session, avatar, user }) => ({
      when: Actions(Request({ session, avatar })),
      where: async (frames) =>
        await frames.query(Sessioning._getUser, { session }, { user }),
      then: Actions([Profiling.setAvatar, { user, avatar }]),
    })),

    SetAvatarRespond: Sync(({ user }) => ({
      when: Actions([Profiling.setAvatar, {}, { user }]),
      then: Actions(Respond<SetAvatarOutput>({ user })),
    })),

    SetAvatarInvalidSession: Sync(({ session, active }) => ({
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

export const profilesApi = {
  get: getProfile,
  setDisplayName,
  setBio,
  setAvatar,
};
