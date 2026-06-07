/**
 * Shared authorization helpers for privileged endpoints.
 *
 * Authority lives in the global {@link APP_CONTEXT} Roling context: a user may
 * perform a privileged action when they hold the required capability there.
 *
 * **Bootstrap.** A brand-new app has no administrators, so demanding the
 * capability up front would lock everyone out forever. Auth syncs automatically
 * grant the sole registered user an administrator role; until someone holds the
 * {@link ADMIN_CAPABILITY} in the app context the gate also stays *open* for
 * manual recovery. The moment an administrator exists the app is "claimed"
 * and enforcement kicks in for good.
 */
import { Roling, Sessioning } from "@concepts";
import type { Frame, Frames } from "@engine";

/** The global Roling context that authorizes app-wide privileged actions. */
export const APP_CONTEXT = "app";

/** Capability for structural administration (e.g. managing roles). */
export const ADMIN_CAPABILITY = "administer";

/** Logic variables a capability gate binds while resolving its decision. */
export interface CapabilityGateVars {
  /** The request's session handle (input). */
  session: symbol;
  /** Bound to the session's user. */
  user: symbol;
  /** Bound to whether `user` holds `capability` in the app context. */
  allowed: symbol;
  /** Bound to whether the app already has an administrator (is "claimed"). */
  present: symbol;
  /** The capability this endpoint requires. */
  capability: string;
}

/**
 * Resolve the acting user and the two booleans the gate decides on: whether the
 * user holds the required `capability`, and whether the app has already been
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
    { user: vars.user, context: APP_CONTEXT, capability: vars.capability },
    { allowed: vars.allowed },
  );
  frames = await frames.query(
    Roling._hasCapabilityHolder,
    { context: APP_CONTEXT, capability: ADMIN_CAPABILITY },
    { present: vars.present },
  );
  return frames;
}

/**
 * Keep only the frames permitted to perform the action: the user holds the
 * capability, or the app is still unclaimed (bootstrap). Use in the `where` of
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
 * Keep only the frames that must be rejected: the app is claimed *and* the
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
