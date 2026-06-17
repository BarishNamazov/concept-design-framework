/**
 * LMS cross-concept event synchronizations.
 */
import {
  Assigning,
  Grading,
  Notifying,
  Roling,
  Rostering,
  StudentNoting,
} from "@concepts";
import { actions, type Sync } from "@engine";
import type { ID } from "@utils/types.ts";
import { FORUM_CONTEXT } from "./authorization.ts";

const COURSE_STAFF_ROLE = "course-staff";

const STAFF_CAPABILITIES = [
  "roster:manage",
  "assignments:manage",
  "submissions:view-all",
  "grades:manage",
  "grades:view-all",
  "late-days:manage",
  "student-notes:manage",
];

// ---------------------------------------------------------------------------
// ClaimedStaffSeatGetsStaffRole
// ---------------------------------------------------------------------------

/**
 * When a STAFF seat is claimed, always define the "course-staff" role
 * (no-op if it already exists) and grant it to the user.
 */

/** Define the role on every STAFF seat claim. defineRole errors if it exists — harmless. */
export const StaffSeatDefinesCourseStaffRole: Sync = ({ seatDoc, claimer }) => ({
  when: actions([Rostering.claimSeat, { user: claimer }, { seat: seatDoc }]),
  where: async (frames) =>
    frames.filter(($) => {
      const seat = $[seatDoc] as { kind: string };
      return seat.kind === "STAFF";
    }),
  then: actions([
    Roling.defineRole,
    { name: COURSE_STAFF_ROLE, capabilities: STAFF_CAPABILITIES },
  ]),
});

/** Grant newly-created role to the claiming user. */
export const StaffSeatGrantsNewCourseStaffRole: Sync = ({ claimer, role }) => ({
  when: actions(
    [Rostering.claimSeat, { user: claimer }, {}],
    [Roling.defineRole, { name: COURSE_STAFF_ROLE }, { role }],
  ),
  then: actions([Roling.grant, { user: claimer, context: FORUM_CONTEXT, role }]),
});

/** Grant the already-existing role to the claiming user. */
export const ClaimedStaffSeatGetsExistingRole: Sync = ({ claimer, role }) => ({
  when: actions([Rostering.claimSeat, { user: claimer }, {}]),
  where: async (frames) => {
    const [base] = frames;
    frames = await frames.query(
      Roling._getRoleByName,
      { name: COURSE_STAFF_ROLE },
      { role },
    );
    // _getRoleByName returns 0 rows when role doesn't exist, dropping frames.
    // Use aggregate so grant path only fires when role was already present.
    return frames.aggregate(base, [role], role);
  },
  then: actions([Roling.grant, { user: claimer, context: FORUM_CONTEXT, role }]),
});

// ---------------------------------------------------------------------------
// DroppedSeatRevokesRoles
// ---------------------------------------------------------------------------

export const DroppedSeatRevokesRoles: Sync = ({ seatDoc, droppedUser, role }) => ({
  when: actions([Rostering.dropSeat, {}, { seat: seatDoc }]),
  where: async (frames) => {
    frames = frames.flatMap(($) => {
      const seat = $[seatDoc] as { user?: ID };
      if (!seat.user) return [];
      return [{ ...$, [droppedUser]: seat.user }];
    });
    return await frames.query(
      Roling._getRoles,
      { user: droppedUser, context: FORUM_CONTEXT },
      { role },
    );
  },
  then: actions([Roling.revoke, { user: droppedUser, context: FORUM_CONTEXT, role }]),
});

// ---------------------------------------------------------------------------
// NewActiveStudentReceivesPublishedAssignments
// ---------------------------------------------------------------------------

export const NewStudentReceivesPublishedAssignments: Sync = ({
  seatDoc,
  claimer,
  section,
  assignment,
}) => ({
  when: actions([Rostering.claimSeat, { user: claimer }, { seat: seatDoc }]),
  where: async (frames) => {
    frames = frames.filter(($) => {
      const seat = $[seatDoc] as { kind: string };
      return seat.kind === "STUDENT";
    });
    frames = frames.flatMap(($) => {
      const seat = $[seatDoc] as { section?: ID };
      return [{ ...$, [section]: seat.section }];
    });
    return await frames.query(
      Assigning._getPublishedForAudience,
      { audience: section },
      { assignment },
    );
  },
  then: actions([Assigning.assign, { assignment, assignee: claimer }]),
});

// ---------------------------------------------------------------------------
// PublishAssignmentToAllActiveStudents
// ---------------------------------------------------------------------------

export const PublishEveryoneAssignsAll: Sync = ({ assignment, aud, user }) => ({
  when: actions([Assigning.publish, {}, { assignment }]),
  where: async (frames) => {
    frames = await frames.query(
      Assigning._getAssignment,
      { assignment },
      { audience: aud },
    );
    frames = frames.filter(($) => $[aud] === "EVERYONE");
    return await frames.query(Rostering._getActiveStudents, {}, { user });
  },
  then: actions([Assigning.assign, { assignment, assignee: user }]),
});

// ---------------------------------------------------------------------------
// PublishAssignmentToSectionStudents
// ---------------------------------------------------------------------------

export const PublishTargetsAssignsSectionStudents: Sync = ({
  assignment,
  aud,
  trgts,
  section,
  user,
}) => ({
  when: actions([Assigning.publish, {}, { assignment }]),
  where: async (frames) => {
    frames = await frames.query(
      Assigning._getAssignment,
      { assignment },
      { audience: aud, targets: trgts },
    );
    frames = frames.filter(
      ($) => $[aud] === "TARGETS" && ($[trgts] as ID[]).length > 0,
    );
    frames = frames.flatMap(($) => {
      const t = $[trgts] as ID[];
      return t.map((s) => ({ ...$, [section]: s }));
    });
    return await frames.query(
      Rostering._getActiveStudentsInSection,
      { section },
      { user },
    );
  },
  then: actions([Assigning.assign, { assignment, assignee: user }]),
});

// ---------------------------------------------------------------------------
// PublishedAssignmentCreatesGradeItem
// ---------------------------------------------------------------------------

export const PublishedAssignmentCreatesGradeItem: Sync = ({
  assignment,
  accSub,
}) => ({
  when: actions([Assigning.publish, {}, { assignment }]),
  where: async (frames) => {
    frames = await frames.query(
      Assigning._getAssignment,
      { assignment },
      { acceptsSubmissions: accSub },
    );
    return frames.filter(($) => $[accSub] === true);
  },
  then: actions([
    Grading.configureItem,
    { item: assignment, label: "Assignment", maxPoints: 100 },
  ]),
});

// ---------------------------------------------------------------------------
// StaffWritesStudentNote
// ---------------------------------------------------------------------------

export const StaffWritesVisibleStudentNote: Sync = ({
  author,
  learner,
  body,
  note,
}) => ({
  when: actions([
    StudentNoting.write,
    { author, learner, body, visibility: "LEARNER_VISIBLE" },
    { note },
  ]),
  then: actions([
    Notifying.notify,
    {
      recipient: learner,
      kind: "student_note",
      subject: "New note from your instructor",
      link: note,
    },
  ]),
});

export const eventSyncs = {
  StaffSeatDefinesCourseStaffRole,
  StaffSeatGrantsNewCourseStaffRole,
  ClaimedStaffSeatGetsExistingRole,
  DroppedSeatRevokesRoles,
  NewStudentReceivesPublishedAssignments,
  PublishEveryoneAssignsAll,
  PublishTargetsAssignsSectionStudents,
  PublishedAssignmentCreatesGradeItem,
  StaffWritesVisibleStudentNote,
};

export default eventSyncs;
