/**
 * Lock synchronizations.
 *
 * Endpoints:
 *   POST /locks/lock     { session, target } -> { target }
 *   POST /locks/unlock   { session, target } -> { target }
 *   POST /locks/isLocked { target }          -> { locked }
 *   POST /locks/list     {}                  -> { locked }
 */
import { Locking, Sessioning } from "@concepts";
import {
  type ActionOk,
  defineEndpoint,
  type QueryRow,
} from "@concepts/Requesting/api.ts";

type LockOutput = ActionOk<typeof Locking, "lock">;
type UnlockOutput = ActionOk<typeof Locking, "unlock">;
type IsLockedOutput = QueryRow<typeof Locking, "_isLocked">;
type LockListOutput = { locked: QueryRow<typeof Locking, "_getLocked">[] };

// --- lock ---

const lock = defineEndpoint(
  "/locks/lock",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    LockRequest: Sync(({ session, target, user }) => ({
      when: Actions(Request({ session, target })),
      where: async (frames) =>
        await frames.query(Sessioning._getUser, { session }, { user }),
      then: Actions([Locking.lock, { target }]),
    })),

    LockResponse: Sync(({ target }) => ({
      when: Actions([Locking.lock, {}, { target }]),
      then: Actions(Respond<LockOutput>({ target })),
    })),

    LockError: Sync(({ error }) => ({
      when: Actions([Locking.lock, {}, { error }]),
      then: Actions(Fail(error)),
    })),

    LockInvalidSession: Sync(({ session, active }) => ({
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

// --- unlock ---

const unlock = defineEndpoint(
  "/locks/unlock",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    UnlockRequest: Sync(({ session, target, user }) => ({
      when: Actions(Request({ session, target })),
      where: async (frames) =>
        await frames.query(Sessioning._getUser, { session }, { user }),
      then: Actions([Locking.unlock, { target }]),
    })),

    UnlockResponse: Sync(({ target }) => ({
      when: Actions([Locking.unlock, {}, { target }]),
      then: Actions(Respond<UnlockOutput>({ target })),
    })),

    UnlockError: Sync(({ error }) => ({
      when: Actions([Locking.unlock, {}, { error }]),
      then: Actions(Fail(error)),
    })),

    UnlockInvalidSession: Sync(({ session, active }) => ({
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

// --- isLocked: public ---

const isLocked = defineEndpoint(
  "/locks/isLocked",
  ({ Sync, Actions, Request, Respond }) => ({
    IsLockedResponse: Sync(({ target, locked }) => ({
      when: Actions(Request({ target })),
      where: async (frames) =>
        await frames.query(Locking._isLocked, { target }, { locked }),
      then: Actions(Respond<IsLockedOutput>({ locked })),
    })),
  }),
);

// --- list: public ---

const list = defineEndpoint(
  "/locks/list",
  ({ Sync, Actions, Request, Respond }) => ({
    LockListResponse: Sync(({ target, lockedAt, locked }) => ({
      when: Actions(Request()),
      where: async (frames) => {
        const [base] = frames;
        frames = await frames.query(
          Locking._getLocked,
          {},
          { target, lockedAt },
        );
        return frames.aggregate(base, [target, lockedAt], locked);
      },
      then: Actions(Respond<LockListOutput>({ locked })),
    })),
  }),
);

export const locksApi = {
  lock,
  unlock,
  isLocked,
  list,
};
