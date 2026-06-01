/**
 * Shared authorization helpers for the privileged "admin" endpoints.
 *
 * Several concepts expose globally privileged operations — managing roles,
 * locking threads, trashing content, and curating categories. Authorizing each
 * one by hand (resolve the session, check a capability, fail otherwise) is the
 * same dance the flag and pin syncs already perform inline; these helpers
 * capture it once so every privileged endpoint enforces it identically.
 *
 * Authority lives in the global {@link FORUM_CONTEXT} Roling context: a user may
 * perform a privileged action when they hold the required capability there.
 *
 * **Bootstrap.** A brand-new forum has no administrators, so demanding the
 * capability up front would lock everyone out forever. Until someone holds the
 * {@link ADMIN_CAPABILITY} in the forum context the gate stays *open*, letting
 * the first operator grant themselves an administrator role (the
 * "first registered account becomes instructor" pattern). The moment an
 * administrator exists the forum is "claimed" and enforcement kicks in for good.
 */
import { Roling, Sessioning } from "@concepts";
import type { Frame, Frames } from "@engine";

/** The global Roling context that authorizes forum-wide privileged actions. */
export const FORUM_CONTEXT = "forum";

/** Capability for structural administration (roles, categories). */
export const ADMIN_CAPABILITY = "administer";

/** Capability for moderation (locking, trashing, assigning categories). */
export const MODERATE_CAPABILITY = "moderate";

/** Logic variables a capability gate binds while resolving its decision. */
export interface CapabilityGateVars {
  /** The request's session handle (input). */
  session: symbol;
  /** Bound to the session's user. */
  user: symbol;
  /** Bound to whether `user` holds `capability` in the forum context. */
  allowed: symbol;
  /** Bound to whether the forum already has an administrator (is "claimed"). */
  present: symbol;
  /** The capability this endpoint requires. */
  capability: string;
}

/**
 * Resolve the acting user and the two booleans the gate decides on: whether the
 * user holds the required `capability`, and whether the forum has already been
 * claimed by an administrator.
 */
async function resolveCapability(
  frames: Frames,
  vars: CapabilityGateVars,
): Promise<Frames> {
  frames = await frames.query(
    Sessioning._getUser,
    { session: vars.session },
    { user: vars.user },
  );
  frames = await frames.query(
    Roling._hasCapability,
    { user: vars.user, context: FORUM_CONTEXT, capability: vars.capability },
    { allowed: vars.allowed },
  );
  frames = await frames.query(
    Roling._hasCapabilityHolder,
    { context: FORUM_CONTEXT, capability: ADMIN_CAPABILITY },
    { present: vars.present },
  );
  return frames;
}

/**
 * Keep only the frames permitted to perform the action: the user holds the
 * capability, or the forum is still unclaimed (bootstrap). Use in the `where` of
 * the success branch of a privileged endpoint.
 */
export async function authorizeCapable(
  frames: Frames,
  vars: CapabilityGateVars,
): Promise<Frames> {
  frames = await resolveCapability(frames, vars);
  return frames.filter(
    ($: Frame) => $[vars.allowed] === true || $[vars.present] === false,
  );
}

/**
 * Keep only the frames that must be rejected: the forum is claimed *and* the
 * user lacks the capability. Use in the `where` of a "forbidden" sync that
 * fails the request.
 */
export async function rejectIncapable(
  frames: Frames,
  vars: CapabilityGateVars,
): Promise<Frames> {
  frames = await resolveCapability(frames, vars);
  return frames.filter(
    ($: Frame) => $[vars.allowed] === false && $[vars.present] === true,
  );
}
