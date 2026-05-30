/**
 * Tag synchronizations.
 *
 * Endpoints:
 *   POST /tags/create    { session, name }         -> { tag }
 *   POST /tags/add       { session, target, tag }  -> { target }
 *   POST /tags/remove    { session, target, tag }  -> { target }
 *   POST /tags/targets   { tag }                   -> { targets }
 *   POST /tags/forTarget { target }                -> { tags }
 */
import { actions, type Sync } from "@engine";
import { Requesting, Sessioning, Tagging } from "@concepts";

// --- create ---

export const TagCreateRequest: Sync = ({ request, session, name, user }) => ({
  when: actions([
    Requesting.request,
    { path: "/tags/create", session, name },
    { request },
  ]),
  where: async (frames) =>
    await frames.query(Sessioning._getUser, { session }, { user }),
  then: actions([Tagging.createTag, { name }]),
});

export const TagCreateResponse: Sync = ({ request, tag }) => ({
  when: actions(
    [Requesting.request, { path: "/tags/create" }, { request }],
    [Tagging.createTag, {}, { tag }],
  ),
  then: actions([Requesting.respond, { request, tag }]),
});

export const TagCreateError: Sync = ({ request, error }) => ({
  when: actions(
    [Requesting.request, { path: "/tags/create" }, { request }],
    [Tagging.createTag, {}, { error }],
  ),
  then: actions([Requesting.respond, { request, error }]),
});

export const TagCreateInvalidSession: Sync = (
  { request, session, active },
) => ({
  when: actions([
    Requesting.request,
    { path: "/tags/create", session },
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

// --- add ---

export const TagAddRequest: Sync = (
  { request, session, target, tag, user },
) => ({
  when: actions([
    Requesting.request,
    { path: "/tags/add", session, target, tag },
    { request },
  ]),
  where: async (frames) =>
    await frames.query(Sessioning._getUser, { session }, { user }),
  then: actions([Tagging.addTag, { target, tag }]),
});

export const TagAddResponse: Sync = ({ request, target }) => ({
  when: actions(
    [Requesting.request, { path: "/tags/add" }, { request }],
    [Tagging.addTag, {}, { target }],
  ),
  then: actions([Requesting.respond, { request, target }]),
});

export const TagAddError: Sync = ({ request, error }) => ({
  when: actions(
    [Requesting.request, { path: "/tags/add" }, { request }],
    [Tagging.addTag, {}, { error }],
  ),
  then: actions([Requesting.respond, { request, error }]),
});

export const TagAddInvalidSession: Sync = ({ request, session, active }) => ({
  when: actions([
    Requesting.request,
    { path: "/tags/add", session },
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

export const TagRemoveRequest: Sync = (
  { request, session, target, tag, user },
) => ({
  when: actions([
    Requesting.request,
    { path: "/tags/remove", session, target, tag },
    { request },
  ]),
  where: async (frames) =>
    await frames.query(Sessioning._getUser, { session }, { user }),
  then: actions([Tagging.removeTag, { target, tag }]),
});

export const TagRemoveResponse: Sync = ({ request, target }) => ({
  when: actions(
    [Requesting.request, { path: "/tags/remove" }, { request }],
    [Tagging.removeTag, {}, { target }],
  ),
  then: actions([Requesting.respond, { request, target }]),
});

export const TagRemoveError: Sync = ({ request, error }) => ({
  when: actions(
    [Requesting.request, { path: "/tags/remove" }, { request }],
    [Tagging.removeTag, {}, { error }],
  ),
  then: actions([Requesting.respond, { request, error }]),
});

export const TagRemoveInvalidSession: Sync = (
  { request, session, active },
) => ({
  when: actions([
    Requesting.request,
    { path: "/tags/remove", session },
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

// --- targets: public ---

export const TagTargetsResponse: Sync = (
  { request, tag, target, targets },
) => ({
  when: actions([
    Requesting.request,
    { path: "/tags/targets", tag },
    { request },
  ]),
  where: async (frames) => {
    const [base] = frames;
    frames = await frames.query(Tagging._getTargets, { tag }, { target });
    return frames.aggregate(base, [target], targets);
  },
  then: actions([Requesting.respond, { request, targets }]),
});

// --- forTarget: public ---

export const TagForTargetResponse: Sync = (
  { request, target, tag, name, tags },
) => ({
  when: actions([
    Requesting.request,
    { path: "/tags/forTarget", target },
    { request },
  ]),
  where: async (frames) => {
    const [base] = frames;
    frames = await frames.query(Tagging._getTags, { target }, { tag, name });
    return frames.aggregate(base, [tag, name], tags);
  },
  then: actions([Requesting.respond, { request, tags }]),
});
