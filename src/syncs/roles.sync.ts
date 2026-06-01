/**
 * Role synchronizations.
 *
 * Endpoints:
 *   POST /roles/define  { session, name, capabilities } -> { role }
 *   POST /roles/grant   { session, user, context, role } -> { grant }
 *   POST /roles/revoke  { session, user, context, role } -> { grant }
 *   POST /roles/forUser { user, context }                -> { roles }
 *   POST /roles/can     { user, context, capability }    -> { allowed }
 */
import { Roling, Sessioning } from "@concepts";
import {
  type ActionOk,
  defineEndpoint,
  type QueryRow,
} from "@concepts/Requesting/api.ts";
import {
  ADMIN_CAPABILITY,
  authorizeCapable,
  rejectIncapable,
} from "./authorization.ts";

type RoleDefineOutput = ActionOk<typeof Roling, "defineRole">;
type RoleGrantOutput = ActionOk<typeof Roling, "grant">;
type RoleRevokeOutput = ActionOk<typeof Roling, "revoke">;
type RolesForUserOutput = { roles: QueryRow<typeof Roling, "_getRoles">[] };
type RoleCanOutput = QueryRow<typeof Roling, "_hasCapability">;

// --- define ---

const define = defineEndpoint(
  "/roles/define",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    RoleDefineRequest: Sync(
      ({ session, name, capabilities, user, allowed, present }) => ({
        when: Actions(Request({ session, name, capabilities })),
        where: (frames) =>
          authorizeCapable(frames, {
            session,
            user,
            allowed,
            present,
            capability: ADMIN_CAPABILITY,
          }),
        then: Actions([Roling.defineRole, { name, capabilities }]),
      }),
    ),

    RoleDefineResponse: Sync(({ role }) => ({
      when: Actions([Roling.defineRole, {}, { role }]),
      then: Actions(Respond<RoleDefineOutput>({ role })),
    })),

    RoleDefineError: Sync(({ error }) => ({
      when: Actions([Roling.defineRole, {}, { error }]),
      then: Actions(Fail(error)),
    })),

    RoleDefineForbidden: Sync(({ session, user, allowed, present }) => ({
      when: Actions(Request({ session })),
      where: (frames) =>
        rejectIncapable(frames, {
          session,
          user,
          allowed,
          present,
          capability: ADMIN_CAPABILITY,
        }),
      then: Actions(Fail("Not authorized to manage roles.")),
    })),

    RoleDefineInvalidSession: Sync(({ session, active }) => ({
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

// --- grant ---

const grant = defineEndpoint(
  "/roles/grant",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    RoleGrantRequest: Sync(
      ({ session, user, context, role, actor, allowed, present }) => ({
        when: Actions(Request({ session, user, context, role })),
        where: async (frames) => {
          frames = await authorizeCapable(frames, {
            session,
            user: actor,
            allowed,
            present,
            capability: ADMIN_CAPABILITY,
          });
          // Allow grants to reference a role by its human-readable name as well
          // as by its id; resolve names to ids, leaving ids (and unknown values)
          // untouched so the grant action can validate existence.
          const resolved = await Promise.all(
            frames.map(async ($) => {
              const rows = await Roling._getRoleByName({
                name: $[role] as string,
              });
              return rows.length > 0 ? rows[0].role : ($[role] as string);
            }),
          );
          return frames.map(($, i) => ({ ...$, [role]: resolved[i] }));
        },
        then: Actions([Roling.grant, { user, context, role }]),
      }),
    ),

    RoleGrantResponse: Sync(({ grant }) => ({
      when: Actions([Roling.grant, {}, { grant }]),
      then: Actions(Respond<RoleGrantOutput>({ grant })),
    })),

    RoleGrantError: Sync(({ error }) => ({
      when: Actions([Roling.grant, {}, { error }]),
      then: Actions(Fail(error)),
    })),

    RoleGrantForbidden: Sync(({ session, user, allowed, present }) => ({
      when: Actions(Request({ session })),
      where: (frames) =>
        rejectIncapable(frames, {
          session,
          user,
          allowed,
          present,
          capability: ADMIN_CAPABILITY,
        }),
      then: Actions(Fail("Not authorized to manage roles.")),
    })),

    RoleGrantInvalidSession: Sync(({ session, active }) => ({
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

// --- revoke ---

const revoke = defineEndpoint(
  "/roles/revoke",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    RoleRevokeRequest: Sync(
      ({ session, user, context, role, actor, allowed, present }) => ({
        when: Actions(Request({ session, user, context, role })),
        where: (frames) =>
          authorizeCapable(frames, {
            session,
            user: actor,
            allowed,
            present,
            capability: ADMIN_CAPABILITY,
          }),
        then: Actions([Roling.revoke, { user, context, role }]),
      }),
    ),

    RoleRevokeResponse: Sync(({ grant }) => ({
      when: Actions([Roling.revoke, {}, { grant }]),
      then: Actions(Respond<RoleRevokeOutput>({ grant })),
    })),

    RoleRevokeError: Sync(({ error }) => ({
      when: Actions([Roling.revoke, {}, { error }]),
      then: Actions(Fail(error)),
    })),

    RoleRevokeForbidden: Sync(({ session, user, allowed, present }) => ({
      when: Actions(Request({ session })),
      where: (frames) =>
        rejectIncapable(frames, {
          session,
          user,
          allowed,
          present,
          capability: ADMIN_CAPABILITY,
        }),
      then: Actions(Fail("Not authorized to manage roles.")),
    })),

    RoleRevokeInvalidSession: Sync(({ session, active }) => ({
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

// --- forUser: public ---

const forUser = defineEndpoint(
  "/roles/forUser",
  ({ Sync, Actions, Request, Respond }) => ({
    RolesForUserResponse: Sync(({ user, context, role, roles }) => ({
      when: Actions(Request({ user, context })),
      where: async (frames) => {
        const [base] = frames;
        frames = await frames.query(
          Roling._getRoles,
          { user, context },
          { role },
        );
        return frames.aggregate(base, [role], roles);
      },
      then: Actions(Respond<RolesForUserOutput>({ roles })),
    })),
  }),
);

// --- can: public ---

const can = defineEndpoint(
  "/roles/can",
  ({ Sync, Actions, Request, Respond }) => ({
    RoleCanResponse: Sync(({ user, context, capability, allowed }) => ({
      when: Actions(Request({ user, context, capability })),
      where: async (frames) =>
        await frames.query(
          Roling._hasCapability,
          { user, context, capability },
          { allowed },
        ),
      then: Actions(Respond<RoleCanOutput>({ allowed })),
    })),
  }),
);

export const rolesApi = {
  define,
  grant,
  revoke,
  forUser,
  can,
};
