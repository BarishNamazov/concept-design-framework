/**
 * Reaction synchronizations.
 *
 * Endpoints:
 *   POST /reactions/add       { session, target, kind } -> { reaction }
 *   POST /reactions/remove    { session, target, kind } -> { ok }
 *   POST /reactions/forTarget { target }                -> { reactions }
 */
import { Reacting, Sessioning } from "@concepts";
import type { ReactingConcept } from "@concepts";
import {
  defineFeature,
  requestingEndpoint,
  type ActionOk,
  type QueryRow,
} from "@concepts/Requesting/api.ts";

const add = requestingEndpoint("/reactions/add");
const remove = requestingEndpoint("/reactions/remove");
const forTarget = requestingEndpoint("/reactions/forTarget");

type ReactionAddOutput = ActionOk<ReactingConcept, "react">;
type ReactionRemoveOutput = { ok: true };
type ReactionsForTargetOutput = {
  reactions: QueryRow<ReactingConcept, "_getReactionsForTarget">[];
};

// --- add ---

export const ReactionAddRequest = add.sync((
  { request, session, target, kind, user },
) => ({
  when: add.actions(add.request({ session, target, kind }, { request })),
  where: async (frames) =>
    await frames.query(Sessioning._getUser, { session }, { user }),
  then: add.actions([Reacting.react, { user, target, kind }]),
}));

export const ReactionAddResponse = add.sync(({ request, reaction }) => ({
  when: add.actions(
    add.request({}, { request }),
    [Reacting.react, {}, { reaction }],
  ),
  then: add.actions(add.respond<ReactionAddOutput>({ request, reaction })),
}));

export const ReactionAddError = add.sync(({ request, error }) => ({
  when: add.actions(
    add.request({}, { request }),
    [Reacting.react, {}, { error }],
  ),
  then: add.actions(add.error({ request, error })),
}));

export const ReactionAddInvalidSession = add.sync((
  { request, session, active },
) => ({
  when: add.actions(add.request({ session }, { request })),
  where: async (frames) => {
    frames = await frames.query(Sessioning._isActive, { session }, { active });
    return frames.filter(($) => $[active] === false);
  },
  then: add.actions(add.error({ request, error: "Invalid or expired session." })),
}));

// --- remove ---

export const ReactionRemoveRequest = remove.sync((
  { request, session, target, kind, user },
) => ({
  when: remove.actions(remove.request({ session, target, kind }, { request })),
  where: async (frames) =>
    await frames.query(Sessioning._getUser, { session }, { user }),
  then: remove.actions([Reacting.unreact, { user, target, kind }]),
}));

export const ReactionRemoveResponse = remove.sync(({ request, reaction }) => ({
  when: remove.actions(
    remove.request({}, { request }),
    [Reacting.unreact, {}, { reaction }],
  ),
  then: remove.actions(
    remove.respond<ReactionRemoveOutput>({ request, ok: true }),
  ),
}));

export const ReactionRemoveError = remove.sync(({ request, error }) => ({
  when: remove.actions(
    remove.request({}, { request }),
    [Reacting.unreact, {}, { error }],
  ),
  then: remove.actions(remove.error({ request, error })),
}));

export const ReactionRemoveInvalidSession = remove.sync((
  { request, session, active },
) => ({
  when: remove.actions(remove.request({ session }, { request })),
  where: async (frames) => {
    frames = await frames.query(Sessioning._isActive, { session }, { active });
    return frames.filter(($) => $[active] === false);
  },
  then: remove.actions(
    remove.error({ request, error: "Invalid or expired session." }),
  ),
}));

// --- forTarget: public ---

export const ReactionForTargetResponse = forTarget.sync((
  { request, target, reaction, user, kind, reactions },
) => ({
  when: forTarget.actions(forTarget.request({ target }, { request })),
  where: async (frames) => {
    const [base] = frames;
    frames = await frames.query(
      Reacting._getReactionsForTarget,
      { target },
      { reaction, user, kind },
    );
    return frames.aggregate(base, [reaction, user, kind], reactions);
  },
  then: forTarget.actions(
    forTarget.respond<ReactionsForTargetOutput>({ request, reactions }),
  ),
}));

export const reactionsApi = defineFeature({
  add: add.define({
    ReactionAddRequest,
    ReactionAddResponse,
    ReactionAddError,
    ReactionAddInvalidSession,
  }),
  remove: remove.define({
    ReactionRemoveRequest,
    ReactionRemoveResponse,
    ReactionRemoveError,
    ReactionRemoveInvalidSession,
  }),
  forTarget: forTarget.define({ ReactionForTargetResponse }),
});
