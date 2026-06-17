import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { setupTestDb } from "@utils/testing.ts";
import type { ID } from "@utils/types.ts";
import RosteringConcept from "./RosteringConcept.ts";

const mongo = await setupTestDb();
const Rostering = new RosteringConcept(mongo.db);

afterAll(() => mongo.stop());

beforeEach(async () => {
  await mongo.db.collection("Rostering.class").deleteMany({});
  await mongo.db.collection("Rostering.sections").deleteMany({});
  await mongo.db.collection("Rostering.seats").deleteMany({});
});

/** Narrow a result union to its success branch, failing the test otherwise. */
function ok<T>(result: T | { error: string }): T {
  if (result && typeof result === "object" && "error" in result) {
    throw new Error(`Expected success but got error: ${result.error}`);
  }
  return result as T;
}

const user = (s: string) => s as ID;
const section = (s: string) => s as ID;
const seat = (s: string) => s as ID;

describe("Rostering", () => {
  test("configureClass creates singleton and rejects duplicate", async () => {
    const class_ = ok(
      await Rostering.configureClass({
        code: "CS101",
        title: "Intro to CS",
        term: "Fall 2026",
        timezone: "America/New_York",
      }),
    );
    expect(class_.class.code).toBe("CS101");
    expect(class_.class.title).toBe("Intro to CS");
    expect(class_.class.term).toBe("Fall 2026");
    expect(class_.class.timezone).toBe("America/New_York");
    expect(class_.class.status).toBe("ACTIVE");

    expect(
      await Rostering.configureClass({
        code: "CS102",
        title: "Data Structures",
        term: "Spring 2027",
        timezone: "America/Chicago",
      }),
    ).toHaveProperty("error");
  });

  test("archiveClass changes status to ARCHIVED", async () => {
    ok(
      await Rostering.configureClass({
        code: "CS101",
        title: "Intro to CS",
        term: "Fall 2026",
        timezone: "America/New_York",
      }),
    );
    const archived = ok(await Rostering.archiveClass());
    expect(archived.class.status).toBe("ARCHIVED");

    const result = await Rostering._getClass();
    expect(result).toEqual([
      {
        code: "CS101",
        title: "Intro to CS",
        term: "Fall 2026",
        timezone: "America/New_York",
        status: "ARCHIVED",
      },
    ]);
  });

  test("archiveClass fails when no class is configured", async () => {
    expect(await Rostering.archiveClass()).toHaveProperty("error");
  });

  test("createSection creates with ACTIVE status", async () => {
    const result = ok(
      await Rostering.createSection({ name: "Recitation 101" }),
    );
    expect(result.section.name).toBe("Recitation 101");
    expect(result.section.status).toBe("ACTIVE");
    expect(result.section.location).toBeUndefined();
    expect(result.section.meetingPattern).toBeUndefined();
  });

  test("createSection with optional fields", async () => {
    const result = ok(
      await Rostering.createSection({
        name: "Lab 201",
        location: "Room 301",
        meetingPattern: "MWF 10:00-10:50",
      }),
    );
    expect(result.section.name).toBe("Lab 201");
    expect(result.section.location).toBe("Room 301");
    expect(result.section.meetingPattern).toBe("MWF 10:00-10:50");
    expect(result.section.status).toBe("ACTIVE");
  });

  test("updateSection updates fields", async () => {
    const { section: s } = ok(
      await Rostering.createSection({ name: "Original" }),
    );
    const updated = ok(
      await Rostering.updateSection({
        section: s._id,
        name: "Updated",
        location: "New Room",
        meetingPattern: "TuTh 14:00-15:20",
      }),
    );
    expect(updated.section.name).toBe("Updated");
    expect(updated.section.location).toBe("New Room");
    expect(updated.section.meetingPattern).toBe("TuTh 14:00-15:20");
    expect(updated.section.status).toBe("ACTIVE");
  });

  test("updateSection fails for nonexistent section", async () => {
    expect(
      await Rostering.updateSection({
        section: section("nonexistent"),
        name: "Ghost",
      }),
    ).toHaveProperty("error");
  });

  test("archiveSection changes status", async () => {
    const { section: s } = ok(
      await Rostering.createSection({ name: "To Archive" }),
    );
    const archived = ok(await Rostering.archiveSection({ section: s._id }));
    expect(archived.section.status).toBe("ARCHIVED");

    const sections = await Rostering._getSections();
    expect(sections).toEqual([
      {
        section: s._id,
        name: "To Archive",
        location: undefined,
        meetingPattern: undefined,
        status: "ARCHIVED",
      },
    ]);
  });

  test("archiveSection fails for nonexistent section", async () => {
    expect(
      await Rostering.archiveSection({ section: section("ghost") }),
    ).toHaveProperty("error");
  });

  test("importSeat creates PENDING seat and rejects duplicate externalKey", async () => {
    const result = ok(
      await Rostering.importSeat({
        externalKey: "ek-001",
        email: "alice@example.com",
        rosterName: "Alice Example",
        kind: "STUDENT",
      }),
    );
    expect(result.seat.status).toBe("PENDING");
    expect(result.seat.externalKey).toBe("ek-001");
    expect(result.seat.email).toBe("alice@example.com");
    expect(result.seat.rosterName).toBe("Alice Example");
    expect(result.seat.kind).toBe("STUDENT");
    expect(result.seat.user).toBeUndefined();

    expect(
      await Rostering.importSeat({
        externalKey: "ek-001",
        email: "other@example.com",
        rosterName: "Other Person",
        kind: "STUDENT",
      }),
    ).toHaveProperty("error");
  });

  test("importSeat with section", async () => {
    const { section: s } = ok(
      await Rostering.createSection({ name: "Lab 101" }),
    );
    const result = ok(
      await Rostering.importSeat({
        externalKey: "ek-002",
        email: "bob@example.com",
        rosterName: "Bob Example",
        kind: "STUDENT",
        section: s._id,
      }),
    );
    expect(result.seat.status).toBe("PENDING");
    expect(result.seat.section).toBe(s._id);
  });

  test("claimSeat transitions PENDING->ACTIVE and links user", async () => {
    const { seat: s } = ok(
      await Rostering.importSeat({
        externalKey: "ek-010",
        email: "carol@example.com",
        rosterName: "Carol Example",
        kind: "STUDENT",
      }),
    );
    const u = user("carol");
    const claimed = ok(await Rostering.claimSeat({ seat: s._id, user: u }));
    expect(claimed.seat.status).toBe("ACTIVE");
    expect(claimed.seat.user).toBe(u);
  });

  test("claimSeat rejects if user already has an ACTIVE seat", async () => {
    const { seat: s1 } = ok(
      await Rostering.importSeat({
        externalKey: "ek-020",
        email: "dave@example.com",
        rosterName: "Dave Example",
        kind: "STUDENT",
      }),
    );
    const { seat: s2 } = ok(
      await Rostering.importSeat({
        externalKey: "ek-021",
        email: "dave-alt@example.com",
        rosterName: "Dave Alt",
        kind: "STUDENT",
      }),
    );
    const u = user("dave");
    ok(await Rostering.claimSeat({ seat: s1._id, user: u }));
    expect(await Rostering.claimSeat({ seat: s2._id, user: u })).toHaveProperty(
      "error",
    );
  });

  test("claimSeat rejects if seat is not PENDING", async () => {
    const { seat: s } = ok(
      await Rostering.importSeat({
        externalKey: "ek-030",
        email: "erin@example.com",
        rosterName: "Erin Example",
        kind: "STUDENT",
      }),
    );
    const u = user("erin");
    ok(await Rostering.claimSeat({ seat: s._id, user: u }));
    const u2 = user("erin2");
    expect(await Rostering.claimSeat({ seat: s._id, user: u2 })).toHaveProperty(
      "error",
    );
  });

  test("claimSeat rejects for nonexistent seat", async () => {
    expect(
      await Rostering.claimSeat({ seat: seat("ghost"), user: user("ghost") }),
    ).toHaveProperty("error");
  });

  test("linkUser is equivalent to claimSeat", async () => {
    const { seat: s } = ok(
      await Rostering.importSeat({
        externalKey: "ek-035",
        email: "frank@example.com",
        rosterName: "Frank Example",
        kind: "STUDENT",
      }),
    );
    const u = user("frank");
    const linked = ok(await Rostering.linkUser({ seat: s._id, user: u }));
    expect(linked.seat.status).toBe("ACTIVE");
    expect(linked.seat.user).toBe(u);
  });

  test("linkUser rejects duplicate active user (same as claimSeat)", async () => {
    const { seat: s1 } = ok(
      await Rostering.importSeat({
        externalKey: "ek-036",
        email: "grace@example.com",
        rosterName: "Grace Example",
        kind: "STUDENT",
      }),
    );
    const { seat: s2 } = ok(
      await Rostering.importSeat({
        externalKey: "ek-037",
        email: "grace-alt@example.com",
        rosterName: "Grace Alt",
        kind: "STUDENT",
      }),
    );
    const u = user("grace");
    ok(await Rostering.linkUser({ seat: s1._id, user: u }));
    expect(await Rostering.linkUser({ seat: s2._id, user: u })).toHaveProperty(
      "error",
    );
  });

  test("dropSeat transitions ACTIVE->DROPPED", async () => {
    const { seat: s } = ok(
      await Rostering.importSeat({
        externalKey: "ek-040",
        email: "heidi@example.com",
        rosterName: "Heidi Example",
        kind: "STUDENT",
      }),
    );
    const u = user("heidi");
    ok(await Rostering.claimSeat({ seat: s._id, user: u }));

    const dropped = ok(await Rostering.dropSeat({ seat: s._id }));
    expect(dropped.seat.status).toBe("DROPPED");
  });

  test("dropSeat rejects if seat is not ACTIVE", async () => {
    const { seat: s } = ok(
      await Rostering.importSeat({
        externalKey: "ek-045",
        email: "ivan@example.com",
        rosterName: "Ivan Example",
        kind: "STUDENT",
      }),
    );
    expect(await Rostering.dropSeat({ seat: s._id })).toHaveProperty("error");
  });

  test("dropSeat rejects for nonexistent seat", async () => {
    expect(await Rostering.dropSeat({ seat: seat("ghost") })).toHaveProperty(
      "error",
    );
  });

  test("reinstateSeat transitions DROPPED->ACTIVE", async () => {
    const { seat: s } = ok(
      await Rostering.importSeat({
        externalKey: "ek-050",
        email: "judy@example.com",
        rosterName: "Judy Example",
        kind: "STUDENT",
      }),
    );
    const u = user("judy");
    ok(await Rostering.claimSeat({ seat: s._id, user: u }));
    ok(await Rostering.dropSeat({ seat: s._id }));

    const reinstated = ok(await Rostering.reinstateSeat({ seat: s._id }));
    expect(reinstated.seat.status).toBe("ACTIVE");
    expect(reinstated.seat.user).toBe(u);
  });

  test("reinstateSeat rejects if seat is not DROPPED", async () => {
    const { seat: s } = ok(
      await Rostering.importSeat({
        externalKey: "ek-055",
        email: "karen@example.com",
        rosterName: "Karen Example",
        kind: "STUDENT",
      }),
    );
    expect(await Rostering.reinstateSeat({ seat: s._id })).toHaveProperty(
      "error",
    );
  });

  test("reinstateSeat rejects for nonexistent seat", async () => {
    expect(
      await Rostering.reinstateSeat({ seat: seat("ghost") }),
    ).toHaveProperty("error");
  });

  test("moveSection changes section", async () => {
    const { section: sA } = ok(
      await Rostering.createSection({ name: "Section A" }),
    );
    const { section: sB } = ok(
      await Rostering.createSection({ name: "Section B" }),
    );
    const { seat: s } = ok(
      await Rostering.importSeat({
        externalKey: "ek-060",
        email: "leo@example.com",
        rosterName: "Leo Example",
        kind: "STUDENT",
        section: sA._id,
      }),
    );

    const moved = ok(
      await Rostering.moveSection({ seat: s._id, section: sB._id }),
    );
    expect(moved.seat.section).toBe(sB._id);
  });

  test("moveSection fails for nonexistent seat", async () => {
    expect(
      await Rostering.moveSection({
        seat: seat("ghost"),
        section: section("any"),
      }),
    ).toHaveProperty("error");
  });

  test("setKind changes kind", async () => {
    const { seat: s } = ok(
      await Rostering.importSeat({
        externalKey: "ek-070",
        email: "mike@example.com",
        rosterName: "Mike Example",
        kind: "STUDENT",
      }),
    );

    const updated = ok(await Rostering.setKind({ seat: s._id, kind: "STAFF" }));
    expect(updated.seat.kind).toBe("STAFF");

    const updated2 = ok(
      await Rostering.setKind({ seat: s._id, kind: "AUDITOR" }),
    );
    expect(updated2.seat.kind).toBe("AUDITOR");
  });

  test("setKind fails for nonexistent seat", async () => {
    expect(
      await Rostering.setKind({ seat: seat("ghost"), kind: "STUDENT" }),
    ).toHaveProperty("error");
  });

  test("_getClass returns class config or empty", async () => {
    expect(await Rostering._getClass()).toEqual([]);

    ok(
      await Rostering.configureClass({
        code: "CS200",
        title: "Advanced CS",
        term: "Spring 2027",
        timezone: "America/Chicago",
      }),
    );
    expect(await Rostering._getClass()).toEqual([
      {
        code: "CS200",
        title: "Advanced CS",
        term: "Spring 2027",
        timezone: "America/Chicago",
        status: "ACTIVE",
      },
    ]);
  });

  test("_getSections returns all sections", async () => {
    const { section: s1 } = ok(
      await Rostering.createSection({ name: "Section A" }),
    );
    const { section: s2 } = ok(
      await Rostering.createSection({
        name: "Section B",
        location: "Room 101",
        meetingPattern: "MWF",
      }),
    );

    const sections = await Rostering._getSections();
    expect(sections).toHaveLength(2);
    expect(sections).toContainEqual({
      section: s1._id,
      name: "Section A",
      location: undefined,
      meetingPattern: undefined,
      status: "ACTIVE",
    });
    expect(sections).toContainEqual({
      section: s2._id,
      name: "Section B",
      location: "Room 101",
      meetingPattern: "MWF",
      status: "ACTIVE",
    });
  });

  test("_getActiveStudents returns only ACTIVE STUDENT seats", async () => {
    const { seat: s1 } = ok(
      await Rostering.importSeat({
        externalKey: "ek-080",
        email: "nancy@example.com",
        rosterName: "Nancy Example",
        kind: "STUDENT",
      }),
    );
    const { seat: _s2 } = ok(
      await Rostering.importSeat({
        externalKey: "ek-081",
        email: "oscar@example.com",
        rosterName: "Oscar Example",
        kind: "STUDENT",
      }),
    );
    const { seat: s3 } = ok(
      await Rostering.importSeat({
        externalKey: "ek-082",
        email: "pat@example.com",
        rosterName: "Pat Example",
        kind: "STAFF",
      }),
    );
    // Student 1: claim (ACTIVE)
    ok(await Rostering.claimSeat({ seat: s1._id, user: user("nancy") }));
    // Staff: claim (ACTIVE, but not STUDENT)
    ok(await Rostering.claimSeat({ seat: s3._id, user: user("pat") }));
    // Student 2: stays PENDING — should not appear

    const active = await Rostering._getActiveStudents();
    expect(active).toHaveLength(1);
    expect(active[0].user).toBe(user("nancy"));
    expect(active[0].email).toBe("nancy@example.com");
  });

  test("_isActiveStudent returns true/false correctly", async () => {
    const { seat: s } = ok(
      await Rostering.importSeat({
        externalKey: "ek-090",
        email: "rebecca@example.com",
        rosterName: "Rebecca Example",
        kind: "STUDENT",
      }),
    );
    const u = user("rebecca");

    expect(await Rostering._isActiveStudent({ user: u })).toEqual([
      { active: false },
    ]);

    ok(await Rostering.claimSeat({ seat: s._id, user: u }));

    expect(await Rostering._isActiveStudent({ user: u })).toEqual([
      { active: true },
    ]);
  });

  test("_isActiveStaff returns true/false correctly", async () => {
    const { seat: s } = ok(
      await Rostering.importSeat({
        externalKey: "ek-095",
        email: "sam@example.com",
        rosterName: "Sam Example",
        kind: "STAFF",
      }),
    );
    const u = user("sam");

    expect(await Rostering._isActiveStaff({ user: u })).toEqual([
      { active: false },
    ]);

    ok(await Rostering.claimSeat({ seat: s._id, user: u }));

    expect(await Rostering._isActiveStaff({ user: u })).toEqual([
      { active: true },
    ]);
  });

  test("_isActiveStaff returns false for active student", async () => {
    const { seat: s } = ok(
      await Rostering.importSeat({
        externalKey: "ek-096",
        email: "tara@example.com",
        rosterName: "Tara Example",
        kind: "STUDENT",
      }),
    );
    const u = user("tara");
    ok(await Rostering.claimSeat({ seat: s._id, user: u }));

    expect(await Rostering._isActiveStaff({ user: u })).toEqual([
      { active: false },
    ]);
  });

  test("_isActiveStudent returns false for active staff", async () => {
    const { seat: s } = ok(
      await Rostering.importSeat({
        externalKey: "ek-097",
        email: "uma@example.com",
        rosterName: "Uma Example",
        kind: "STAFF",
      }),
    );
    const u = user("uma");
    ok(await Rostering.claimSeat({ seat: s._id, user: u }));

    expect(await Rostering._isActiveStudent({ user: u })).toEqual([
      { active: false },
    ]);
  });

  test("_getSeatByUser returns seat for user", async () => {
    const { seat: s } = ok(
      await Rostering.importSeat({
        externalKey: "ek-100",
        email: "victor@example.com",
        rosterName: "Victor Example",
        kind: "STUDENT",
      }),
    );
    const u = user("victor");

    expect(await Rostering._getSeatByUser({ user: u })).toEqual([]);

    ok(await Rostering.claimSeat({ seat: s._id, user: u }));

    const results = await Rostering._getSeatByUser({ user: u });
    expect(results).toHaveLength(1);
    expect(results[0].seat).toBe(s._id);
    expect(results[0].user).toBe(u);
    expect(results[0].externalKey).toBe("ek-100");
  });

  test("_getSeatByUser returns multiple seats if user is linked to multiple", async () => {
    const { seat: s1 } = ok(
      await Rostering.importSeat({
        externalKey: "ek-110",
        email: "wendy@example.com",
        rosterName: "Wendy Example",
        kind: "STUDENT",
      }),
    );
    const { seat: s2 } = ok(
      await Rostering.importSeat({
        externalKey: "ek-111",
        email: "wendy-staff@example.com",
        rosterName: "Wendy Staff",
        kind: "STAFF",
      }),
    );
    const u = user("wendy");
    ok(await Rostering.claimSeat({ seat: s1._id, user: u }));
    ok(await Rostering.dropSeat({ seat: s1._id }));
    ok(await Rostering.claimSeat({ seat: s2._id, user: u }));

    const results = await Rostering._getSeatByUser({ user: u });
    expect(results).toHaveLength(2);
  });

  test("_getSeatByExternalKey returns seat for external key", async () => {
    const { seat: s } = ok(
      await Rostering.importSeat({
        externalKey: "ek-120",
        email: "xander@example.com",
        rosterName: "Xander Example",
        kind: "AUDITOR",
      }),
    );

    const results = await Rostering._getSeatByExternalKey({
      externalKey: "ek-120",
    });
    expect(results).toHaveLength(1);
    expect(results[0].seat).toBe(s._id);
    expect(results[0].email).toBe("xander@example.com");

    expect(
      await Rostering._getSeatByExternalKey({ externalKey: "nonexistent" }),
    ).toEqual([]);
  });

  test("_getActiveStudentsInSection filters by section", async () => {
    const { section: secA } = ok(
      await Rostering.createSection({ name: "Section A" }),
    );
    const { section: secB } = ok(
      await Rostering.createSection({ name: "Section B" }),
    );

    const { seat: sA1 } = ok(
      await Rostering.importSeat({
        externalKey: "ek-130",
        email: "yin@example.com",
        rosterName: "Yin Example",
        kind: "STUDENT",
        section: secA._id,
      }),
    );
    const { seat: sA2 } = ok(
      await Rostering.importSeat({
        externalKey: "ek-131",
        email: "yang@example.com",
        rosterName: "Yang Example",
        kind: "STUDENT",
        section: secA._id,
      }),
    );
    const { seat: sB1 } = ok(
      await Rostering.importSeat({
        externalKey: "ek-132",
        email: "zane@example.com",
        rosterName: "Zane Example",
        kind: "STUDENT",
        section: secB._id,
      }),
    );
    // Student with no section
    const { seat: sNoSec } = ok(
      await Rostering.importSeat({
        externalKey: "ek-133",
        email: "zoe@example.com",
        rosterName: "Zoe Example",
        kind: "STUDENT",
      }),
    );

    // Claim all students
    ok(await Rostering.claimSeat({ seat: sA1._id, user: user("yin") }));
    ok(await Rostering.claimSeat({ seat: sA2._id, user: user("yang") }));
    ok(await Rostering.claimSeat({ seat: sB1._id, user: user("zane") }));
    ok(await Rostering.claimSeat({ seat: sNoSec._id, user: user("zoe") }));

    const inA = await Rostering._getActiveStudentsInSection({
      section: secA._id,
    });
    expect(inA).toHaveLength(2);
    expect(inA).toContainEqual({
      user: user("yin"),
      seat: sA1._id,
      rosterName: "Yin Example",
      email: "yin@example.com",
    });
    expect(inA).toContainEqual({
      user: user("yang"),
      seat: sA2._id,
      rosterName: "Yang Example",
      email: "yang@example.com",
    });

    const inB = await Rostering._getActiveStudentsInSection({
      section: secB._id,
    });
    expect(inB).toHaveLength(1);
    expect(inB[0].user).toBe(user("zane"));

    expect(
      await Rostering._getActiveStudentsInSection({
        section: section("empty"),
      }),
    ).toEqual([]);
  });

  test("_getUnclaimedSeats returns PENDING seats without user", async () => {
    const { seat: s1 } = ok(
      await Rostering.importSeat({
        externalKey: "ek-140",
        email: "a@example.com",
        rosterName: "A Example",
        kind: "STUDENT",
      }),
    );
    const { seat: s2 } = ok(
      await Rostering.importSeat({
        externalKey: "ek-141",
        email: "b@example.com",
        rosterName: "B Example",
        kind: "STAFF",
      }),
    );
    const { seat: s3 } = ok(
      await Rostering.importSeat({
        externalKey: "ek-142",
        email: "c@example.com",
        rosterName: "C Example",
        kind: "AUDITOR",
      }),
    );

    // Claim only s3
    ok(await Rostering.claimSeat({ seat: s3._id, user: user("c") }));

    const unclaimed = await Rostering._getUnclaimedSeats();
    expect(unclaimed).toHaveLength(2);
    expect(unclaimed).toContainEqual({
      seat: s1._id,
      externalKey: "ek-140",
      email: "a@example.com",
      rosterName: "A Example",
      kind: "STUDENT",
      section: undefined,
    });
    expect(unclaimed).toContainEqual({
      seat: s2._id,
      externalKey: "ek-141",
      email: "b@example.com",
      rosterName: "B Example",
      kind: "STAFF",
      section: undefined,
    });
  });

  test("_getActiveMembers returns all ACTIVE seats across all kinds", async () => {
    const { seat: s1 } = ok(
      await Rostering.importSeat({
        externalKey: "ek-150",
        email: "d@example.com",
        rosterName: "D Example",
        kind: "STUDENT",
      }),
    );
    const { seat: s2 } = ok(
      await Rostering.importSeat({
        externalKey: "ek-151",
        email: "e@example.com",
        rosterName: "E Example",
        kind: "STAFF",
      }),
    );
    const { seat: s3 } = ok(
      await Rostering.importSeat({
        externalKey: "ek-152",
        email: "f@example.com",
        rosterName: "F Example",
        kind: "AUDITOR",
      }),
    );
    const { seat: _s4 } = ok(
      await Rostering.importSeat({
        externalKey: "ek-153",
        email: "g@example.com",
        rosterName: "G Example",
        kind: "STUDENT",
      }),
    );

    ok(await Rostering.claimSeat({ seat: s1._id, user: user("d") }));
    ok(await Rostering.claimSeat({ seat: s2._id, user: user("e") }));
    ok(await Rostering.claimSeat({ seat: s3._id, user: user("f") }));
    // s4 stays PENDING

    const members = await Rostering._getActiveMembers();
    expect(members).toHaveLength(3);
    expect(members).toContainEqual({
      user: user("d"),
      seat: s1._id,
      kind: "STUDENT",
      section: undefined,
      rosterName: "D Example",
      email: "d@example.com",
    });
    expect(members).toContainEqual({
      user: user("e"),
      seat: s2._id,
      kind: "STAFF",
      section: undefined,
      rosterName: "E Example",
      email: "e@example.com",
    });
    expect(members).toContainEqual({
      user: user("f"),
      seat: s3._id,
      kind: "AUDITOR",
      section: undefined,
      rosterName: "F Example",
      email: "f@example.com",
    });
  });

  test("_getSeat returns seat details by id", async () => {
    const { seat: s } = ok(
      await Rostering.importSeat({
        externalKey: "ek-160",
        email: "h@example.com",
        rosterName: "H Example",
        kind: "STUDENT",
      }),
    );

    const results = await Rostering._getSeat({ seat: s._id });
    expect(results).toHaveLength(1);
    expect(results[0].seat).toBe(s._id);
    expect(results[0].externalKey).toBe("ek-160");
    expect(results[0].status).toBe("PENDING");

    expect(await Rostering._getSeat({ seat: seat("ghost") })).toEqual([]);
  });

  test("namespaces isolate duplicate concept instances", async () => {
    const Fall2026 = new RosteringConcept(mongo.db, "Fall2026");
    const Spring2027 = new RosteringConcept(mongo.db, "Spring2027");

    ok(
      await Fall2026.configureClass({
        code: "CS101",
        title: "Fall CS",
        term: "Fall 2026",
        timezone: "America/New_York",
      }),
    );
    ok(
      await Spring2027.configureClass({
        code: "CS201",
        title: "Spring CS",
        term: "Spring 2027",
        timezone: "America/Chicago",
      }),
    );

    const fallClass = await Fall2026._getClass();
    const springClass = await Spring2027._getClass();

    expect(fallClass).toEqual([
      {
        code: "CS101",
        title: "Fall CS",
        term: "Fall 2026",
        timezone: "America/New_York",
        status: "ACTIVE",
      },
    ]);
    expect(springClass).toEqual([
      {
        code: "CS201",
        title: "Spring CS",
        term: "Spring 2027",
        timezone: "America/Chicago",
        status: "ACTIVE",
      },
    ]);
  });
});
