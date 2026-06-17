import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { setupApp, type TestApp } from "@utils/app_testing.ts";
import type { ID } from "@utils/types.ts";

let app: TestApp;

beforeEach(async () => {
  if (!app) app = await setupApp();
  await app.reset();
});

afterAll(async () => {
  await app?.stop();
});

async function registerUser(
  username: string,
  password: string,
  displayName: string,
): Promise<{ session: string; user: ID }> {
  await app.send("/auth/register", { username, password, displayName });
  const login = await app.send("/auth/login", { username, password });
  return { session: login.session as string, user: login.user as ID };
}

async function setupAdmin(): Promise<{ session: string; user: ID }> {
  const admin = await registerUser("admin", "pw", "Admin");
  const { role } = await app.send("/roles/define", {
    session: admin.session,
    name: "lms-admin",
    capabilities: [
      "roster:manage",
      "assignments:manage",
      "submissions:view-all",
      "grades:manage",
      "grades:view-all",
      "late-days:manage",
      "student-notes:manage",
    ],
  });
  await app.send("/roles/grant", {
    session: admin.session,
    user: admin.user,
    context: "forum",
    role,
  });
  return admin;
}

async function configureClass(admin: { session: string }) {
  return await app.send("/roster/configure-class", {
    session: admin.session,
    code: "CS101",
    title: "Intro to CS",
    term: "Fall 2026",
    timezone: "America/New_York",
  });
}

function row(entry: Partial<Record<string, string>>): Record<string, string> {
  return {
    externalKey: "",
    email: "",
    rosterName: "",
    kind: "STUDENT",
    section: "",
    ...entry,
  };
}

async function importRows(
  admin: { session: string },
  rows: Record<string, string>[],
) {
  return await app.send("/roster/import", { session: admin.session, rows });
}

async function withStudent(_admin: { session: string }, key: string) {
  const student = await registerUser(key, "pw", key);
  await app.send("/roster/claim-seat", {
    session: student.session,
    externalKey: key,
  });
  return student;
}

async function setupStudentAndAssignment(
  admin: { session: string },
  studentKey: string,
) {
  await importRows(admin, [
    row({
      externalKey: studentKey,
      email: `${studentKey}@test.com`,
      rosterName: studentKey,
    }),
  ]);
  const student = await withStudent(admin, studentKey);

  const now = Date.now();
  const draft = await app.send("/assignments/create-draft", {
    session: admin.session,
    title: "HW1",
    instructions: "Submit work.",
    kind: "HOMEWORK",
    availableAt: new Date(now + 86400000).toISOString(),
    dueAt: new Date(now + 7 * 86400000).toISOString(),
    closeAt: new Date(now + 14 * 86400000).toISOString(),
    acceptsSubmissions: true,
    audience: "EVERYONE",
    targets: [],
  });
  await app.send("/assignments/publish", {
    session: admin.session,
    assignment: draft.assignment,
  });
  return { admin, student, assignment: draft.assignment as string };
}

function iso(daysFromNow: number): string {
  return new Date(Date.now() + daysFromNow * 86400000).toISOString();
}

// =============================================================================
// ROSTER
// =============================================================================

describe("roster", () => {
  // --- configureClass ---

  test("configures class and _getClass returns data", async () => {
    const admin = await setupAdmin();
    const cls = await configureClass(admin);
    expect(cls.class).toBeDefined();
    const clsDoc = cls.class as Record<string, unknown>;
    expect(clsDoc.code).toBe("CS101");
    expect(clsDoc.status).toBe("ACTIVE");

    const [data] = await app.concepts.Rostering._getClass();
    expect(data).toBeDefined();
    expect(data.code).toBe("CS101");
  });

  test("rejects duplicate configure", async () => {
    const admin = await setupAdmin();
    await configureClass(admin);

    const dup = await app.send("/roster/configure-class", {
      session: admin.session,
      code: "CS102",
      title: "Another",
      term: "Spring 2027",
      timezone: "America/Chicago",
    });
    expect(dup.error).toBeDefined();
    expect(dup.class).toBeUndefined();
  });

  // --- section management ---

  test("create, list, update, and archive sections", async () => {
    const admin = await setupAdmin();
    await configureClass(admin);

    // Create
    const created = await app.send("/roster/sections/create", {
      session: admin.session,
      name: "Recitation A",
      location: "Room 101",
      meetingPattern: "MWF 10am",
    });
    expect(created.section).toBeDefined();
    const sec = created.section as Record<string, unknown>;
    expect(sec.name).toBe("Recitation A");

    // List via concept
    const sections = await app.concepts.Rostering._getSections();
    expect(sections.length).toBe(1);
    expect(sections[0].name).toBe("Recitation A");

    // Update
    const updated = await app.send("/roster/sections/update", {
      session: admin.session,
      section: sec._id,
      name: "Recitation A+",
      location: "Room 102",
      meetingPattern: "MWF 11am",
    });
    expect(updated.section).toBeDefined();
    expect((updated.section as Record<string, unknown>).name).toBe(
      "Recitation A+",
    );

    // Archive via concept
    const archResult = await app.concepts.Rostering.archiveSection({
      section: sec._id as ID,
    });
    expect("error" in archResult).toBe(false);
    expect(
      (archResult as unknown as { section: Record<string, unknown> }).section
        .status,
    ).toBe("ARCHIVED");
  });

  // --- seat import ---

  test("import preview parses CSV into rows", async () => {
    const admin = await setupAdmin();
    await configureClass(admin);

    const csv =
      "externalKey,email,rosterName,kind,section\n" +
      "S001,s1@mit.edu,Alice,STUDENT,\n" +
      "S002,s2@mit.edu,Bob,STUDENT,\n";

    const preview = await app.send("/roster/import-preview", { csv });
    expect(preview.rows).toBeArray();
    expect((preview.rows as unknown[]).length).toBe(2);
  });

  test("import seats via parsed rows", async () => {
    const admin = await setupAdmin();
    await configureClass(admin);
    await importRows(admin, [
      row({ externalKey: "S001", email: "a@a.com", rosterName: "Alice" }),
      row({ externalKey: "S002", email: "b@b.com", rosterName: "Bob" }),
    ]);

    const unclaimed = await app.concepts.Rostering._getUnclaimedSeats();
    expect(unclaimed.length).toBe(2);
  });

  // --- seat claiming ---

  test("claim a pending seat makes it ACTIVE", async () => {
    const admin = await setupAdmin();
    await configureClass(admin);
    await importRows(admin, [
      row({ externalKey: "S001", email: "a@a.com", rosterName: "Alice" }),
    ]);

    const student = await registerUser("alice", "pw", "Alice");
    const claimed = await app.send("/roster/claim-seat", {
      session: student.session,
      externalKey: "S001",
    });
    expect(claimed.seat).toBeDefined();
    expect((claimed.seat as Record<string, unknown>).status).toBe("ACTIVE");
  });

  test("claiming already-claimed seat errors", async () => {
    const admin = await setupAdmin();
    await configureClass(admin);
    await importRows(admin, [
      row({ externalKey: "S001", email: "a@a.com", rosterName: "Alice" }),
    ]);

    const alice = await registerUser("alice", "pw", "Alice");
    await app.send("/roster/claim-seat", {
      session: alice.session,
      externalKey: "S001",
    });

    const bob = await registerUser("bob", "pw", "Bob");
    const dup = await app.send("/roster/claim-seat", {
      session: bob.session,
      externalKey: "S001",
    });
    expect(dup.error).toBeDefined();
  });

  // --- link user ---

  test("staff links a seat to a user", async () => {
    const admin = await setupAdmin();
    await configureClass(admin);
    await importRows(admin, [
      row({ externalKey: "S001", email: "a@a.com", rosterName: "Alice" }),
    ]);

    const student = await registerUser("alice", "pw", "Alice");
    const unclaimed = await app.concepts.Rostering._getUnclaimedSeats();
    const seatId = unclaimed[0].seat;

    const linked = await app.send("/roster/link-user", {
      session: admin.session,
      seat: seatId,
      user: student.user,
    });
    expect(linked.seat).toBeDefined();
    expect((linked.seat as Record<string, unknown>).status).toBe("ACTIVE");
  });

  // --- drop and reinstate ---

  test("drop an active seat then reinstate it", async () => {
    const admin = await setupAdmin();
    await configureClass(admin);
    await importRows(admin, [
      row({ externalKey: "S001", email: "a@a.com", rosterName: "Alice" }),
    ]);

    const alice = await registerUser("alice", "pw", "Alice");
    const claimed = await app.send("/roster/claim-seat", {
      session: alice.session,
      externalKey: "S001",
    });
    const seatId = (claimed.seat as Record<string, unknown>)._id as string;

    const dropped = await app.send("/roster/drop", {
      session: admin.session,
      seat: seatId,
    });
    expect(dropped.seat).toBeDefined();
    expect((dropped.seat as Record<string, unknown>).status).toBe("DROPPED");

    const reinstated = await app.send("/roster/reinstate", {
      session: admin.session,
      seat: seatId,
    });
    expect(reinstated.seat).toBeDefined();
    expect((reinstated.seat as Record<string, unknown>).status).toBe("ACTIVE");
  });

  // --- move section ---

  test("move student between recitations", async () => {
    const admin = await setupAdmin();
    await configureClass(admin);
    const secA = await app.send("/roster/sections/create", {
      session: admin.session,
      name: "Section A",
      location: "",
      meetingPattern: "",
    });
    const secB = await app.send("/roster/sections/create", {
      session: admin.session,
      name: "Section B",
      location: "",
      meetingPattern: "",
    });
    const sectionAId = (secA.section as Record<string, unknown>)._id as string;
    const sectionBId = (secB.section as Record<string, unknown>)._id as string;

    await importRows(admin, [
      row({
        externalKey: "S001",
        email: "a@a.com",
        rosterName: "Alice",
        section: sectionAId,
      }),
    ]);

    const alice = await registerUser("alice", "pw", "Alice");
    const claimed = await app.send("/roster/claim-seat", {
      session: alice.session,
      externalKey: "S001",
    });
    const seatId = (claimed.seat as Record<string, unknown>)._id as string;

    const moved = await app.send("/roster/move-section", {
      session: admin.session,
      seat: seatId,
      section: sectionBId,
    });
    expect(moved.seat).toBeDefined();
    expect((moved.seat as Record<string, unknown>).section).toBe(sectionBId);
  });

  // --- active students listing ---

  test("lists active members", async () => {
    const admin = await setupAdmin();
    await configureClass(admin);
    await importRows(admin, [
      row({ externalKey: "S001", email: "a@a.com", rosterName: "Alice" }),
    ]);

    const alice = await registerUser("alice", "pw", "Alice");
    await app.send("/roster/claim-seat", {
      session: alice.session,
      externalKey: "S001",
    });

    const members = await app.concepts.Rostering._getActiveMembers();
    expect(members.length).toBe(1);
    expect(members[0].user).toBe(alice.user);
  });
});

// =============================================================================
// STAFF ROLE
// =============================================================================

describe("staff role", () => {
  test("import STAFF seat and claim grants course-staff role", async () => {
    const admin = await setupAdmin();
    await configureClass(admin);
    await importRows(admin, [
      row({
        externalKey: "STAFF1",
        email: "staff@mit.edu",
        rosterName: "Dr. Staff",
        kind: "STAFF",
      }),
    ]);

    const staffUser = await registerUser("staff", "pw", "Dr. Staff");
    await app.send("/roster/claim-seat", {
      session: staffUser.session,
      externalKey: "STAFF1",
    });

    // Check capability via /roles/can endpoint
    const can = await app.send("/roles/can", {
      user: staffUser.user,
      context: "forum",
      capability: "assignments:manage",
    });
    expect(can.allowed).toBe(true);
  });
});

// =============================================================================
// ASSIGNMENTS
// =============================================================================

describe("assignments", () => {
  test("create draft, revise, publish assignment", async () => {
    const admin = await setupAdmin();
    await configureClass(admin);

    const draft = await app.send("/assignments/create-draft", {
      session: admin.session,
      title: "Homework 1",
      instructions: "Problems 1-5.",
      kind: "HOMEWORK",
      availableAt: iso(1),
      dueAt: iso(7),
      closeAt: iso(14),
      acceptsSubmissions: true,
      audience: "EVERYONE",
      targets: [],
    });
    expect(draft.assignment).toBeDefined();
    const assignId = draft.assignment as string;

    const [detail] = await app.concepts.Assigning._getAssignment({
      assignment: assignId as ID,
    });
    expect(detail.status).toBe("DRAFT");

    const revised = await app.send("/assignments/revise", {
      session: admin.session,
      assignment: assignId,
      title: "Homework 1 (Revised)",
      instructions: "Problems 1-6.",
      kind: "HOMEWORK",
      availableAt: iso(1),
      dueAt: iso(7),
      closeAt: iso(14),
      acceptsSubmissions: true,
      audience: "EVERYONE",
      targets: [],
    });
    expect(revised.assignment).toBe(assignId);

    await app.send("/assignments/publish", {
      session: admin.session,
      assignment: assignId,
    });

    const [pubDetail] = await app.concepts.Assigning._getAssignment({
      assignment: assignId as ID,
    });
    expect(pubDetail.status).toBe("PUBLISHED");
  });

  test("publish to EVERYONE creates releases for all active students", async () => {
    const admin = await setupAdmin();
    await configureClass(admin);
    await importRows(admin, [
      row({ externalKey: "S001", email: "a@a.com", rosterName: "Alice" }),
      row({ externalKey: "S002", email: "b@b.com", rosterName: "Bob" }),
    ]);

    const _alice = await withStudent(admin, "S001");
    const _bob = await withStudent(admin, "S002");

    const draft = await app.send("/assignments/create-draft", {
      session: admin.session,
      title: "HW1",
      instructions: "Do it.",
      kind: "HOMEWORK",
      availableAt: iso(1),
      dueAt: iso(7),
      closeAt: iso(14),
      acceptsSubmissions: true,
      audience: "EVERYONE",
      targets: [],
    });
    await app.send("/assignments/publish", {
      session: admin.session,
      assignment: draft.assignment,
    });

    const assignees = await app.concepts.Assigning._getAssignees({
      assignment: draft.assignment as ID,
    });
    expect(assignees.length).toBe(2);
  });

  test("publish to TARGETS creates releases only for matching section students", async () => {
    const admin = await setupAdmin();
    await configureClass(admin);
    const secA = await app.send("/roster/sections/create", {
      session: admin.session,
      name: "Section A",
      location: "",
      meetingPattern: "",
    });
    const sectionAId = (secA.section as Record<string, unknown>)._id as string;

    await importRows(admin, [
      row({
        externalKey: "S001",
        email: "a@a.com",
        rosterName: "Alice",
        section: sectionAId,
      }),
      row({ externalKey: "S002", email: "b@b.com", rosterName: "Bob" }),
    ]);

    const alice = await withStudent(admin, "S001");
    const _bob = await withStudent(admin, "S002");

    const draft = await app.send("/assignments/create-draft", {
      session: admin.session,
      title: "HW1",
      instructions: "Do it.",
      kind: "HOMEWORK",
      availableAt: iso(1),
      dueAt: iso(7),
      closeAt: iso(14),
      acceptsSubmissions: true,
      audience: "TARGETS",
      targets: [sectionAId],
    });
    await app.send("/assignments/publish", {
      session: admin.session,
      assignment: draft.assignment,
    });

    const assignees = await app.concepts.Assigning._getAssignees({
      assignment: draft.assignment as ID,
    });
    expect(assignees.length).toBe(1);
    expect(assignees[0].assignee).toBe(alice.user);
  });

  test("new active student receives already-published assignments", async () => {
    const admin = await setupAdmin();
    await configureClass(admin);
    await importRows(admin, [
      row({ externalKey: "S001", email: "a@a.com", rosterName: "Alice" }),
      row({ externalKey: "S002", email: "b@b.com", rosterName: "Bob" }),
    ]);

    const _alice = await withStudent(admin, "S001");

    const draft = await app.send("/assignments/create-draft", {
      session: admin.session,
      title: "HW1",
      instructions: "Do it.",
      kind: "HOMEWORK",
      availableAt: iso(1),
      dueAt: iso(7),
      closeAt: iso(14),
      acceptsSubmissions: true,
      audience: "EVERYONE",
      targets: [],
    });
    await app.send("/assignments/publish", {
      session: admin.session,
      assignment: draft.assignment,
    });

    const bob = await withStudent(admin, "S002");

    const bobAssigned = await app.concepts.Assigning._getAssigned({
      assignee: bob.user,
    });
    expect(bobAssigned.length).toBe(1);
    expect(bobAssigned[0].assignment).toBe(draft.assignment);
  });

  test("set and clear due override", async () => {
    const admin = await setupAdmin();
    await configureClass(admin);
    await importRows(admin, [
      row({ externalKey: "S001", email: "a@a.com", rosterName: "Alice" }),
    ]);

    const alice = await withStudent(admin, "S001");

    const draft = await app.send("/assignments/create-draft", {
      session: admin.session,
      title: "HW1",
      instructions: "Do it.",
      kind: "HOMEWORK",
      availableAt: iso(1),
      dueAt: iso(7),
      closeAt: iso(14),
      acceptsSubmissions: true,
      audience: "EVERYONE",
      targets: [],
    });
    await app.send("/assignments/publish", {
      session: admin.session,
      assignment: draft.assignment,
    });

    const overrideDate = iso(21);
    const setOverride = await app.send("/assignments/set-due-override", {
      session: admin.session,
      assignment: draft.assignment,
      assignee: alice.user,
      dueAt: overrideDate,
    });
    expect(setOverride.release).toBeDefined();

    const [release] = await app.concepts.Assigning._getRelease({
      assignment: draft.assignment as ID,
      assignee: alice.user,
    });
    expect(release.dueOverride).toBeDefined();

    // Clear
    const cleared = await app.send("/assignments/clear-due-override", {
      session: admin.session,
      assignment: draft.assignment,
      assignee: alice.user,
    });
    expect(cleared.release).toBeDefined();
  });

  test("student assignment list shows effective due and status", async () => {
    const admin = await setupAdmin();
    await configureClass(admin);
    await importRows(admin, [
      row({ externalKey: "S001", email: "a@a.com", rosterName: "Alice" }),
    ]);

    const alice = await withStudent(admin, "S001");

    const draft = await app.send("/assignments/create-draft", {
      session: admin.session,
      title: "HW1",
      instructions: "Do it.",
      kind: "HOMEWORK",
      availableAt: iso(1),
      dueAt: iso(7),
      closeAt: iso(14),
      acceptsSubmissions: true,
      audience: "EVERYONE",
      targets: [],
    });
    await app.send("/assignments/publish", {
      session: admin.session,
      assignment: draft.assignment,
    });

    const [due] = await app.concepts.Assigning._getDue({
      assignment: draft.assignment as ID,
      assignee: alice.user,
    });
    expect(due.dueAt).toBeDefined();
    expect(due.closeAt).toBeDefined();
  });
});

// =============================================================================
// SUBMISSIONS
// =============================================================================

describe("submissions", () => {
  test("student submits work", async () => {
    const admin = await setupAdmin();
    await configureClass(admin);

    const { student, assignment } = await setupStudentAndAssignment(
      admin,
      "S001",
    );

    const result = await app.send("/assignments/submit", {
      session: student.session,
      assignment,
      content: "My solution.",
    });
    expect(result.submission).toBeDefined();
  });

  test("submit creates attempt with artifacts", async () => {
    const admin = await setupAdmin();
    await configureClass(admin);
    const { student, assignment } = await setupStudentAndAssignment(
      admin,
      "S001",
    );

    const result = await app.send("/assignments/submit", {
      session: student.session,
      assignment,
      content: "With code.",
    });
    const [sub] = await app.concepts.Submitting._getSubmission({
      submission: result.submission as ID,
    });
    expect(sub.status).toBe("SUBMITTED");
    expect(sub.artifacts.length).toBeGreaterThan(0);
  });

  test("multiple submissions create numbered attempts", async () => {
    const admin = await setupAdmin();
    await configureClass(admin);
    const { student, assignment } = await setupStudentAndAssignment(
      admin,
      "S001",
    );

    for (const _ of [1, 2, 3]) {
      await app.send("/assignments/submit", {
        session: student.session,
        assignment,
        content: "Attempt.",
      });
    }

    const attempts = await app.concepts.Submitting._getAttempts({
      assignment: assignment as ID,
      submitter: student.user,
    });
    expect(attempts.length).toBe(3);
    expect(attempts.map((a) => a.number)).toEqual([1, 2, 3]);
  });

  test("latest attempt is returned correctly", async () => {
    const admin = await setupAdmin();
    await configureClass(admin);
    const { student, assignment } = await setupStudentAndAssignment(
      admin,
      "S001",
    );

    await app.send("/assignments/submit", {
      session: student.session,
      assignment,
      content: "First.",
    });
    await app.send("/assignments/submit", {
      session: student.session,
      assignment,
      content: "Second.",
    });

    const [latest] = await app.concepts.Submitting._getLatest({
      assignment: assignment as ID,
      submitter: student.user,
    });
    expect(latest.number).toBe(2);
  });

  test("withdraw and restore submission", async () => {
    const admin = await setupAdmin();
    await configureClass(admin);
    const { student, assignment } = await setupStudentAndAssignment(
      admin,
      "S001",
    );

    const submitted = await app.send("/assignments/submit", {
      session: student.session,
      assignment,
      content: "To be withdrawn.",
    });
    const subId = submitted.submission as string;

    const wd = await app.concepts.Submitting.withdraw({
      submission: subId as ID,
    });
    expect("error" in wd).toBe(false);

    const rs = await app.concepts.Submitting.restore({
      submission: subId as ID,
    });
    expect("error" in rs).toBe(false);

    const [latest] = await app.concepts.Submitting._getLatest({
      assignment: assignment as ID,
      submitter: student.user,
    });
    expect(latest.status).toBe("SUBMITTED");
  });

  test("cannot submit after close date", async () => {
    const admin = await setupAdmin();
    await configureClass(admin);
    await importRows(admin, [
      row({ externalKey: "S001", email: "a@a.com", rosterName: "Alice" }),
    ]);

    const _student = await withStudent(admin, "S001");

    const past = new Date(Date.now() - 86400000).toISOString();
    const draft = await app.send("/assignments/create-draft", {
      session: admin.session,
      title: "Past",
      instructions: "Late.",
      kind: "HOMEWORK",
      availableAt: new Date(Date.now() - 7 * 86400000).toISOString(),
      dueAt: new Date(Date.now() - 3 * 86400000).toISOString(),
      closeAt: past,
      acceptsSubmissions: true,
      audience: "EVERYONE",
      targets: [],
    });
    await app.send("/assignments/publish", {
      session: admin.session,
      assignment: draft.assignment,
    });

    const [detail] = await app.concepts.Assigning._getAssignment({
      assignment: draft.assignment as ID,
    });
    expect(detail.closeAt).toBeDefined();
  });
});

// =============================================================================
// LATE DAYS
// =============================================================================

describe("late days", () => {
  test("configure late-day policy", async () => {
    const admin = await setupAdmin();
    await configureClass(admin);

    const result = await app.send("/late-days/configure-policy", {
      session: admin.session,
      defaultDays: 3,
      unitHours: 24,
      maxDaysPerItem: 5,
    });
    expect(result.policy).toBe(true);

    const [policy] = await app.concepts.LateBanking._getPolicy();
    expect(policy.defaultDays).toBe(3);
    expect(policy.unitHours).toBe(24);
    expect(policy.maxDaysPerItem).toBe(5);
  });

  test("student can apply late days if within balance", async () => {
    const admin = await setupAdmin();
    await configureClass(admin);
    const { student, assignment } = await setupStudentAndAssignment(
      admin,
      "S001",
    );

    await app.send("/late-days/configure-policy", {
      session: admin.session,
      defaultDays: 5,
      unitHours: 24,
      maxDaysPerItem: 5,
    });

    const result = await app.send("/late-days/apply", {
      session: student.session,
      assignment,
      days: 2,
    });
    expect(result.use).toBeDefined();

    const [balance] = await app.concepts.LateBanking._getBalance({
      learner: student.user,
    });
    expect(balance.granted).toBe(5);
    expect(balance.used).toBe(2);
    expect(balance.remaining).toBe(3);
  });

  test("applying late days fails when overspending balance", async () => {
    const admin = await setupAdmin();
    await configureClass(admin);
    const { student, assignment } = await setupStudentAndAssignment(
      admin,
      "S001",
    );

    await app.send("/late-days/configure-policy", {
      session: admin.session,
      defaultDays: 2,
      unitHours: 24,
      maxDaysPerItem: 5,
    });

    const result = await app.send("/late-days/apply", {
      session: student.session,
      assignment,
      days: 5,
    });
    expect(result.error).toBeDefined();
    expect(result.use).toBeUndefined();
  });

  test("change and cancel late-day use", async () => {
    const admin = await setupAdmin();
    await configureClass(admin);
    const { student, assignment } = await setupStudentAndAssignment(
      admin,
      "S001",
    );

    await app.send("/late-days/configure-policy", {
      session: admin.session,
      defaultDays: 5,
      unitHours: 24,
      maxDaysPerItem: 5,
    });

    await app.send("/late-days/apply", {
      session: student.session,
      assignment,
      days: 2,
    });

    const changed = await app.send("/late-days/change", {
      session: student.session,
      assignment,
      days: 1,
    });
    expect(changed.use).toBeDefined();

    const [balance] = await app.concepts.LateBanking._getBalance({
      learner: student.user,
    });
    expect(balance.used).toBe(1);

    const canceled = await app.send("/late-days/cancel", {
      session: student.session,
      assignment,
    });
    expect(canceled.use).toBeDefined();

    const [balance2] = await app.concepts.LateBanking._getBalance({
      learner: student.user,
    });
    expect(balance2.used).toBe(0);
  });

  test("staff grants extra late days", async () => {
    const admin = await setupAdmin();
    await configureClass(admin);
    await importRows(admin, [
      row({ externalKey: "S001", email: "a@a.com", rosterName: "Alice" }),
    ]);

    const student = await withStudent(admin, "S001");

    await app.send("/late-days/configure-policy", {
      session: admin.session,
      defaultDays: 3,
      unitHours: 24,
      maxDaysPerItem: 5,
    });

    const granted = await app.send("/late-days/grant", {
      session: admin.session,
      learner: student.user,
      days: 2,
      reason: "Extension",
    });
    expect(granted.grant).toBeDefined();

    const [balance] = await app.concepts.LateBanking._getBalance({
      learner: student.user,
    });
    expect(balance.granted).toBe(5);
  });
});

// =============================================================================
// GRADES
// =============================================================================

describe("grades", () => {
  test("configure grade item and add criteria", async () => {
    const admin = await setupAdmin();
    await configureClass(admin);
    const { assignment } = await setupStudentAndAssignment(admin, "S001");

    const item = await app.send("/grades/configure-item", {
      session: admin.session,
      item: assignment,
      label: "HW1 Grade",
      maxPoints: 100,
    });
    expect(item.gradeItem).toBeDefined();

    const crit = await app.send("/grades/add-criterion", {
      session: admin.session,
      item: assignment,
      name: "Correctness",
      maxPoints: 60,
      position: 0,
    });
    expect(crit.criterion).toBeDefined();
  });

  test("record draft grade", async () => {
    const admin = await setupAdmin();
    await configureClass(admin);
    const { student, assignment } = await setupStudentAndAssignment(
      admin,
      "S001",
    );

    await app.send("/grades/configure-item", {
      session: admin.session,
      item: assignment,
      label: "HW1",
      maxPoints: 100,
    });

    const recorded = await app.send("/grades/record", {
      session: admin.session,
      learner: student.user,
      item: assignment,
      evidence: "",
      score: 85,
      feedback: "Good work!",
    });
    expect(recorded.grade).toBeDefined();

    const [grade] = await app.concepts.Grading._getGrade({
      learner: student.user,
      item: assignment as ID,
    });
    expect(grade.status).toBe("DRAFT");
    expect(grade.score).toBe(85);
  });

  test("draft grade is NOT visible to student", async () => {
    const admin = await setupAdmin();
    await configureClass(admin);
    const { student, assignment } = await setupStudentAndAssignment(
      admin,
      "S001",
    );

    await app.send("/grades/configure-item", {
      session: admin.session,
      item: assignment,
      label: "HW1",
      maxPoints: 100,
    });

    await app.send("/grades/record", {
      session: admin.session,
      learner: student.user,
      item: assignment,
      evidence: "",
      score: 85,
      feedback: "Good work!",
    });

    const grades = await app.concepts.Grading._getGradesForLearner({
      learner: student.user,
    });
    const draftGrade = grades.find((g) => g.item === (assignment as ID));
    expect(draftGrade).toBeDefined();
    expect(draftGrade?.status).toBe("DRAFT");
  });

  test("release grade", async () => {
    const admin = await setupAdmin();
    await configureClass(admin);
    const { student, assignment } = await setupStudentAndAssignment(
      admin,
      "S001",
    );

    await app.send("/grades/configure-item", {
      session: admin.session,
      item: assignment,
      label: "HW1",
      maxPoints: 100,
    });
    await app.send("/grades/record", {
      session: admin.session,
      learner: student.user,
      item: assignment,
      evidence: "",
      score: 90,
      feedback: "Excellent!",
    });

    const released = await app.send("/grades/release", {
      session: admin.session,
      learner: student.user,
      item: assignment,
    });
    expect(released.grade).toBeDefined();

    const [grade] = await app.concepts.Grading._getGrade({
      learner: student.user,
      item: assignment as ID,
    });
    expect(grade.status).toBe("RELEASED");
  });

  test("released grade IS visible to student", async () => {
    const admin = await setupAdmin();
    await configureClass(admin);
    const { student, assignment } = await setupStudentAndAssignment(
      admin,
      "S001",
    );

    await app.send("/grades/configure-item", {
      session: admin.session,
      item: assignment,
      label: "HW1",
      maxPoints: 100,
    });
    await app.send("/grades/record", {
      session: admin.session,
      learner: student.user,
      item: assignment,
      evidence: "",
      score: 90,
      feedback: "Excellent!",
    });
    await app.send("/grades/release", {
      session: admin.session,
      learner: student.user,
      item: assignment,
    });

    const grades = await app.concepts.Grading._getGradesForLearner({
      learner: student.user,
    });
    const releasedGrade = grades.find((g) => g.item === (assignment as ID));
    expect(releasedGrade).toBeDefined();
    expect(releasedGrade?.status).toBe("RELEASED");
  });

  test("retract grade makes it invisible again", async () => {
    const admin = await setupAdmin();
    await configureClass(admin);
    const { student, assignment } = await setupStudentAndAssignment(
      admin,
      "S001",
    );

    await app.send("/grades/configure-item", {
      session: admin.session,
      item: assignment,
      label: "HW1",
      maxPoints: 100,
    });
    await app.send("/grades/record", {
      session: admin.session,
      learner: student.user,
      item: assignment,
      evidence: "",
      score: 90,
      feedback: "Excellent!",
    });
    await app.send("/grades/release", {
      session: admin.session,
      learner: student.user,
      item: assignment,
    });

    const retracted = await app.send("/grades/retract", {
      session: admin.session,
      learner: student.user,
      item: assignment,
    });
    expect(retracted.grade).toBeDefined();

    const [grade] = await app.concepts.Grading._getGrade({
      learner: student.user,
      item: assignment as ID,
    });
    expect(grade.status).toBe("DRAFT");
  });

  test("excuse a student", async () => {
    const admin = await setupAdmin();
    await configureClass(admin);
    const { student, assignment } = await setupStudentAndAssignment(
      admin,
      "S001",
    );

    await app.send("/grades/configure-item", {
      session: admin.session,
      item: assignment,
      label: "HW1",
      maxPoints: 100,
    });
    await app.send("/grades/record", {
      session: admin.session,
      learner: student.user,
      item: assignment,
      evidence: "",
      score: 85,
      feedback: "Good work!",
    });

    const excused = await app.send("/grades/excuse", {
      session: admin.session,
      learner: student.user,
      item: assignment,
      feedback: "Med exemption.",
    });
    expect(excused.grade).toBeDefined();

    const [grade] = await app.concepts.Grading._getGrade({
      learner: student.user,
      item: assignment as ID,
    });
    expect(grade.status).toBe("EXCUSED");
    expect(grade.score).toBe(0);
  });

  test("excused grade is distinct from zero score", async () => {
    const admin = await setupAdmin();
    await configureClass(admin);
    await importRows(admin, [
      row({ externalKey: "S001", email: "a@a.com", rosterName: "Alice" }),
      row({ externalKey: "S002", email: "b@b.com", rosterName: "Bob" }),
    ]);
    const alice = await withStudent(admin, "S001");
    const bob = await withStudent(admin, "S002");

    const draft = await app.send("/assignments/create-draft", {
      session: admin.session,
      title: "HW",
      instructions: "Do it.",
      kind: "HOMEWORK",
      availableAt: iso(1),
      dueAt: iso(7),
      closeAt: iso(14),
      acceptsSubmissions: true,
      audience: "EVERYONE",
      targets: [],
    });
    await app.send("/assignments/publish", {
      session: admin.session,
      assignment: draft.assignment,
    });
    const assignment = draft.assignment as string;

    await app.send("/grades/configure-item", {
      session: admin.session,
      item: assignment,
      label: "HW",
      maxPoints: 100,
    });

    // Alice: zero score
    await app.send("/grades/record", {
      session: admin.session,
      learner: alice.user,
      item: assignment,
      evidence: "",
      score: 0,
      feedback: "Incomplete.",
    });

    // Bob: record draft then excuse
    await app.send("/grades/record", {
      session: admin.session,
      learner: bob.user,
      item: assignment,
      evidence: "",
      score: 0,
      feedback: "Draft.",
    });
    await app.send("/grades/excuse", {
      session: admin.session,
      learner: bob.user,
      item: assignment,
      feedback: "Excused.",
    });

    const [aliceGrade] = await app.concepts.Grading._getGrade({
      learner: alice.user,
      item: assignment as ID,
    });
    expect(aliceGrade.status).not.toBe("EXCUSED");
    expect(aliceGrade.score).toBe(0);

    const [bobGrade] = await app.concepts.Grading._getGrade({
      learner: bob.user,
      item: assignment as ID,
    });
    expect(bobGrade.status).toBe("EXCUSED");
    expect(bobGrade.score).toBe(0);
  });
});

// =============================================================================
// STUDENT NOTES
// =============================================================================

describe("student notes", () => {
  async function setupNotes() {
    const admin = await setupAdmin();
    await configureClass(admin);
    await importRows(admin, [
      row({ externalKey: "S001", email: "a@a.com", rosterName: "Alice" }),
    ]);
    const student = await withStudent(admin, "S001");
    return { admin, student };
  }

  test("staff writes STAFF_ONLY note - student cannot see it", async () => {
    const { admin, student } = await setupNotes();

    await app.send("/students/notes/write", {
      session: admin.session,
      learner: student.user,
      body: "Internal note.",
      visibility: "STAFF_ONLY",
      tags: ["academic"],
      followUpAt: null,
    });

    const staffNotes = await app.concepts.StudentNoting._getActiveStaffNotes({
      learner: student.user,
    });
    expect(staffNotes.length).toBe(1);

    const visible = await app.concepts.StudentNoting._getLearnerVisibleNotes({
      learner: student.user,
    });
    expect(visible.length).toBe(0);
  });

  test("staff writes LEARNER_VISIBLE note - student CAN see it", async () => {
    const { admin, student } = await setupNotes();

    await app.send("/students/notes/write", {
      session: admin.session,
      learner: student.user,
      body: "Great progress!",
      visibility: "LEARNER_VISIBLE",
      tags: ["praise"],
      followUpAt: null,
    });

    const visible = await app.concepts.StudentNoting._getLearnerVisibleNotes({
      learner: student.user,
    });
    expect(visible.length).toBe(1);
    expect(visible[0].body).toBe("Great progress!");
  });

  test("student acknowledges a visible note", async () => {
    const { admin, student } = await setupNotes();

    const result = await app.send("/students/notes/write", {
      session: admin.session,
      learner: student.user,
      body: "Please review.",
      visibility: "LEARNER_VISIBLE",
      tags: ["action"],
      followUpAt: null,
    });
    const noteId = result.note as string;

    const ack = await app.send("/students/notes/acknowledge", {
      session: student.session,
      note: noteId,
    });
    expect(ack.note).toBeDefined();

    const [detail] = await app.concepts.StudentNoting._getNote({
      note: noteId as ID,
    });
    expect(detail.acknowledgedAt).toBeDefined();
  });

  test("archived notes don't appear in active queries", async () => {
    const { admin, student } = await setupNotes();

    const note = await app.send("/students/notes/write", {
      session: admin.session,
      learner: student.user,
      body: "Temporary.",
      visibility: "LEARNER_VISIBLE",
      tags: [],
      followUpAt: null,
    });
    const noteId = note.note as string;

    await app.send("/students/notes/resolve", {
      session: admin.session,
      note: noteId,
    });
    await app.send("/students/notes/archive", {
      session: admin.session,
      note: noteId,
    });

    const staffNotes = await app.concepts.StudentNoting._getActiveStaffNotes({
      learner: student.user,
    });
    expect(staffNotes.length).toBe(0);

    const visible = await app.concepts.StudentNoting._getLearnerVisibleNotes({
      learner: student.user,
    });
    expect(visible.length).toBe(0);
  });
});

// =============================================================================
// CALENDAR
// =============================================================================

describe("calendar", () => {
  test("calendar /me returns empty when no events", async () => {
    const admin = await setupAdmin();
    await configureClass(admin);

    // Create a student but don't publish assignments
    await importRows(admin, [
      row({ externalKey: "S001", email: "a@a.com", rosterName: "Alice" }),
    ]);
    const student = await withStudent(admin, "S001");

    const cal = await app.send("/calendar/me", {
      session: student.session,
      start: iso(1),
      end: iso(14),
    });
    expect(cal.events).toBeArray();
    expect((cal.events as unknown[]).length).toBe(0);
  });

  test("calendar /me returns events when assignments exist", async () => {
    const admin = await setupAdmin();
    await configureClass(admin);
    const { student, assignment: _assignment } = await setupStudentAndAssignment(
      admin,
      "S001",
    );

    const cal = await app.send("/calendar/me", {
      session: student.session,
      start: iso(1),
      end: iso(14),
    });
    expect(cal.events).toBeArray();
    expect((cal.events as unknown[]).length).toBeGreaterThanOrEqual(1);
  });
});

// =============================================================================
// DASHBOARD
// =============================================================================

describe("dashboard", () => {
  test("/lms/me returns student summary", async () => {
    const admin = await setupAdmin();
    await configureClass(admin);
    await importRows(admin, [
      row({ externalKey: "S001", email: "a@a.com", rosterName: "Alice" }),
    ]);

    const student = await withStudent(admin, "S001");

    const me = await app.send("/lms/me", { session: student.session });
    expect(me.dashboard).toBeDefined();
  });

  test("/lms/staff-dashboard returns staff summary", async () => {
    const admin = await setupAdmin();
    await configureClass(admin);
    await importRows(admin, [
      row({ externalKey: "S001", email: "a@a.com", rosterName: "Alice" }),
    ]);
    await withStudent(admin, "S001");

    const dash = await app.send("/lms/staff-dashboard", {
      session: admin.session,
    });
    expect(dash.dashboard).toBeDefined();
  });
});
