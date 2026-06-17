/**
 * LMS endpoint synchronizations.
 */
import {
  Assigning,
  Formatting,
  Grading,
  LateBanking,
  Posting,
  Roling,
  Rostering,
  Sessioning,
  StudentNoting,
  Submitting,
} from "@concepts";
import { defineEndpoint } from "@concepts/Requesting/api.ts";
import type { Frames } from "@engine";
import { FORUM_CONTEXT } from "./authorization.ts";

// ---------------------------------------------------------------------------
// where helpers
// ---------------------------------------------------------------------------

async function resolveSession(
  frames: Frames,
  session: symbol,
  fu: symbol,
): Promise<Frames> {
  return await frames.query(Sessioning._getUser, { session }, { user: fu });
}

async function requireCapability(
  frames: Frames,
  fu: symbol,
  cap: string,
  fa: symbol,
): Promise<Frames> {
  frames = await frames.query(
    Roling._hasCapability,
    { user: fu, context: FORUM_CONTEXT, capability: cap },
    { allowed: fa },
  );
  return frames.filter(($) => $[fa] === true);
}

async function requireActiveStudent(
  frames: Frames,
  session: symbol,
  fu: symbol,
  fa: symbol,
): Promise<Frames> {
  frames = await resolveSession(frames, session, fu);
  frames = await frames.query(
    Rostering._isActiveStudent,
    { user: fu },
    { active: fa },
  );
  return frames.filter(($) => $[fa] === true);
}

async function requireStaff(
  frames: Frames,
  session: symbol,
  fu: symbol,
  cap: string,
  fa: symbol,
): Promise<Frames> {
  frames = await resolveSession(frames, session, fu);
  return await requireCapability(frames, fu, cap, fa);
}

// ===========================================================================
// ROSTER API
// ===========================================================================

const ROSTER_MANAGE = "roster:manage";

const configureClass = defineEndpoint(
  "/roster/configure-class",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    RosterConfigureClass: Sync(
      ({ session, code, title, term, timezone, fu, fa }) => ({
        when: Actions(Request({ session, code, title, term, timezone })),
        where: async (f) =>
          await requireStaff(f, session, fu, ROSTER_MANAGE, fa),
        then: Actions([
          Rostering.configureClass,
          { code, title, term, timezone },
        ]),
      }),
    ),
    RosterConfigureClassOk: Sync(({ class: c }) => ({
      when: Actions([Rostering.configureClass, {}, { class: c }]),
      then: Actions(Respond({ class: c })),
    })),
    RosterConfigureClassErr: Sync(({ error }) => ({
      when: Actions([Rostering.configureClass, {}, { error }]),
      then: Actions(Fail(error)),
    })),
  }),
);

const rosterMe = defineEndpoint(
  "/roster/me",
  ({ Sync, Actions, Request, Respond }) => ({
    RosterMe: Sync(({ session, fu, seat }) => ({
      when: Actions(Request({ session })),
      where: async (f) => {
        f = await resolveSession(f, session, fu);
        return await f.query(Rostering._getSeatByUser, { user: fu }, { seat });
      },
      then: Actions(Respond({ seat })),
    })),
  }),
);

const rosterSectionsList = defineEndpoint(
  "/roster/sections/list",
  ({ Sync, Actions, Request, Respond }) => ({
    RosterSectionsList: Sync(
      ({ section, name, location, meetingPattern, status, sections }) => ({
        when: Actions(Request()),
        where: async (f) => {
          const [base] = f;
          f = await f.query(
            Rostering._getSections,
            {},
            { section, name, location, meetingPattern, status },
          );
          return f.aggregate(
            base,
            [section, name, location, meetingPattern, status],
            sections,
          );
        },
        then: Actions(Respond({ sections })),
      }),
    ),
  }),
);

const rosterSectionsCreate = defineEndpoint(
  "/roster/sections/create",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    RosterSectionsCreate: Sync(
      ({ session, name, location, meetingPattern, fu, fa }) => ({
        when: Actions(Request({ session, name, location, meetingPattern })),
        where: async (f) =>
          await requireStaff(f, session, fu, ROSTER_MANAGE, fa),
        then: Actions([
          Rostering.createSection,
          { name, location, meetingPattern },
        ]),
      }),
    ),
    RosterSectionsCreateOk: Sync(({ section: s }) => ({
      when: Actions([Rostering.createSection, {}, { section: s }]),
      then: Actions(Respond({ section: s })),
    })),
    RosterSectionsCreateErr: Sync(({ error }) => ({
      when: Actions([Rostering.createSection, {}, { error }]),
      then: Actions(Fail(error)),
    })),
  }),
);

const rosterSectionsUpdate = defineEndpoint(
  "/roster/sections/update",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    RosterSectionsUpdate: Sync(
      ({ session, section, name, location, meetingPattern, fu, fa }) => ({
        when: Actions(
          Request({ session, section, name, location, meetingPattern }),
        ),
        where: async (f) =>
          await requireStaff(f, session, fu, ROSTER_MANAGE, fa),
        then: Actions([
          Rostering.updateSection,
          { section, name, location, meetingPattern },
        ]),
      }),
    ),
    RosterSectionsUpdateOk: Sync(({ section: s }) => ({
      when: Actions([Rostering.updateSection, {}, { section: s }]),
      then: Actions(Respond({ section: s })),
    })),
    RosterSectionsUpdateErr: Sync(({ error }) => ({
      when: Actions([Rostering.updateSection, {}, { error }]),
      then: Actions(Fail(error)),
    })),
  }),
);

const rosterImportPreview = defineEndpoint(
  "/roster/import-preview",
  ({ Sync, Actions, Request, Respond }) => ({
    RosterImportPreview: Sync(({ csv, rows }) => ({
      when: Actions(Request({ csv })),
      where: async (f) =>
        f.map(($) => {
          const text = $[csv] as string;
          const lines = text.trim().split("\n");
          if (lines.length < 2)
            return { ...$, [rows]: [] as Record<string, string>[] };
          const headers = lines[0].split(",").map((h) => h.trim());
          const parsed = lines.slice(1).map((line) => {
            const vals = line.split(",").map((v) => v.trim());
            const obj: Record<string, string> = {};
            headers.forEach((h, i) => {
              obj[h] = vals[i] ?? "";
            });
            return obj;
          });
          return { ...$, [rows]: parsed };
        }),
      then: Actions(Respond({ rows })),
    })),
  }),
);

const rosterImport = defineEndpoint(
  "/roster/import",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    RosterImport: Sync(({ session, rows, fu, fa, ek, em, rn, kd, sc }) => ({
      when: Actions(Request({ session, rows })),
      where: async (f) => {
        f = await requireStaff(f, session, fu, ROSTER_MANAGE, fa);
        return f.flatMap(($) => {
          const arr = $[rows] as Record<string, string>[];
          return arr.map((r) => ({
            ...$,
            [ek]: r.externalKey ?? r.external_key ?? "",
            [em]: r.email ?? "",
            [rn]: r.rosterName ?? r.roster_name ?? r.name ?? "",
            [kd]: r.kind ?? "STUDENT",
            [sc]: r.section ?? undefined,
          }));
        });
      },
      then: Actions([
        Rostering.importSeat,
        { externalKey: ek, email: em, rosterName: rn, kind: kd, section: sc },
      ]),
    })),
    RosterImportOk: Sync(({ seat: s }) => ({
      when: Actions([Rostering.importSeat, {}, { seat: s }]),
      then: Actions(Respond({ seat: s })),
    })),
    RosterImportErr: Sync(({ error }) => ({
      when: Actions([Rostering.importSeat, {}, { error }]),
      then: Actions(Fail(error)),
    })),
  }),
);

const rosterClaimSeat = defineEndpoint(
  "/roster/claim-seat",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    RosterClaimSeat: Sync(({ session, externalKey, fu, seat }) => ({
      when: Actions(Request({ session, externalKey })),
      where: async (f) => {
        f = await resolveSession(f, session, fu);
        return await f.query(
          Rostering._getSeatByExternalKey,
          { externalKey },
          { seat },
        );
      },
      then: Actions([Rostering.claimSeat, { seat, user: fu }]),
    })),
    RosterClaimSeatOk: Sync(({ seat: s }) => ({
      when: Actions([Rostering.claimSeat, {}, { seat: s }]),
      then: Actions(Respond({ seat: s })),
    })),
    RosterClaimSeatErr: Sync(({ error }) => ({
      when: Actions([Rostering.claimSeat, {}, { error }]),
      then: Actions(Fail(error)),
    })),
  }),
);

const rosterLinkUser = defineEndpoint(
  "/roster/link-user",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    RosterLinkUser: Sync(({ session, seat, targetUser, fu, fa }) => ({
      when: Actions(Request({ session, seat, user: targetUser })),
      where: async (f) => await requireStaff(f, session, fu, ROSTER_MANAGE, fa),
      then: Actions([Rostering.linkUser, { seat, user: targetUser }]),
    })),
    RosterLinkUserOk: Sync(({ seat: s }) => ({
      when: Actions([Rostering.linkUser, {}, { seat: s }]),
      then: Actions(Respond({ seat: s })),
    })),
    RosterLinkUserErr: Sync(({ error }) => ({
      when: Actions([Rostering.linkUser, {}, { error }]),
      then: Actions(Fail(error)),
    })),
  }),
);

const rosterList = defineEndpoint(
  "/roster/list",
  ({ Sync, Actions, Request, Respond }) => ({
    RosterList: Sync(
      ({
        session,
        fu,
        fa,
        user,
        seat,
        kind,
        section,
        rosterName,
        email,
        members,
      }) => ({
        when: Actions(Request({ session })),
        where: async (f) => {
          const [base] = f;
          f = await requireStaff(f, session, fu, ROSTER_MANAGE, fa);
          f = await f.query(
            Rostering._getActiveMembers,
            {},
            { user, seat, kind, section, rosterName, email },
          );
          return f.aggregate(
            base,
            [user, seat, kind, section, rosterName, email],
            members,
          );
        },
        then: Actions(Respond({ members })),
      }),
    ),
  }),
);

const rosterDrop = defineEndpoint(
  "/roster/drop",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    RosterDrop: Sync(({ session, seat, fu, fa }) => ({
      when: Actions(Request({ session, seat })),
      where: async (f) => await requireStaff(f, session, fu, ROSTER_MANAGE, fa),
      then: Actions([Rostering.dropSeat, { seat }]),
    })),
    RosterDropOk: Sync(({ seat: s }) => ({
      when: Actions([Rostering.dropSeat, {}, { seat: s }]),
      then: Actions(Respond({ seat: s })),
    })),
    RosterDropErr: Sync(({ error }) => ({
      when: Actions([Rostering.dropSeat, {}, { error }]),
      then: Actions(Fail(error)),
    })),
  }),
);

const rosterReinstate = defineEndpoint(
  "/roster/reinstate",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    RosterReinstate: Sync(({ session, seat, fu, fa }) => ({
      when: Actions(Request({ session, seat })),
      where: async (f) => await requireStaff(f, session, fu, ROSTER_MANAGE, fa),
      then: Actions([Rostering.reinstateSeat, { seat }]),
    })),
    RosterReinstateOk: Sync(({ seat: s }) => ({
      when: Actions([Rostering.reinstateSeat, {}, { seat: s }]),
      then: Actions(Respond({ seat: s })),
    })),
    RosterReinstateErr: Sync(({ error }) => ({
      when: Actions([Rostering.reinstateSeat, {}, { error }]),
      then: Actions(Fail(error)),
    })),
  }),
);

const rosterMoveSection = defineEndpoint(
  "/roster/move-section",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    RosterMoveSection: Sync(({ session, seat, section, fu, fa }) => ({
      when: Actions(Request({ session, seat, section })),
      where: async (f) => await requireStaff(f, session, fu, ROSTER_MANAGE, fa),
      then: Actions([Rostering.moveSection, { seat, section }]),
    })),
    RosterMoveSectionOk: Sync(({ seat: s }) => ({
      when: Actions([Rostering.moveSection, {}, { seat: s }]),
      then: Actions(Respond({ seat: s })),
    })),
    RosterMoveSectionErr: Sync(({ error }) => ({
      when: Actions([Rostering.moveSection, {}, { error }]),
      then: Actions(Fail(error)),
    })),
  }),
);

export const rosterApi = {
  configureClass,
  me: rosterMe,
  sections: {
    list: rosterSectionsList,
    create: rosterSectionsCreate,
    update: rosterSectionsUpdate,
  },
  importPreview: rosterImportPreview,
  import: rosterImport,
  claimSeat: rosterClaimSeat,
  linkUser: rosterLinkUser,
  list: rosterList,
  drop: rosterDrop,
  reinstate: rosterReinstate,
  moveSection: rosterMoveSection,
};

// ===========================================================================
// ASSIGNMENTS API
// ===========================================================================

const ASSIGNMENTS_MANAGE = "assignments:manage";

const assignmentsCreateDraft = defineEndpoint(
  "/assignments/create-draft",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    AssignmentsCreateDraft: Sync(
      ({
        session,
        title,
        instructions,
        kind,
        availableAt,
        dueAt,
        closeAt,
        acceptsSubmissions,
        audience,
        targets,
        fu,
        fa,
      }) => ({
        when: Actions(
          Request({
            session,
            title,
            instructions,
            kind,
            availableAt,
            dueAt,
            closeAt,
            acceptsSubmissions,
            audience,
            targets,
          }),
        ),
        where: async (f) =>
          await requireStaff(f, session, fu, ASSIGNMENTS_MANAGE, fa),
        then: Actions([
          Assigning.createDraft,
          {
            author: fu,
            title,
            instructions,
            kind,
            availableAt,
            dueAt,
            closeAt,
            acceptsSubmissions,
            audience,
            targets,
          },
        ]),
      }),
    ),
    AssignmentsCreateDraftOk: Sync(({ assignment: a }) => ({
      when: Actions([Assigning.createDraft, {}, { assignment: a }]),
      then: Actions(Respond({ assignment: a })),
    })),
    AssignmentsCreateDraftErr: Sync(({ error }) => ({
      when: Actions([Assigning.createDraft, {}, { error }]),
      then: Actions(Fail(error)),
    })),
  }),
);

const assignmentsRevise = defineEndpoint(
  "/assignments/revise",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    AssignmentsRevise: Sync(
      ({
        session,
        assignment,
        title,
        instructions,
        kind,
        availableAt,
        dueAt,
        closeAt,
        acceptsSubmissions,
        audience,
        targets,
        fu,
        fa,
      }) => ({
        when: Actions(
          Request({
            session,
            assignment,
            title,
            instructions,
            kind,
            availableAt,
            dueAt,
            closeAt,
            acceptsSubmissions,
            audience,
            targets,
          }),
        ),
        where: async (f) =>
          await requireStaff(f, session, fu, ASSIGNMENTS_MANAGE, fa),
        then: Actions([
          Assigning.revise,
          {
            assignment,
            title,
            instructions,
            kind,
            availableAt,
            dueAt,
            closeAt,
            acceptsSubmissions,
            audience,
            targets,
          },
        ]),
      }),
    ),
    AssignmentsReviseOk: Sync(({ assignment: a }) => ({
      when: Actions([Assigning.revise, {}, { assignment: a }]),
      then: Actions(Respond({ assignment: a })),
    })),
    AssignmentsReviseErr: Sync(({ error }) => ({
      when: Actions([Assigning.revise, {}, { error }]),
      then: Actions(Fail(error)),
    })),
  }),
);

const assignmentsPublish = defineEndpoint(
  "/assignments/publish",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    AssignmentsPublish: Sync(({ session, assignment, fu, fa }) => ({
      when: Actions(Request({ session, assignment })),
      where: async (f) =>
        await requireStaff(f, session, fu, ASSIGNMENTS_MANAGE, fa),
      then: Actions([Assigning.publish, { assignment }]),
    })),
    AssignmentsPublishOk: Sync(({ assignment: a }) => ({
      when: Actions([Assigning.publish, {}, { assignment: a }]),
      then: Actions(Respond({ assignment: a })),
    })),
    AssignmentsPublishErr: Sync(({ error }) => ({
      when: Actions([Assigning.publish, {}, { error }]),
      then: Actions(Fail(error)),
    })),
  }),
);

const assignmentsArchive = defineEndpoint(
  "/assignments/archive",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    AssignmentsArchive: Sync(({ session, assignment, fu, fa }) => ({
      when: Actions(Request({ session, assignment })),
      where: async (f) =>
        await requireStaff(f, session, fu, ASSIGNMENTS_MANAGE, fa),
      then: Actions([Assigning.archive, { assignment }]),
    })),
    AssignmentsArchiveOk: Sync(({ assignment: a }) => ({
      when: Actions([Assigning.archive, {}, { assignment: a }]),
      then: Actions(Respond({ assignment: a })),
    })),
    AssignmentsArchiveErr: Sync(({ error }) => ({
      when: Actions([Assigning.archive, {}, { error }]),
      then: Actions(Fail(error)),
    })),
  }),
);

const assignmentsForMe = defineEndpoint(
  "/assignments/for-me",
  ({ Sync, Actions, Request, Respond }) => ({
    AssignmentsForMe: Sync(
      ({
        session,
        fu,
        fa,
        assignment,
        release,
        dueOverride,
        status,
        assigned,
      }) => ({
        when: Actions(Request({ session })),
        where: async (f) => {
          const [base] = f;
          f = await requireActiveStudent(f, session, fu, fa);
          f = await f.query(
            Assigning._getAssigned,
            { assignee: fu },
            { assignment, release, dueOverride, status },
          );
          return f.aggregate(
            base,
            [assignment, release, dueOverride, status],
            assigned,
          );
        },
        then: Actions(Respond({ assignments: assigned })),
      }),
    ),
  }),
);

const assignmentsGet = defineEndpoint(
  "/assignments/get",
  ({ Sync, Actions, Request, Respond }) => ({
    AssignmentsGet: Sync(
      ({
        assignment,
        asmtAssignment,
        author,
        title,
        instructions,
        kind,
        availableAt,
        dueAt,
        closeAt,
        acceptsSubmissions,
        audience,
        targets,
        status,
        createdAt,
        updatedAt,
        detail,
      }) => ({
        when: Actions(Request({ assignment })),
        where: async (f) => {
          const [base] = f;
          f = await f.query(
            Assigning._getAssignment,
            { assignment },
            {
              assignment: asmtAssignment,
              author,
              title,
              instructions,
              kind,
              availableAt,
              dueAt,
              closeAt,
              acceptsSubmissions,
              audience,
              targets,
              status,
              createdAt,
              updatedAt,
            },
          );
          return f.aggregate(
            base,
            [
              asmtAssignment,
              author,
              title,
              instructions,
              kind,
              availableAt,
              dueAt,
              closeAt,
              acceptsSubmissions,
              audience,
              targets,
              status,
              createdAt,
              updatedAt,
            ],
            detail,
          );
        },
        then: Actions(Respond({ assignment: detail })),
      }),
    ),
  }),
);

const assignmentsStaffSummary = defineEndpoint(
  "/assignments/staff-summary",
  ({ Sync, Actions, Request, Respond }) => ({
    AssignmentsStaffSummary: Sync(
      ({ session, assignment, fu, fa, detail }) => ({
        when: Actions(Request({ session, assignment })),
        where: async (f) => {
          f = await requireStaff(f, session, fu, ASSIGNMENTS_MANAGE, fa);
          return await f.query(
            Assigning._getAssignment,
            { assignment },
            { detail },
          );
        },
        then: Actions(Respond({ summary: detail })),
      }),
    ),
  }),
);

const assignmentsSetDueOverride = defineEndpoint(
  "/assignments/set-due-override",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    AssignmentsSetDueOverride: Sync(
      ({ session, assignment, assignee, dueAt, fu, fa }) => ({
        when: Actions(Request({ session, assignment, assignee, dueAt })),
        where: async (f) =>
          await requireStaff(f, session, fu, ASSIGNMENTS_MANAGE, fa),
        then: Actions([
          Assigning.setDueOverride,
          { assignment, assignee, dueAt },
        ]),
      }),
    ),
    AssignmentsSetDueOverrideOk: Sync(({ release: r }) => ({
      when: Actions([Assigning.setDueOverride, {}, { release: r }]),
      then: Actions(Respond({ release: r })),
    })),
    AssignmentsSetDueOverrideErr: Sync(({ error }) => ({
      when: Actions([Assigning.setDueOverride, {}, { error }]),
      then: Actions(Fail(error)),
    })),
  }),
);

const assignmentsClearDueOverride = defineEndpoint(
  "/assignments/clear-due-override",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    AssignmentsClearDueOverride: Sync(
      ({ session, assignment, assignee, fu, fa }) => ({
        when: Actions(Request({ session, assignment, assignee })),
        where: async (f) =>
          await requireStaff(f, session, fu, ASSIGNMENTS_MANAGE, fa),
        then: Actions([Assigning.clearDueOverride, { assignment, assignee }]),
      }),
    ),
    AssignmentsClearDueOverrideOk: Sync(({ release: r }) => ({
      when: Actions([Assigning.clearDueOverride, {}, { release: r }]),
      then: Actions(Respond({ release: r })),
    })),
    AssignmentsClearDueOverrideErr: Sync(({ error }) => ({
      when: Actions([Assigning.clearDueOverride, {}, { error }]),
      then: Actions(Fail(error)),
    })),
  }),
);

const assignmentsSubmit = defineEndpoint(
  "/assignments/submit",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    AssignmentsSubmitCreatePost: Sync(
      ({ session, assignment, content, fu, fa }) => ({
        when: Actions(Request({ session, assignment, content })),
        where: async (f) => await requireActiveStudent(f, session, fu, fa),
        then: Actions([Posting.create, { author: fu, content, assignment }]),
      }),
    ),
    AssignmentsSubmitFormat: Sync(({ post, content, assignment }) => ({
      when: Actions([Posting.create, { content, assignment }, { post }]),
      then: Actions([Formatting.setSource, { target: post, source: content }]),
    })),
    AssignmentsSubmitDo: Sync(({ assignment, fu, post }) => ({
      when: Actions(
        [Posting.create, { author: fu, assignment }, { post }],
        [Formatting.setSource, { target: post }, {}],
      ),
      then: Actions([
        Submitting.submit,
        { assignment, submitter: fu, artifact: post },
      ]),
    })),
    AssignmentsSubmitOk: Sync(({ submission: s }) => ({
      when: Actions([Submitting.submit, {}, { submission: s }]),
      then: Actions(Respond({ submission: s })),
    })),
    AssignmentsSubmitErr: Sync(({ error }) => ({
      when: Actions([Submitting.submit, {}, { error }]),
      then: Actions(Fail(error)),
    })),
  }),
);

export const assignmentsApi = {
  createDraft: assignmentsCreateDraft,
  revise: assignmentsRevise,
  publish: assignmentsPublish,
  archive: assignmentsArchive,
  forMe: assignmentsForMe,
  get: assignmentsGet,
  staffSummary: assignmentsStaffSummary,
  setDueOverride: assignmentsSetDueOverride,
  clearDueOverride: assignmentsClearDueOverride,
  submit: assignmentsSubmit,
};

// ===========================================================================
// SUBMISSIONS API
// ===========================================================================

const SUBMISSIONS_VIEW_ALL = "submissions:view-all";

const submissionsLatest = defineEndpoint(
  "/submissions/latest",
  ({ Sync, Actions, Request, Respond }) => ({
    SubmissionsLatest: Sync(({ assignment, submitter, result }) => ({
      when: Actions(Request({ assignment, submitter })),
      where: async (f) =>
        await f.query(
          Submitting._getLatest,
          { assignment, submitter },
          { result },
        ),
      then: Actions(Respond({ submission: result })),
    })),
  }),
);

const submissionsAttempts = defineEndpoint(
  "/submissions/attempts",
  ({ Sync, Actions, Request, Respond }) => ({
    SubmissionsAttempts: Sync(({ assignment, submitter, result }) => ({
      when: Actions(Request({ assignment, submitter })),
      where: async (f) =>
        await f.query(
          Submitting._getAttempts,
          { assignment, submitter },
          { result },
        ),
      then: Actions(Respond({ attempts: result })),
    })),
  }),
);

const submissionsForAssignment = defineEndpoint(
  "/submissions/for-assignment",
  ({ Sync, Actions, Request, Respond }) => ({
    SubmissionsForAssignment: Sync(
      ({ session, assignment, fu, fa, result }) => ({
        when: Actions(Request({ session, assignment })),
        where: async (f) => {
          f = await requireStaff(f, session, fu, SUBMISSIONS_VIEW_ALL, fa);
          return await f.query(
            Submitting._getSubmissionsForAssignment,
            { assignment },
            { result },
          );
        },
        then: Actions(Respond({ submissions: result })),
      }),
    ),
  }),
);

const submissionsForStudent = defineEndpoint(
  "/submissions/for-student",
  ({ Sync, Actions, Request, Respond }) => ({
    SubmissionsForStudent: Sync(({ submitter, result }) => ({
      when: Actions(Request({ submitter })),
      where: async (f) =>
        await f.query(
          Submitting._getSubmissionsForSubmitter,
          { submitter },
          { result },
        ),
      then: Actions(Respond({ submissions: result })),
    })),
  }),
);

export const submissionsApi = {
  latest: submissionsLatest,
  attempts: submissionsAttempts,
  forAssignment: submissionsForAssignment,
  forStudent: submissionsForStudent,
};

// ===========================================================================
// LATE-DAYS API
// ===========================================================================

const LATE_DAYS_MANAGE = "late-days:manage";

const lateDaysConfigurePolicy = defineEndpoint(
  "/late-days/configure-policy",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    LateDaysConfigurePolicy: Sync(
      ({ session, defaultDays, unitHours, maxDaysPerItem, fu, fa }) => ({
        when: Actions(
          Request({ session, defaultDays, unitHours, maxDaysPerItem }),
        ),
        where: async (f) =>
          await requireStaff(f, session, fu, LATE_DAYS_MANAGE, fa),
        then: Actions([
          LateBanking.configurePolicy,
          { defaultDays, unitHours, maxDaysPerItem },
        ]),
      }),
    ),
    LateDaysConfigurePolicyOk: Sync(({ policy: p }) => ({
      when: Actions([LateBanking.configurePolicy, {}, { policy: p }]),
      then: Actions(Respond({ policy: p })),
    })),
    LateDaysConfigurePolicyErr: Sync(({ error }) => ({
      when: Actions([LateBanking.configurePolicy, {}, { error }]),
      then: Actions(Fail(error)),
    })),
  }),
);

const lateDaysBalance = defineEndpoint(
  "/late-days/balance",
  ({ Sync, Actions, Request, Respond }) => ({
    LateDaysBalance: Sync(({ learner, result }) => ({
      when: Actions(Request({ learner })),
      where: async (f) =>
        await f.query(LateBanking._getBalance, { learner }, { result }),
      then: Actions(Respond({ balance: result })),
    })),
  }),
);

const lateDaysApply = defineEndpoint(
  "/late-days/apply",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    LateDaysApply: Sync(({ session, assignment, days, fu, fa }) => ({
      when: Actions(Request({ session, assignment, days })),
      where: async (f) => await requireActiveStudent(f, session, fu, fa),
      then: Actions([
        LateBanking.apply,
        { learner: fu, item: assignment, days },
      ]),
    })),
    LateDaysApplyOk: Sync(({ use: u }) => ({
      when: Actions([LateBanking.apply, {}, { use: u }]),
      then: Actions(Respond({ use: u })),
    })),
    LateDaysApplyErr: Sync(({ error }) => ({
      when: Actions([LateBanking.apply, {}, { error }]),
      then: Actions(Fail(error)),
    })),
  }),
);

const lateDaysChange = defineEndpoint(
  "/late-days/change",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    LateDaysChange: Sync(({ session, assignment, days, fu }) => ({
      when: Actions(Request({ session, assignment, days })),
      where: async (f) => await resolveSession(f, session, fu),
      then: Actions([
        LateBanking.changeUse,
        { learner: fu, item: assignment, days },
      ]),
    })),
    LateDaysChangeOk: Sync(({ use: u }) => ({
      when: Actions([LateBanking.changeUse, {}, { use: u }]),
      then: Actions(Respond({ use: u })),
    })),
    LateDaysChangeErr: Sync(({ error }) => ({
      when: Actions([LateBanking.changeUse, {}, { error }]),
      then: Actions(Fail(error)),
    })),
  }),
);

const lateDaysCancel = defineEndpoint(
  "/late-days/cancel",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    LateDaysCancel: Sync(({ session, assignment, fu }) => ({
      when: Actions(Request({ session, assignment })),
      where: async (f) => await resolveSession(f, session, fu),
      then: Actions([LateBanking.cancelUse, { learner: fu, item: assignment }]),
    })),
    LateDaysCancelOk: Sync(({ use: u }) => ({
      when: Actions([LateBanking.cancelUse, {}, { use: u }]),
      then: Actions(Respond({ use: u })),
    })),
    LateDaysCancelErr: Sync(({ error }) => ({
      when: Actions([LateBanking.cancelUse, {}, { error }]),
      then: Actions(Fail(error)),
    })),
  }),
);

const lateDaysGrant = defineEndpoint(
  "/late-days/grant",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    LateDaysGrant: Sync(({ session, learner, days, reason, fu, fa }) => ({
      when: Actions(Request({ session, learner, days, reason })),
      where: async (f) =>
        await requireStaff(f, session, fu, LATE_DAYS_MANAGE, fa),
      then: Actions([LateBanking.grant, { learner, days, reason }]),
    })),
    LateDaysGrantOk: Sync(({ grant: g }) => ({
      when: Actions([LateBanking.grant, {}, { grant: g }]),
      then: Actions(Respond({ grant: g })),
    })),
    LateDaysGrantErr: Sync(({ error }) => ({
      when: Actions([LateBanking.grant, {}, { error }]),
      then: Actions(Fail(error)),
    })),
  }),
);

const lateDaysList = defineEndpoint(
  "/late-days/list",
  ({ Sync, Actions, Request, Respond }) => ({
    LateDaysList: Sync(({ session, fu, fa }) => ({
      when: Actions(Request({ session })),
      where: async (f) =>
        await requireStaff(f, session, fu, LATE_DAYS_MANAGE, fa),
      then: Actions(Respond<{ uses: never[] }>({ uses: [] })),
    })),
  }),
);

const lateDaysForAssignment = defineEndpoint(
  "/late-days/for-assignment",
  ({ Sync, Actions, Request, Respond }) => ({
    LateDaysForAssignment: Sync(({ session, assignment, fu, fa, result }) => ({
      when: Actions(Request({ session, assignment })),
      where: async (f) => {
        f = await requireStaff(f, session, fu, LATE_DAYS_MANAGE, fa);
        return await f.query(
          LateBanking._getUsersForItem,
          { item: assignment },
          { result },
        );
      },
      then: Actions(Respond({ users: result })),
    })),
  }),
);

export const lateDaysApi = {
  configurePolicy: lateDaysConfigurePolicy,
  balance: lateDaysBalance,
  apply: lateDaysApply,
  change: lateDaysChange,
  cancel: lateDaysCancel,
  grant: lateDaysGrant,
  list: lateDaysList,
  forAssignment: lateDaysForAssignment,
};

// ===========================================================================
// GRADES API
// ===========================================================================

const GRADES_MANAGE = "grades:manage";
const GRADES_VIEW_ALL = "grades:view-all";

const gradesConfigureItem = defineEndpoint(
  "/grades/configure-item",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    GradesConfigureItem: Sync(
      ({ session, item, label, maxPoints, fu, fa }) => ({
        when: Actions(Request({ session, item, label, maxPoints })),
        where: async (f) =>
          await requireStaff(f, session, fu, GRADES_MANAGE, fa),
        then: Actions([Grading.configureItem, { item, label, maxPoints }]),
      }),
    ),
    GradesConfigureItemOk: Sync(({ gradeItem: g }) => ({
      when: Actions([Grading.configureItem, {}, { gradeItem: g }]),
      then: Actions(Respond({ gradeItem: g })),
    })),
    GradesConfigureItemErr: Sync(({ error }) => ({
      when: Actions([Grading.configureItem, {}, { error }]),
      then: Actions(Fail(error)),
    })),
  }),
);

const gradesAddCriterion = defineEndpoint(
  "/grades/add-criterion",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    GradesAddCriterion: Sync(
      ({ session, item, name, maxPoints, position, fu, fa }) => ({
        when: Actions(Request({ session, item, name, maxPoints, position })),
        where: async (f) =>
          await requireStaff(f, session, fu, GRADES_MANAGE, fa),
        then: Actions([
          Grading.addCriterion,
          { item, name, maxPoints, position },
        ]),
      }),
    ),
    GradesAddCriterionOk: Sync(({ criterion: c }) => ({
      when: Actions([Grading.addCriterion, {}, { criterion: c }]),
      then: Actions(Respond({ criterion: c })),
    })),
    GradesAddCriterionErr: Sync(({ error }) => ({
      when: Actions([Grading.addCriterion, {}, { error }]),
      then: Actions(Fail(error)),
    })),
  }),
);

const gradesReviseCriterion = defineEndpoint(
  "/grades/revise-criterion",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    GradesReviseCriterion: Sync(
      ({ session, criterion, name, maxPoints, position, fu, fa }) => ({
        when: Actions(
          Request({ session, criterion, name, maxPoints, position }),
        ),
        where: async (f) =>
          await requireStaff(f, session, fu, GRADES_MANAGE, fa),
        then: Actions([
          Grading.reviseCriterion,
          { criterion, name, maxPoints, position },
        ]),
      }),
    ),
    GradesReviseCriterionOk: Sync(({ criterion: c }) => ({
      when: Actions([Grading.reviseCriterion, {}, { criterion: c }]),
      then: Actions(Respond({ criterion: c })),
    })),
    GradesReviseCriterionErr: Sync(({ error }) => ({
      when: Actions([Grading.reviseCriterion, {}, { error }]),
      then: Actions(Fail(error)),
    })),
  }),
);

const gradesRemoveCriterion = defineEndpoint(
  "/grades/remove-criterion",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    GradesRemoveCriterion: Sync(({ session, criterion, fu, fa }) => ({
      when: Actions(Request({ session, criterion })),
      where: async (f) => await requireStaff(f, session, fu, GRADES_MANAGE, fa),
      then: Actions([Grading.removeCriterion, { criterion }]),
    })),
    GradesRemoveCriterionOk: Sync(({ criterion: c }) => ({
      when: Actions([Grading.removeCriterion, {}, { criterion: c }]),
      then: Actions(Respond({ criterion: c })),
    })),
    GradesRemoveCriterionErr: Sync(({ error }) => ({
      when: Actions([Grading.removeCriterion, {}, { error }]),
      then: Actions(Fail(error)),
    })),
  }),
);

const gradesRecord = defineEndpoint(
  "/grades/record",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    GradesRecord: Sync(
      ({ session, learner, item, evidence, score, feedback, fu, fa }) => ({
        when: Actions(
          Request({ session, learner, item, evidence, score, feedback }),
        ),
        where: async (f) =>
          await requireStaff(f, session, fu, GRADES_MANAGE, fa),
        then: Actions([
          Grading.recordDraft,
          { learner, item, evidence, grader: fu, score, feedback },
        ]),
      }),
    ),
    GradesRecordOk: Sync(({ grade: g }) => ({
      when: Actions([Grading.recordDraft, {}, { grade: g }]),
      then: Actions(Respond({ grade: g })),
    })),
    GradesRecordErr: Sync(({ error }) => ({
      when: Actions([Grading.recordDraft, {}, { error }]),
      then: Actions(Fail(error)),
    })),
  }),
);

const gradesScoreCriterion = defineEndpoint(
  "/grades/score-criterion",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    GradesScoreCriterion: Sync(
      ({ session, learner, item, criterion, points, feedback, fu, fa }) => ({
        when: Actions(
          Request({ session, learner, item, criterion, points, feedback }),
        ),
        where: async (f) =>
          await requireStaff(f, session, fu, GRADES_MANAGE, fa),
        then: Actions([
          Grading.scoreCriterion,
          { learner, item, criterion, grader: fu, points, feedback },
        ]),
      }),
    ),
    GradesScoreCriterionOk: Sync(({ criterionScore: cs }) => ({
      when: Actions([Grading.scoreCriterion, {}, { criterionScore: cs }]),
      then: Actions(Respond({ criterionScore: cs })),
    })),
    GradesScoreCriterionErr: Sync(({ error }) => ({
      when: Actions([Grading.scoreCriterion, {}, { error }]),
      then: Actions(Fail(error)),
    })),
  }),
);

const gradesRelease = defineEndpoint(
  "/grades/release",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    GradesRelease: Sync(({ session, learner, item, fu, fa }) => ({
      when: Actions(Request({ session, learner, item })),
      where: async (f) => await requireStaff(f, session, fu, GRADES_MANAGE, fa),
      then: Actions([Grading.release, { learner, item }]),
    })),
    GradesReleaseOk: Sync(({ grade: g }) => ({
      when: Actions([Grading.release, {}, { grade: g }]),
      then: Actions(Respond({ grade: g })),
    })),
    GradesReleaseErr: Sync(({ error }) => ({
      when: Actions([Grading.release, {}, { error }]),
      then: Actions(Fail(error)),
    })),
  }),
);

const gradesReleaseItem = defineEndpoint(
  "/grades/release-item",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    GradesReleaseItem: Sync(({ session, item, fu, fa, learner }) => ({
      when: Actions(Request({ session, item })),
      where: async (f) => {
        f = await requireStaff(f, session, fu, GRADES_MANAGE, fa);
        return await f.query(Grading._getDraftsForItem, { item }, { learner });
      },
      then: Actions([Grading.release, { learner, item }]),
    })),
    GradesReleaseItemOk: Sync(({ grade: g }) => ({
      when: Actions([Grading.release, {}, { grade: g }]),
      then: Actions(Respond({ grade: g })),
    })),
    GradesReleaseItemErr: Sync(({ error }) => ({
      when: Actions([Grading.release, {}, { error }]),
      then: Actions(Fail(error)),
    })),
  }),
);

const gradesRetract = defineEndpoint(
  "/grades/retract",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    GradesRetract: Sync(({ session, learner, item, fu, fa }) => ({
      when: Actions(Request({ session, learner, item })),
      where: async (f) => await requireStaff(f, session, fu, GRADES_MANAGE, fa),
      then: Actions([Grading.retract, { learner, item }]),
    })),
    GradesRetractOk: Sync(({ grade: g }) => ({
      when: Actions([Grading.retract, {}, { grade: g }]),
      then: Actions(Respond({ grade: g })),
    })),
    GradesRetractErr: Sync(({ error }) => ({
      when: Actions([Grading.retract, {}, { error }]),
      then: Actions(Fail(error)),
    })),
  }),
);

const gradesExcuse = defineEndpoint(
  "/grades/excuse",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    GradesExcuse: Sync(({ session, learner, item, feedback, fu, fa }) => ({
      when: Actions(Request({ session, learner, item, feedback })),
      where: async (f) => await requireStaff(f, session, fu, GRADES_MANAGE, fa),
      then: Actions([Grading.excuse, { learner, item, grader: fu, feedback }]),
    })),
    GradesExcuseOk: Sync(({ grade: g }) => ({
      when: Actions([Grading.excuse, {}, { grade: g }]),
      then: Actions(Respond({ grade: g })),
    })),
    GradesExcuseErr: Sync(({ error }) => ({
      when: Actions([Grading.excuse, {}, { error }]),
      then: Actions(Fail(error)),
    })),
  }),
);

const gradesForMe = defineEndpoint(
  "/grades/for-me",
  ({ Sync, Actions, Request, Respond }) => ({
    GradesForMe: Sync(({ session, fu, fa, result }) => ({
      when: Actions(Request({ session })),
      where: async (f) => {
        f = await requireActiveStudent(f, session, fu, fa);
        return await f.query(
          Grading._getGradesForLearner,
          { learner: fu },
          { result },
        );
      },
      then: Actions(Respond({ grades: result })),
    })),
  }),
);

const gradesForStudent = defineEndpoint(
  "/grades/for-student",
  ({ Sync, Actions, Request, Respond }) => ({
    GradesForStudent: Sync(({ session, learner, fu, fa, result }) => ({
      when: Actions(Request({ session, learner })),
      where: async (f) => {
        f = await requireStaff(f, session, fu, GRADES_VIEW_ALL, fa);
        return await f.query(
          Grading._getGradesForLearner,
          { learner },
          { result },
        );
      },
      then: Actions(Respond({ grades: result })),
    })),
  }),
);

const gradesForItem = defineEndpoint(
  "/grades/for-item",
  ({ Sync, Actions, Request, Respond }) => ({
    GradesForItem: Sync(({ session, item, fu, fa, result }) => ({
      when: Actions(Request({ session, item })),
      where: async (f) => {
        f = await requireStaff(f, session, fu, GRADES_VIEW_ALL, fa);
        return await f.query(Grading._getGradesForItem, { item }, { result });
      },
      then: Actions(Respond({ grades: result })),
    })),
  }),
);

const gradesGradebook = defineEndpoint(
  "/grades/gradebook",
  ({ Sync, Actions, Request, Respond }) => ({
    GradesGradebook: Sync(({ session, fu, fa, result }) => ({
      when: Actions(Request({ session })),
      where: async (f) => {
        f = await requireStaff(f, session, fu, GRADES_VIEW_ALL, fa);
        return await f.query(Rostering._getActiveStudents, {}, { result });
      },
      then: Actions(Respond({ learners: result })),
    })),
  }),
);

const gradesExport = defineEndpoint(
  "/grades/export",
  ({ Sync, Actions, Request, Respond }) => ({
    GradesExport: Sync(({ session, fu, fa, result }) => ({
      when: Actions(Request({ session })),
      where: async (f) => {
        f = await requireStaff(f, session, fu, GRADES_VIEW_ALL, fa);
        return await f.query(Rostering._getActiveStudents, {}, { result });
      },
      then: Actions(Respond({ csv: "" })),
    })),
  }),
);

export const gradesApi = {
  configureItem: gradesConfigureItem,
  addCriterion: gradesAddCriterion,
  reviseCriterion: gradesReviseCriterion,
  removeCriterion: gradesRemoveCriterion,
  record: gradesRecord,
  scoreCriterion: gradesScoreCriterion,
  release: gradesRelease,
  releaseItem: gradesReleaseItem,
  retract: gradesRetract,
  excuse: gradesExcuse,
  forMe: gradesForMe,
  forStudent: gradesForStudent,
  forItem: gradesForItem,
  gradebook: gradesGradebook,
  export: gradesExport,
};

// ===========================================================================
// STUDENT NOTES API
// ===========================================================================

const STUDENT_NOTES_MANAGE = "student-notes:manage";

const studentsDetail = defineEndpoint(
  "/students/detail",
  ({ Sync, Actions, Request, Respond }) => ({
    StudentsDetail: Sync(({ session, user: learner, fu, fa, result }) => ({
      when: Actions(Request({ session, user: learner })),
      where: async (f) => {
        f = await requireStaff(f, session, fu, STUDENT_NOTES_MANAGE, fa);
        return await f.query(
          Rostering._getSeatByUser,
          { user: learner },
          { result },
        );
      },
      then: Actions(Respond({ detail: result })),
    })),
  }),
);

const studentsNotesWrite = defineEndpoint(
  "/students/notes/write",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    StudentsNotesWrite: Sync(
      ({ session, learner, body, visibility, tags, followUpAt, fu, fa }) => ({
        when: Actions(
          Request({ session, learner, body, visibility, tags, followUpAt }),
        ),
        where: async (f) =>
          await requireStaff(f, session, fu, STUDENT_NOTES_MANAGE, fa),
        then: Actions([
          StudentNoting.write,
          { author: fu, learner, body, visibility, tags, followUpAt },
        ]),
      }),
    ),
    StudentsNotesWriteOk: Sync(({ note: n }) => ({
      when: Actions([StudentNoting.write, {}, { note: n }]),
      then: Actions(Respond({ note: n })),
    })),
    StudentsNotesWriteErr: Sync(({ error }) => ({
      when: Actions([StudentNoting.write, {}, { error }]),
      then: Actions(Fail(error)),
    })),
  }),
);

const studentsNotesRevise = defineEndpoint(
  "/students/notes/revise",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    StudentsNotesRevise: Sync(
      ({ session, note, body, visibility, tags, followUpAt, fu, fa }) => ({
        when: Actions(
          Request({ session, note, body, visibility, tags, followUpAt }),
        ),
        where: async (f) =>
          await requireStaff(f, session, fu, STUDENT_NOTES_MANAGE, fa),
        then: Actions([
          StudentNoting.revise,
          { note, body, visibility, tags, followUpAt },
        ]),
      }),
    ),
    StudentsNotesReviseOk: Sync(({ note: n }) => ({
      when: Actions([StudentNoting.revise, {}, { note: n }]),
      then: Actions(Respond({ note: n })),
    })),
    StudentsNotesReviseErr: Sync(({ error }) => ({
      when: Actions([StudentNoting.revise, {}, { error }]),
      then: Actions(Fail(error)),
    })),
  }),
);

const studentsNotesResolve = defineEndpoint(
  "/students/notes/resolve",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    StudentsNotesResolve: Sync(({ session, note, fu, fa }) => ({
      when: Actions(Request({ session, note })),
      where: async (f) =>
        await requireStaff(f, session, fu, STUDENT_NOTES_MANAGE, fa),
      then: Actions([StudentNoting.resolve, { note }]),
    })),
    StudentsNotesResolveOk: Sync(({ note: n }) => ({
      when: Actions([StudentNoting.resolve, {}, { note: n }]),
      then: Actions(Respond({ note: n })),
    })),
    StudentsNotesResolveErr: Sync(({ error }) => ({
      when: Actions([StudentNoting.resolve, {}, { error }]),
      then: Actions(Fail(error)),
    })),
  }),
);

const studentsNotesArchive = defineEndpoint(
  "/students/notes/archive",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    StudentsNotesArchive: Sync(({ session, note, fu, fa }) => ({
      when: Actions(Request({ session, note })),
      where: async (f) =>
        await requireStaff(f, session, fu, STUDENT_NOTES_MANAGE, fa),
      then: Actions([StudentNoting.archive, { note }]),
    })),
    StudentsNotesArchiveOk: Sync(({ note: n }) => ({
      when: Actions([StudentNoting.archive, {}, { note: n }]),
      then: Actions(Respond({ note: n })),
    })),
    StudentsNotesArchiveErr: Sync(({ error }) => ({
      when: Actions([StudentNoting.archive, {}, { error }]),
      then: Actions(Fail(error)),
    })),
  }),
);

const studentsNotesList = defineEndpoint(
  "/students/notes/list",
  ({ Sync, Actions, Request, Respond }) => ({
    StudentsNotesList: Sync(({ session, learner, fu, fa, result }) => ({
      when: Actions(Request({ session, learner })),
      where: async (f) => {
        f = await requireStaff(f, session, fu, STUDENT_NOTES_MANAGE, fa);
        return await f.query(
          StudentNoting._getActiveStaffNotes,
          { learner },
          { result },
        );
      },
      then: Actions(Respond({ notes: result })),
    })),
  }),
);

const studentsNotesVisible = defineEndpoint(
  "/students/notes/visible",
  ({ Sync, Actions, Request, Respond }) => ({
    StudentsNotesVisible: Sync(({ session, fu, fa, result }) => ({
      when: Actions(Request({ session })),
      where: async (f) => {
        f = await requireActiveStudent(f, session, fu, fa);
        return await f.query(
          StudentNoting._getLearnerVisibleNotes,
          { learner: fu },
          { result },
        );
      },
      then: Actions(Respond({ notes: result })),
    })),
  }),
);

const studentsNotesAcknowledge = defineEndpoint(
  "/students/notes/acknowledge",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    StudentsNotesAcknowledge: Sync(({ session, note, fu, fa }) => ({
      when: Actions(Request({ session, note })),
      where: async (f) => await requireActiveStudent(f, session, fu, fa),
      then: Actions([StudentNoting.acknowledge, { note, learner: fu }]),
    })),
    StudentsNotesAcknowledgeOk: Sync(({ note: n }) => ({
      when: Actions([StudentNoting.acknowledge, {}, { note: n }]),
      then: Actions(Respond({ note: n })),
    })),
    StudentsNotesAcknowledgeErr: Sync(({ error }) => ({
      when: Actions([StudentNoting.acknowledge, {}, { error }]),
      then: Actions(Fail(error)),
    })),
  }),
);

export const studentsApi = {
  detail: studentsDetail,
  notes: {
    write: studentsNotesWrite,
    revise: studentsNotesRevise,
    resolve: studentsNotesResolve,
    archive: studentsNotesArchive,
    list: studentsNotesList,
    visible: studentsNotesVisible,
    acknowledge: studentsNotesAcknowledge,
  },
};

// ===========================================================================
// DASHBOARD API
// ===========================================================================

const lmsMe = defineEndpoint(
  "/lms/me",
  ({ Sync, Actions, Request, Respond }) => ({
    LmsMe: Sync(
      ({
        session,
        fu,
        fa,
        seat,
        user,
        externalKey,
        email,
        rosterName,
        kind,
        section,
        status,
        dashboard,
      }) => ({
        when: Actions(Request({ session })),
        where: async (f) => {
          const [base] = f;
          f = await requireActiveStudent(f, session, fu, fa);
          f = await f.query(
            Rostering._getSeatByUser,
            { user: fu },
            {
              seat,
              user,
              externalKey,
              email,
              rosterName,
              kind,
              section,
              status,
            },
          );
          return f.aggregate(
            base,
            [seat, user, externalKey, email, rosterName, kind, section, status],
            dashboard,
          );
        },
        then: Actions(Respond({ dashboard })),
      }),
    ),
  }),
);

const lmsStaffDashboard = defineEndpoint(
  "/lms/staff-dashboard",
  ({ Sync, Actions, Request, Respond }) => ({
    LmsStaffDashboard: Sync(
      ({
        session,
        fu,
        fa,
        user,
        seat,
        kind,
        section,
        rosterName,
        email,
        dashboard,
      }) => ({
        when: Actions(Request({ session })),
        where: async (f) => {
          const [base] = f;
          f = await requireStaff(f, session, fu, "roster:manage", fa);
          f = await f.query(
            Rostering._getActiveMembers,
            {},
            { user, seat, kind, section, rosterName, email },
          );
          return f.aggregate(
            base,
            [user, seat, kind, section, rosterName, email],
            dashboard,
          );
        },
        then: Actions(Respond({ dashboard })),
      }),
    ),
  }),
);

export const lmsApi = { me: lmsMe, staffDashboard: lmsStaffDashboard };

// ===========================================================================
// CALENDAR API
// ===========================================================================

const CALENDAR_VIEW_STAFF = "calendar:view-staff";

const calendarMe = defineEndpoint(
  "/calendar/me",
  ({ Sync, Actions, Request, Respond }) => ({
    CalendarMe: Sync(({ session, start, end, fu, fa, assignment, events }) => ({
      when: Actions(Request({ session, start, end })),
      where: async (f) => {
        const [base] = f;
        f = await requireActiveStudent(f, session, fu, fa);
        f = await f.query(
          Assigning._getPublishedInWindow,
          { start, end },
          { assignment },
        );
        return f.aggregate(base, [assignment], events);
      },
      then: Actions(Respond({ events })),
    })),
  }),
);

const calendarStaff = defineEndpoint(
  "/calendar/staff",
  ({ Sync, Actions, Request, Respond }) => ({
    CalendarStaff: Sync(({ session, start, end, section, fu, fa, result }) => ({
      when: Actions(Request({ session, start, end, section })),
      where: async (f) => {
        f = await requireStaff(f, session, fu, CALENDAR_VIEW_STAFF, fa);
        return await f.query(
          Assigning._getPublishedInWindow,
          { start, end },
          { result },
        );
      },
      then: Actions(Respond({ events: result })),
    })),
  }),
);

export const calendarApi = { me: calendarMe, staff: calendarStaff };
