/**
 * Pinning synchronizations.
 *
 * Pinning an item within a scope is a privileged action: the acting user must
 * hold the `"pin"` capability in that scope (the scope doubles as the Roling
 * authorization context), so course staff — not students — can pin within a
 * given conversation/category.
 *
 * Endpoints:
 *   POST /pins/pin         { session, item, scope, priority } -> { pin }
 *   POST /pins/unpin       { session, item, scope }           -> { pin }
 *   POST /pins/setPriority { session, item, scope, priority } -> { pin }
 *   POST /pins/forScope    { scope }                          -> { pinned }
 *   POST /pins/isPinned    { item, scope }                    -> { pinned }
 */
import { Pinning, Roling, Sessioning } from "@concepts";
import {
  type ActionOk,
  defineEndpoint,
  type QueryRow,
} from "@concepts/Requesting/api.ts";

type PinOutput = ActionOk<typeof Pinning, "pin">;
type UnpinOutput = ActionOk<typeof Pinning, "unpin">;
type SetPriorityOutput = ActionOk<typeof Pinning, "setPriority">;
type PinsForScopeOutput = { pinned: QueryRow<typeof Pinning, "_getPinned">[] };
type IsPinnedOutput = { pinned: boolean };

/** The capability required to pin within a scope. */
const PIN_CAPABILITY = "pin";

// --- pin (requires the "pin" capability in the scope) ---

const pin = defineEndpoint(
  "/pins/pin",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    PinRequest: Sync(({ session, item, scope, priority, user, allowed }) => ({
      when: Actions(Request({ session, item, scope, priority })),
      where: async (frames) => {
        frames = await frames.query(Sessioning._getUser, { session }, { user });
        frames = await frames.query(
          Roling._hasCapability,
          { user, context: scope, capability: PIN_CAPABILITY },
          { allowed },
        );
        return frames.filter(($) => $[allowed] === true);
      },
      then: Actions([Pinning.pin, { item, scope, priority }]),
    })),

    PinResponse: Sync(({ pin }) => ({
      when: Actions([Pinning.pin, {}, { pin }]),
      then: Actions(Respond<PinOutput>({ pin })),
    })),

    PinError: Sync(({ error }) => ({
      when: Actions([Pinning.pin, {}, { error }]),
      then: Actions(Fail(error)),
    })),

    PinForbidden: Sync(({ session, item, scope, user, allowed }) => ({
      when: Actions(Request({ session, item, scope })),
      where: async (frames) => {
        frames = await frames.query(Sessioning._getUser, { session }, { user });
        frames = await frames.query(
          Roling._hasCapability,
          { user, context: scope, capability: PIN_CAPABILITY },
          { allowed },
        );
        return frames.filter(($) => $[allowed] === false);
      },
      then: Actions(Fail("Not authorized to pin in this scope.")),
    })),

    PinInvalidSession: Sync(({ session, active }) => ({
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

// --- unpin (requires the "pin" capability in the scope) ---

const unpin = defineEndpoint(
  "/pins/unpin",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    UnpinRequest: Sync(({ session, item, scope, user, allowed }) => ({
      when: Actions(Request({ session, item, scope })),
      where: async (frames) => {
        frames = await frames.query(Sessioning._getUser, { session }, { user });
        frames = await frames.query(
          Roling._hasCapability,
          { user, context: scope, capability: PIN_CAPABILITY },
          { allowed },
        );
        return frames.filter(($) => $[allowed] === true);
      },
      then: Actions([Pinning.unpin, { item, scope }]),
    })),

    UnpinResponse: Sync(({ pin }) => ({
      when: Actions([Pinning.unpin, {}, { pin }]),
      then: Actions(Respond<UnpinOutput>({ pin })),
    })),

    UnpinError: Sync(({ error }) => ({
      when: Actions([Pinning.unpin, {}, { error }]),
      then: Actions(Fail(error)),
    })),

    UnpinForbidden: Sync(({ session, item, scope, user, allowed }) => ({
      when: Actions(Request({ session, item, scope })),
      where: async (frames) => {
        frames = await frames.query(Sessioning._getUser, { session }, { user });
        frames = await frames.query(
          Roling._hasCapability,
          { user, context: scope, capability: PIN_CAPABILITY },
          { allowed },
        );
        return frames.filter(($) => $[allowed] === false);
      },
      then: Actions(Fail("Not authorized to pin in this scope.")),
    })),

    UnpinInvalidSession: Sync(({ session, active }) => ({
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

// --- setPriority (requires the "pin" capability in the scope) ---

const setPriority = defineEndpoint(
  "/pins/setPriority",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    SetPriorityRequest: Sync(
      ({ session, item, scope, priority, user, allowed }) => ({
        when: Actions(Request({ session, item, scope, priority })),
        where: async (frames) => {
          frames = await frames.query(
            Sessioning._getUser,
            { session },
            { user },
          );
          frames = await frames.query(
            Roling._hasCapability,
            { user, context: scope, capability: PIN_CAPABILITY },
            { allowed },
          );
          return frames.filter(($) => $[allowed] === true);
        },
        then: Actions([Pinning.setPriority, { item, scope, priority }]),
      }),
    ),

    SetPriorityResponse: Sync(({ pin }) => ({
      when: Actions([Pinning.setPriority, {}, { pin }]),
      then: Actions(Respond<SetPriorityOutput>({ pin })),
    })),

    SetPriorityError: Sync(({ error }) => ({
      when: Actions([Pinning.setPriority, {}, { error }]),
      then: Actions(Fail(error)),
    })),

    SetPriorityForbidden: Sync(({ session, item, scope, user, allowed }) => ({
      when: Actions(Request({ session, item, scope })),
      where: async (frames) => {
        frames = await frames.query(Sessioning._getUser, { session }, { user });
        frames = await frames.query(
          Roling._hasCapability,
          { user, context: scope, capability: PIN_CAPABILITY },
          { allowed },
        );
        return frames.filter(($) => $[allowed] === false);
      },
      then: Actions(Fail("Not authorized to pin in this scope.")),
    })),

    SetPriorityInvalidSession: Sync(({ session, active }) => ({
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

// --- forScope: public, priority-ordered list of pinned items ---

const forScope = defineEndpoint(
  "/pins/forScope",
  ({ Sync, Actions, Request, Respond }) => ({
    PinsForScopeResponse: Sync(({ scope, item, priority, pinned }) => ({
      when: Actions(Request({ scope })),
      where: async (frames) => {
        const [base] = frames;
        frames = await frames.query(
          Pinning._getPinned,
          { scope },
          { item, priority },
        );
        return frames.aggregate(base, [item, priority], pinned);
      },
      then: Actions(Respond<PinsForScopeOutput>({ pinned })),
    })),
  }),
);

// --- isPinned: public boolean check ---

const isPinned = defineEndpoint(
  "/pins/isPinned",
  ({ Sync, Actions, Request, Respond }) => ({
    IsPinnedResponse: Sync(({ item, scope, pinned }) => ({
      when: Actions(Request({ item, scope })),
      where: async (frames) =>
        await frames.query(Pinning._isPinned, { item, scope }, { pinned }),
      then: Actions(Respond<IsPinnedOutput>({ pinned })),
    })),
  }),
);

export const pinsApi = {
  pin,
  unpin,
  setPriority,
  forScope,
  isPinned,
};
