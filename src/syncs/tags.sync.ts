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
  defineEndpoint,
  type ActionOk,
  type QueryRow,
} from "@concepts/Requesting/api.ts";

type TagCreateOutput = ActionOk<typeof Tagging, "createTag">;
type TagAddOutput = ActionOk<typeof Tagging, "addTag">;
type TagRemoveOutput = ActionOk<typeof Tagging, "removeTag">;
type TagTargetsOutput = { targets: QueryRow<typeof Tagging, "_getTargets">[] };
type TagForTargetOutput = { tags: QueryRow<typeof Tagging, "_getTags">[] };

// --- create ---

const create = defineEndpoint("/tags/create", ({
  Sync,
  Actions,
  Request,
  Respond,
  Fail,
}) => ({
  TagCreateRequest: Sync(({ session, name, user }) => ({
    when: Actions(Request({ session, name })),
    where: async (frames) =>
      await frames.query(Sessioning._getUser, { session }, { user }),
    then: Actions([Tagging.createTag, { name }]),
  })),

  TagCreateResponse: Sync(({ tag }) => ({
    when: Actions([Tagging.createTag, {}, { tag }]),
    then: Actions(Respond<TagCreateOutput>({ tag })),
  })),

  TagCreateError: Sync(({ error }) => ({
    when: Actions([Tagging.createTag, {}, { error }]),
    then: Actions(Fail(error)),
  })),

  TagCreateInvalidSession: Sync(({ session, active }) => ({
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

// --- add ---

const add = defineEndpoint("/tags/add", ({
  Sync,
  Actions,
  Request,
  Respond,
  Fail,
}) => ({
  TagAddRequest: Sync(({ session, target, tag, user }) => ({
    when: Actions(Request({ session, target, tag })),
    where: async (frames) =>
      await frames.query(Sessioning._getUser, { session }, { user }),
    then: Actions([Tagging.addTag, { target, tag }]),
  })),

  TagAddResponse: Sync(({ target }) => ({
    when: Actions([Tagging.addTag, {}, { target }]),
    then: Actions(Respond<TagAddOutput>({ target })),
  })),

  TagAddError: Sync(({ error }) => ({
    when: Actions([Tagging.addTag, {}, { error }]),
    then: Actions(Fail(error)),
  })),

  TagAddInvalidSession: Sync(({ session, active }) => ({
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

const remove = defineEndpoint("/tags/remove", ({
  Sync,
  Actions,
  Request,
  Respond,
  Fail,
}) => ({
  TagRemoveRequest: Sync(({ session, target, tag, user }) => ({
    when: Actions(Request({ session, target, tag })),
    where: async (frames) =>
      await frames.query(Sessioning._getUser, { session }, { user }),
    then: Actions([Tagging.removeTag, { target, tag }]),
  })),

  TagRemoveResponse: Sync(({ target }) => ({
    when: Actions([Tagging.removeTag, {}, { target }]),
    then: Actions(Respond<TagRemoveOutput>({ target })),
  })),

  TagRemoveError: Sync(({ error }) => ({
    when: Actions([Tagging.removeTag, {}, { error }]),
    then: Actions(Fail(error)),
  })),

  TagRemoveInvalidSession: Sync(({ session, active }) => ({
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

// --- targets: public ---

const tagTargets = defineEndpoint("/tags/targets", ({
  Sync,
  Actions,
  Request,
  Respond,
}) => ({
  TagTargetsResponse: Sync(({ tag, target, targets }) => ({
    when: Actions(Request({ tag })),
    where: async (frames) => {
      const [base] = frames;
      frames = await frames.query(Tagging._getTargets, { tag }, { target });
      return frames.aggregate(base, [target], targets);
    },
    then: Actions(Respond<TagTargetsOutput>({ targets })),
  })),
}));

// --- forTarget: public ---

const forTarget = defineEndpoint("/tags/forTarget", ({
  Sync,
  Actions,
  Request,
  Respond,
}) => ({
  TagForTargetResponse: Sync(({ target, tag, name, tags }) => ({
    when: Actions(Request({ target })),
    where: async (frames) => {
      const [base] = frames;
      frames = await frames.query(Tagging._getTags, { target }, { tag, name });
      return frames.aggregate(base, [tag, name], tags);
    },
    then: Actions(Respond<TagForTargetOutput>({ tags })),
  })),
}));

export const tagsApi = {
  create,
  add,
  remove,
  targets: tagTargets,
  forTarget,
};
