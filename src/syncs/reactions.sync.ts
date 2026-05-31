/**
 * Reaction synchronizations.
 *
 * Endpoints:
 *   POST /reactions/add       { session, target, kind } -> { reaction }
 *   POST /reactions/remove    { session, target, kind } -> { ok }
 *   POST /reactions/forTarget { target }                -> { reactions }
 */
import { Reacting, Sessioning } from "@concepts";
import {
  defineEndpoint,
  type ActionOk,
  type QueryRow,
} from "@concepts/Requesting/api.ts";

type ReactionAddOutput = ActionOk<typeof Reacting, "react">;
type ReactionRemoveOutput = { ok: true };
type ReactionsForTargetOutput = {
  reactions: QueryRow<typeof Reacting, "_getReactionsForTarget">[];
};

// --- add ---

const add = defineEndpoint("/reactions/add", ({
  Sync,
  Actions,
  Request,
  Respond,
  Fail,
}) => ({
  ReactionAddRequest: Sync(({ session, target, kind, user }) => ({
    when: Actions(Request({ session, target, kind })),
    where: async (frames) =>
      await frames.query(Sessioning._getUser, { session }, { user }),
    then: Actions([Reacting.react, { user, target, kind }]),
  })),

  ReactionAddResponse: Sync(({ reaction }) => ({
    when: Actions([Reacting.react, {}, { reaction }]),
    then: Actions(Respond<ReactionAddOutput>({ reaction })),
  })),

  ReactionAddError: Sync(({ error }) => ({
    when: Actions([Reacting.react, {}, { error }]),
    then: Actions(Fail(error)),
  })),

  ReactionAddInvalidSession: Sync(({ session, active }) => ({
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
}));

// --- remove ---

const remove = defineEndpoint("/reactions/remove", ({
  Sync,
  Actions,
  Request,
  Respond,
  Fail,
}) => ({
  ReactionRemoveRequest: Sync(({ session, target, kind, user }) => ({
    when: Actions(Request({ session, target, kind })),
    where: async (frames) =>
      await frames.query(Sessioning._getUser, { session }, { user }),
    then: Actions([Reacting.unreact, { user, target, kind }]),
  })),

  ReactionRemoveResponse: Sync(({ reaction }) => ({
    when: Actions([Reacting.unreact, {}, { reaction }]),
    then: Actions(Respond<ReactionRemoveOutput>({ ok: true })),
  })),

  ReactionRemoveError: Sync(({ error }) => ({
    when: Actions([Reacting.unreact, {}, { error }]),
    then: Actions(Fail(error)),
  })),

  ReactionRemoveInvalidSession: Sync(({ session, active }) => ({
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
}));

// --- forTarget: public ---

const forTarget = defineEndpoint("/reactions/forTarget", ({
  Sync,
  Actions,
  Request,
  Respond,
}) => ({
  ReactionForTargetResponse: Sync((
    { target, reaction, user, kind, reactions },
  ) => ({
    when: Actions(Request({ target })),
    where: async (frames) => {
      const [base] = frames;
      frames = await frames.query(
        Reacting._getReactionsForTarget,
        { target },
        { reaction, user, kind },
      );
      return frames.aggregate(base, [reaction, user, kind], reactions);
    },
    then: Actions(Respond<ReactionsForTargetOutput>({ reactions })),
  })),
}));

export const reactionsApi = {
  add,
  remove,
  forTarget,
};
