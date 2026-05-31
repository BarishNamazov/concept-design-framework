/**
 * Flagging (community-standards reporting) synchronizations.
 *
 * Any signed-in user may raise a flag on a target. Resolving a flag is a
 * privileged moderation action: the acting user must hold the `"moderate"`
 * capability in the global `"forum"` context (granted via Roling).
 *
 * Endpoints:
 *   POST /flags/raise     { session, target, reason }  -> { flag }
 *   POST /flags/resolve   { session, target, outcome } -> { target }
 *   POST /flags/open      { session }                  -> { targets }
 *   POST /flags/forTarget { target }                   -> { flags }
 */
import { Flagging, Roling, Sessioning } from "@concepts";
import {
  type ActionOk,
  defineEndpoint,
  type QueryRow,
} from "@concepts/Requesting/api.ts";

type FlagRaiseOutput = ActionOk<typeof Flagging, "flag">;
type FlagResolveOutput = ActionOk<typeof Flagging, "resolve">;
type FlagsOpenOutput = {
  targets: QueryRow<typeof Flagging, "_getOpenTargets">[];
};
type FlagsForTargetOutput = {
  flags: QueryRow<typeof Flagging, "_getFlags">[];
};

/** The global context and capability that authorize moderation. */
const MODERATION_CONTEXT = "forum";
const MODERATE_CAPABILITY = "moderate";

// --- raise: any signed-in user reports a target ---

const raise = defineEndpoint(
  "/flags/raise",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    FlagRaiseRequest: Sync(({ session, target, reason, user }) => ({
      when: Actions(Request({ session, target, reason })),
      where: async (frames) =>
        await frames.query(Sessioning._getUser, { session }, { user }),
      then: Actions([Flagging.flag, { reporter: user, target, reason }]),
    })),

    FlagRaiseResponse: Sync(({ flag }) => ({
      when: Actions([Flagging.flag, {}, { flag }]),
      then: Actions(Respond<FlagRaiseOutput>({ flag })),
    })),

    FlagRaiseError: Sync(({ error }) => ({
      when: Actions([Flagging.flag, {}, { error }]),
      then: Actions(Fail(error)),
    })),

    FlagRaiseInvalidSession: Sync(({ session, active }) => ({
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

// --- resolve: requires the "moderate" capability ---

const resolve = defineEndpoint(
  "/flags/resolve",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    FlagResolveRequest: Sync(({ session, target, outcome, user, allowed }) => ({
      when: Actions(Request({ session, target, outcome })),
      where: async (frames) => {
        frames = await frames.query(Sessioning._getUser, { session }, { user });
        frames = await frames.query(
          Roling._hasCapability,
          {
            user,
            context: MODERATION_CONTEXT,
            capability: MODERATE_CAPABILITY,
          },
          { allowed },
        );
        return frames.filter(($) => $[allowed] === true);
      },
      then: Actions([Flagging.resolve, { target, outcome }]),
    })),

    FlagResolveResponse: Sync(({ target }) => ({
      when: Actions([Flagging.resolve, {}, { target }]),
      then: Actions(Respond<FlagResolveOutput>({ target })),
    })),

    FlagResolveError: Sync(({ error }) => ({
      when: Actions([Flagging.resolve, {}, { error }]),
      then: Actions(Fail(error)),
    })),

    FlagResolveForbidden: Sync(({ session, target, user, allowed }) => ({
      when: Actions(Request({ session, target })),
      where: async (frames) => {
        frames = await frames.query(Sessioning._getUser, { session }, { user });
        frames = await frames.query(
          Roling._hasCapability,
          {
            user,
            context: MODERATION_CONTEXT,
            capability: MODERATE_CAPABILITY,
          },
          { allowed },
        );
        return frames.filter(($) => $[allowed] === false);
      },
      then: Actions(Fail("Not authorized to resolve flags.")),
    })),

    FlagResolveInvalidSession: Sync(({ session, active }) => ({
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

// --- open: the moderation queue (signed-in users) ---

const open = defineEndpoint(
  "/flags/open",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    FlagsOpenResponse: Sync(({ session, user, target, count, targets }) => ({
      when: Actions(Request({ session })),
      where: async (frames) => {
        const [base] = frames;
        frames = await frames.query(Sessioning._getUser, { session }, { user });
        if (frames.length === 0) return frames;
        frames = await frames.query(
          Flagging._getOpenTargets,
          {},
          { target, count },
        );
        return frames.aggregate(base, [target, count], targets);
      },
      then: Actions(Respond<FlagsOpenOutput>({ targets })),
    })),

    FlagsOpenInvalidSession: Sync(({ session, active }) => ({
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

// --- forTarget: public list of a target's flags ---

const forTarget = defineEndpoint(
  "/flags/forTarget",
  ({ Sync, Actions, Request, Respond }) => ({
    FlagsForTargetResponse: Sync(
      ({ target, flag, reporter, reason, status, createdAt, flags }) => ({
        when: Actions(Request({ target })),
        where: async (frames) => {
          const [base] = frames;
          frames = await frames.query(
            Flagging._getFlags,
            { target },
            { flag, reporter, reason, status, createdAt },
          );
          return frames.aggregate(
            base,
            [flag, reporter, reason, status, createdAt],
            flags,
          );
        },
        then: Actions(Respond<FlagsForTargetOutput>({ flags })),
      }),
    ),
  }),
);

export const flagsApi = {
  raise,
  resolve,
  open,
  forTarget,
};
