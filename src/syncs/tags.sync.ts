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
import { Sessioning, Tagging } from "@concepts";
import {
  defineFeature,
  requestingEndpoint,
  type ActionOk,
  type QueryRow,
} from "@concepts/Requesting/api.ts";

const create = requestingEndpoint("/tags/create");
const add = requestingEndpoint("/tags/add");
const remove = requestingEndpoint("/tags/remove");
const tagTargets = requestingEndpoint("/tags/targets");
const forTarget = requestingEndpoint("/tags/forTarget");

type TagCreateOutput = ActionOk<typeof Tagging, "createTag">;
type TagAddOutput = ActionOk<typeof Tagging, "addTag">;
type TagRemoveOutput = ActionOk<typeof Tagging, "removeTag">;
type TagTargetsOutput = { targets: QueryRow<typeof Tagging, "_getTargets">[] };
type TagForTargetOutput = { tags: QueryRow<typeof Tagging, "_getTags">[] };

// --- create ---

export const TagCreateRequest = create.sync(({ request, session, name, user }) => ({
  when: create.actions(create.request({ session, name }, { request })),
  where: async (frames) =>
    await frames.query(Sessioning._getUser, { session }, { user }),
  then: create.actions([Tagging.createTag, { name }]),
}));

export const TagCreateResponse = create.sync(({ request, tag }) => ({
  when: create.actions(
    create.request({}, { request }),
    [Tagging.createTag, {}, { tag }],
  ),
  then: create.actions(create.respond<TagCreateOutput>({ request, tag })),
}));

export const TagCreateError = create.sync(({ request, error }) => ({
  when: create.actions(
    create.request({}, { request }),
    [Tagging.createTag, {}, { error }],
  ),
  then: create.actions(create.error({ request, error })),
}));

export const TagCreateInvalidSession = create.sync((
  { request, session, active },
) => ({
  when: create.actions(create.request({ session }, { request })),
  where: async (frames) => {
    frames = await frames.query(Sessioning._isActive, { session }, { active });
    return frames.filter(($) => $[active] === false);
  },
  then: create.actions(
    create.error({ request, error: "Invalid or expired session." }),
  ),
}));

// --- add ---

export const TagAddRequest = add.sync((
  { request, session, target, tag, user },
) => ({
  when: add.actions(add.request({ session, target, tag }, { request })),
  where: async (frames) =>
    await frames.query(Sessioning._getUser, { session }, { user }),
  then: add.actions([Tagging.addTag, { target, tag }]),
}));

export const TagAddResponse = add.sync(({ request, target }) => ({
  when: add.actions(
    add.request({}, { request }),
    [Tagging.addTag, {}, { target }],
  ),
  then: add.actions(add.respond<TagAddOutput>({ request, target })),
}));

export const TagAddError = add.sync(({ request, error }) => ({
  when: add.actions(
    add.request({}, { request }),
    [Tagging.addTag, {}, { error }],
  ),
  then: add.actions(add.error({ request, error })),
}));

export const TagAddInvalidSession = add.sync(({ request, session, active }) => ({
  when: add.actions(add.request({ session }, { request })),
  where: async (frames) => {
    frames = await frames.query(Sessioning._isActive, { session }, { active });
    return frames.filter(($) => $[active] === false);
  },
  then: add.actions(add.error({ request, error: "Invalid or expired session." })),
}));

// --- remove ---

export const TagRemoveRequest = remove.sync((
  { request, session, target, tag, user },
) => ({
  when: remove.actions(remove.request({ session, target, tag }, { request })),
  where: async (frames) =>
    await frames.query(Sessioning._getUser, { session }, { user }),
  then: remove.actions([Tagging.removeTag, { target, tag }]),
}));

export const TagRemoveResponse = remove.sync(({ request, target }) => ({
  when: remove.actions(
    remove.request({}, { request }),
    [Tagging.removeTag, {}, { target }],
  ),
  then: remove.actions(remove.respond<TagRemoveOutput>({ request, target })),
}));

export const TagRemoveError = remove.sync(({ request, error }) => ({
  when: remove.actions(
    remove.request({}, { request }),
    [Tagging.removeTag, {}, { error }],
  ),
  then: remove.actions(remove.error({ request, error })),
}));

export const TagRemoveInvalidSession = remove.sync((
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

// --- targets: public ---

export const TagTargetsResponse = tagTargets.sync((
  { request, tag, target, targets },
) => ({
  when: tagTargets.actions(tagTargets.request({ tag }, { request })),
  where: async (frames) => {
    const [base] = frames;
    frames = await frames.query(Tagging._getTargets, { tag }, { target });
    return frames.aggregate(base, [target], targets);
  },
  then: tagTargets.actions(
    tagTargets.respond<TagTargetsOutput>({ request, targets }),
  ),
}));

// --- forTarget: public ---

export const TagForTargetResponse = forTarget.sync((
  { request, target, tag, name, tags },
) => ({
  when: forTarget.actions(forTarget.request({ target }, { request })),
  where: async (frames) => {
    const [base] = frames;
    frames = await frames.query(Tagging._getTags, { target }, { tag, name });
    return frames.aggregate(base, [tag, name], tags);
  },
  then: forTarget.actions(
    forTarget.respond<TagForTargetOutput>({ request, tags }),
  ),
}));

export const tagsApi = defineFeature({
  create: create.define({
    TagCreateRequest,
    TagCreateResponse,
    TagCreateError,
    TagCreateInvalidSession,
  }),
  add: add.define({
    TagAddRequest,
    TagAddResponse,
    TagAddError,
    TagAddInvalidSession,
  }),
  remove: remove.define({
    TagRemoveRequest,
    TagRemoveResponse,
    TagRemoveError,
    TagRemoveInvalidSession,
  }),
  targets: tagTargets.define({ TagTargetsResponse }),
  forTarget: forTarget.define({ TagForTargetResponse }),
});
