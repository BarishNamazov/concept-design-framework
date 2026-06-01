/**
 * Pinning synchronizations.
 *
 * Pinning an item within a scope is a privileged action: the acting user must
 * hold the `"pin"` capability either in that scope (the scope doubles as the
 * Roling authorization context) or in the global forum context, so course staff
 * can pin where delegated and forum administrators can pin anywhere.
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
import type { Frame, Frames } from "@engine";
import { FORUM_CONTEXT } from "./authorization.ts";

type PinOutput = ActionOk<typeof Pinning, "pin">;
type UnpinOutput = ActionOk<typeof Pinning, "unpin">;
type SetPriorityOutput = ActionOk<typeof Pinning, "setPriority">;
type PinsForScopeOutput = { pinned: QueryRow<typeof Pinning, "_getPinned">[] };
type IsPinnedOutput = { pinned: boolean };

/** The capability required to pin within a scope. */
const PIN_CAPABILITY = "pin";

interface PinCapabilityVars {
  session: symbol;
  user: symbol;
  scope: symbol;
  scopeAllowed: symbol;
  forumAllowed: symbol;
}

async function resolvePinCapability(
  frames: Frames,
  vars: PinCapabilityVars,
): Promise<Frames> {
  frames = await frames.query(
    Sessioning._getUser,
    { session: vars.session },
    { user: vars.user },
  );
  frames = await frames.query(
    Roling._hasCapability,
    { user: vars.user, context: vars.scope, capability: PIN_CAPABILITY },
    { allowed: vars.scopeAllowed },
  );
  return await frames.query(
    Roling._hasCapability,
    { user: vars.user, context: FORUM_CONTEXT, capability: PIN_CAPABILITY },
    { allowed: vars.forumAllowed },
  );
}

async function authorizePinCapable(
  frames: Frames,
  vars: PinCapabilityVars,
): Promise<Frames> {
  frames = await resolvePinCapability(frames, vars);
  return frames.filter(
    ($: Frame) =>
      $[vars.scopeAllowed] === true || $[vars.forumAllowed] === true,
  );
}

async function rejectPinIncapable(
  frames: Frames,
  vars: PinCapabilityVars,
): Promise<Frames> {
  frames = await resolvePinCapability(frames, vars);
  return frames.filter(
    ($: Frame) =>
      $[vars.scopeAllowed] === false && $[vars.forumAllowed] === false,
  );
}

// --- pin (requires scoped or forum-wide "pin" capability) ---

const pin = defineEndpoint(
  "/pins/pin",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    PinRequest: Sync(
      ({
        session,
        item,
        scope,
        priority,
        user,
        scopeAllowed,
        forumAllowed,
      }) => ({
        when: Actions(Request({ session, item, scope, priority })),
        where: (frames) =>
          authorizePinCapable(frames, {
            session,
            user,
            scope,
            scopeAllowed,
            forumAllowed,
          }),
        then: Actions([Pinning.pin, { item, scope, priority }]),
      }),
    ),

    PinResponse: Sync(({ pin }) => ({
      when: Actions([Pinning.pin, {}, { pin }]),
      then: Actions(Respond<PinOutput>({ pin })),
    })),

    PinError: Sync(({ error }) => ({
      when: Actions([Pinning.pin, {}, { error }]),
      then: Actions(Fail(error)),
    })),

    PinForbidden: Sync(
      ({ session, item, scope, user, scopeAllowed, forumAllowed }) => ({
        when: Actions(Request({ session, item, scope })),
        where: (frames) =>
          rejectPinIncapable(frames, {
            session,
            user,
            scope,
            scopeAllowed,
            forumAllowed,
          }),
        then: Actions(Fail("Not authorized to pin in this scope.")),
      }),
    ),

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

// --- unpin (requires scoped or forum-wide "pin" capability) ---

const unpin = defineEndpoint(
  "/pins/unpin",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    UnpinRequest: Sync(
      ({ session, item, scope, user, scopeAllowed, forumAllowed }) => ({
        when: Actions(Request({ session, item, scope })),
        where: (frames) =>
          authorizePinCapable(frames, {
            session,
            user,
            scope,
            scopeAllowed,
            forumAllowed,
          }),
        then: Actions([Pinning.unpin, { item, scope }]),
      }),
    ),

    UnpinResponse: Sync(({ pin }) => ({
      when: Actions([Pinning.unpin, {}, { pin }]),
      then: Actions(Respond<UnpinOutput>({ pin })),
    })),

    UnpinError: Sync(({ error }) => ({
      when: Actions([Pinning.unpin, {}, { error }]),
      then: Actions(Fail(error)),
    })),

    UnpinForbidden: Sync(
      ({ session, item, scope, user, scopeAllowed, forumAllowed }) => ({
        when: Actions(Request({ session, item, scope })),
        where: (frames) =>
          rejectPinIncapable(frames, {
            session,
            user,
            scope,
            scopeAllowed,
            forumAllowed,
          }),
        then: Actions(Fail("Not authorized to pin in this scope.")),
      }),
    ),

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

// --- setPriority (requires scoped or forum-wide "pin" capability) ---

const setPriority = defineEndpoint(
  "/pins/setPriority",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    SetPriorityRequest: Sync(
      ({
        session,
        item,
        scope,
        priority,
        user,
        scopeAllowed,
        forumAllowed,
      }) => ({
        when: Actions(Request({ session, item, scope, priority })),
        where: (frames) =>
          authorizePinCapable(frames, {
            session,
            user,
            scope,
            scopeAllowed,
            forumAllowed,
          }),
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

    SetPriorityForbidden: Sync(
      ({ session, item, scope, user, scopeAllowed, forumAllowed }) => ({
        when: Actions(Request({ session, item, scope })),
        where: (frames) =>
          rejectPinIncapable(frames, {
            session,
            user,
            scope,
            scopeAllowed,
            forumAllowed,
          }),
        then: Actions(Fail("Not authorized to pin in this scope.")),
      }),
    ),

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
