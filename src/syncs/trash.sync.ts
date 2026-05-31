/**
 * Trash synchronizations.
 *
 * Endpoints:
 *   POST /trash/trash     { session, item } -> { item }
 *   POST /trash/restore   { session, item } -> { item }
 *   POST /trash/purge     { session, item } -> { item }
 *   POST /trash/list      {}               -> { trashed }
 *   POST /trash/isTrashed { item }          -> { trashed }
 */
import { Sessioning, Trashing } from "@concepts";
import {
  type ActionOk,
  defineEndpoint,
  type QueryRow,
} from "@concepts/Requesting/api.ts";

type TrashOutput = ActionOk<typeof Trashing, "trash">;
type RestoreOutput = ActionOk<typeof Trashing, "restore">;
type PurgeOutput = ActionOk<typeof Trashing, "purge">;
type IsTrashedOutput = QueryRow<typeof Trashing, "_isTrashed">;
type TrashListOutput = { trashed: QueryRow<typeof Trashing, "_getTrashed">[] };

// --- trash ---

const trash = defineEndpoint(
  "/trash/trash",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    TrashRequest: Sync(({ session, item, user }) => ({
      when: Actions(Request({ session, item })),
      where: async (frames) =>
        await frames.query(Sessioning._getUser, { session }, { user }),
      then: Actions([Trashing.trash, { item, by: user }]),
    })),

    TrashResponse: Sync(({ item }) => ({
      when: Actions([Trashing.trash, {}, { item }]),
      then: Actions(Respond<TrashOutput>({ item })),
    })),

    TrashError: Sync(({ error }) => ({
      when: Actions([Trashing.trash, {}, { error }]),
      then: Actions(Fail(error)),
    })),

    TrashInvalidSession: Sync(({ session, active }) => ({
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

// --- restore ---

const restore = defineEndpoint(
  "/trash/restore",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    RestoreRequest: Sync(({ session, item, user }) => ({
      when: Actions(Request({ session, item })),
      where: async (frames) =>
        await frames.query(Sessioning._getUser, { session }, { user }),
      then: Actions([Trashing.restore, { item }]),
    })),

    RestoreResponse: Sync(({ item }) => ({
      when: Actions([Trashing.restore, {}, { item }]),
      then: Actions(Respond<RestoreOutput>({ item })),
    })),

    RestoreError: Sync(({ error }) => ({
      when: Actions([Trashing.restore, {}, { error }]),
      then: Actions(Fail(error)),
    })),

    RestoreInvalidSession: Sync(({ session, active }) => ({
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

// --- purge ---

const purge = defineEndpoint(
  "/trash/purge",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    PurgeRequest: Sync(({ session, item, user }) => ({
      when: Actions(Request({ session, item })),
      where: async (frames) =>
        await frames.query(Sessioning._getUser, { session }, { user }),
      then: Actions([Trashing.purge, { item }]),
    })),

    PurgeResponse: Sync(({ item }) => ({
      when: Actions([Trashing.purge, {}, { item }]),
      then: Actions(Respond<PurgeOutput>({ item })),
    })),

    PurgeError: Sync(({ error }) => ({
      when: Actions([Trashing.purge, {}, { error }]),
      then: Actions(Fail(error)),
    })),

    PurgeInvalidSession: Sync(({ session, active }) => ({
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

// --- isTrashed: public ---

const isTrashed = defineEndpoint(
  "/trash/isTrashed",
  ({ Sync, Actions, Request, Respond }) => ({
    IsTrashedResponse: Sync(({ item, trashed }) => ({
      when: Actions(Request({ item })),
      where: async (frames) =>
        await frames.query(Trashing._isTrashed, { item }, { trashed }),
      then: Actions(Respond<IsTrashedOutput>({ trashed })),
    })),
  }),
);

// --- list: public ---

const list = defineEndpoint(
  "/trash/list",
  ({ Sync, Actions, Request, Respond }) => ({
    TrashListResponse: Sync(({ item, trashedBy, trashedAt, trashed }) => ({
      when: Actions(Request()),
      where: async (frames) => {
        const [base] = frames;
        frames = await frames.query(
          Trashing._getTrashed,
          {},
          { item, trashedBy, trashedAt },
        );
        return frames.aggregate(base, [item, trashedBy, trashedAt], trashed);
      },
      then: Actions(Respond<TrashListOutput>({ trashed })),
    })),
  }),
);

export const trashApi = {
  trash,
  restore,
  purge,
  list,
  isTrashed,
};
