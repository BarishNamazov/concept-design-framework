/**
 * Reaction synchronizations.
 *
 * Endpoints:
 *   POST /reactions/add       { session, target, kind } -> { reaction }
 *   POST /reactions/remove    { session, target, kind } -> { ok }
 *   POST /reactions/forTarget { target }                -> { reactions }
 */
import { actions, type Sync } from "@engine";
import { Reacting, Requesting, Sessioning } from "@concepts";
import type { ReactingConcept } from "@concepts";
import type {
  ActionOk,
  EndpointInputs,
  InputShape,
  QueryRow,
} from "./contract.ts";

export const endpoints = {
  "/reactions/add": { input: ["session", "target", "kind"] },
  "/reactions/remove": { input: ["session", "target", "kind"] },
  "/reactions/forTarget": { input: ["target"] },
} as const satisfies EndpointInputs;

export type Endpoints = {
  "/reactions/add": {
    input: InputShape<(typeof endpoints)["/reactions/add"]["input"]>;
    output: ActionOk<ReactingConcept, "react">;
  };
  "/reactions/remove": {
    input: InputShape<(typeof endpoints)["/reactions/remove"]["input"]>;
    output: { ok: true };
  };
  "/reactions/forTarget": {
    input: InputShape<(typeof endpoints)["/reactions/forTarget"]["input"]>;
    output: {
      reactions: QueryRow<ReactingConcept, "_getReactionsForTarget">[];
    };
  };
};

// --- add ---

export const ReactionAddRequest: Sync = (
  { request, session, target, kind, user },
) => ({
  when: actions([
    Requesting.request,
    { path: "/reactions/add", session, target, kind },
    { request },
  ]),
  where: async (frames) =>
    await frames.query(Sessioning._getUser, { session }, { user }),
  then: actions([Reacting.react, { user, target, kind }]),
});

export const ReactionAddResponse: Sync = ({ request, reaction }) => ({
  when: actions(
    [Requesting.request, { path: "/reactions/add" }, { request }],
    [Reacting.react, {}, { reaction }],
  ),
  then: actions([Requesting.respond, { request, reaction }]),
});

export const ReactionAddError: Sync = ({ request, error }) => ({
  when: actions(
    [Requesting.request, { path: "/reactions/add" }, { request }],
    [Reacting.react, {}, { error }],
  ),
  then: actions([Requesting.respond, { request, error }]),
});

export const ReactionAddInvalidSession: Sync = (
  { request, session, active },
) => ({
  when: actions([
    Requesting.request,
    { path: "/reactions/add", session },
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

// --- remove ---

export const ReactionRemoveRequest: Sync = (
  { request, session, target, kind, user },
) => ({
  when: actions([
    Requesting.request,
    { path: "/reactions/remove", session, target, kind },
    { request },
  ]),
  where: async (frames) =>
    await frames.query(Sessioning._getUser, { session }, { user }),
  then: actions([Reacting.unreact, { user, target, kind }]),
});

export const ReactionRemoveResponse: Sync = ({ request, reaction }) => ({
  when: actions(
    [Requesting.request, { path: "/reactions/remove" }, { request }],
    [Reacting.unreact, {}, { reaction }],
  ),
  then: actions([Requesting.respond, { request, ok: true }]),
});

export const ReactionRemoveError: Sync = ({ request, error }) => ({
  when: actions(
    [Requesting.request, { path: "/reactions/remove" }, { request }],
    [Reacting.unreact, {}, { error }],
  ),
  then: actions([Requesting.respond, { request, error }]),
});

export const ReactionRemoveInvalidSession: Sync = (
  { request, session, active },
) => ({
  when: actions([
    Requesting.request,
    { path: "/reactions/remove", session },
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

// --- forTarget: public ---

export const ReactionForTargetResponse: Sync = (
  { request, target, reaction, user, kind, reactions },
) => ({
  when: actions([
    Requesting.request,
    { path: "/reactions/forTarget", target },
    { request },
  ]),
  where: async (frames) => {
    const [base] = frames;
    frames = await frames.query(
      Reacting._getReactionsForTarget,
      { target },
      { reaction, user, kind },
    );
    return frames.aggregate(base, [reaction, user, kind], reactions);
  },
  then: actions([Requesting.respond, { request, reactions }]),
});
