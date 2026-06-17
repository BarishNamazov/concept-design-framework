import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { setupTestDb } from "@utils/testing.ts";
import type { ID } from "@utils/types.ts";
import StudentNotingConcept from "./StudentNotingConcept.ts";

const mongo = await setupTestDb();
const StudentNoting = new StudentNotingConcept(mongo.db);

afterAll(() => mongo.stop());

beforeEach(async () => {
  await mongo.db.collection("StudentNoting.notes").deleteMany({});
});

/** Narrow a result union to its success branch, failing the test otherwise. */
function ok<T>(result: T | { error: string }): T {
  if (result && typeof result === "object" && "error" in result) {
    throw new Error(`Expected success but got error: ${result.error}`);
  }
  return result as T;
}

const author = (s: string) => s as ID;
const learner = (s: string) => s as ID;

describe("StudentNoting", () => {
  test("write creates OPEN note with author, learner, body, visibility", async () => {
    const a = author("staff1");
    const l = learner("student1");
    const { note } = ok(
      await StudentNoting.write({
        author: a,
        learner: l,
        body: "Needs improvement",
        visibility: "STAFF_ONLY",
      }),
    );
    expect(note).toBeString();
    const rows = await StudentNoting._getNote({ note });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      note,
      author: a,
      learner: l,
      body: "Needs improvement",
      visibility: "STAFF_ONLY",
      status: "OPEN",
    });
    expect(rows[0].createdAt).toBeInstanceOf(Date);
    expect(rows[0].tags).toEqual([]);
  });

  test("write defaults tags to empty array", async () => {
    const a = author("staff2");
    const l = learner("student2");
    const { note } = ok(
      await StudentNoting.write({
        author: a,
        learner: l,
        body: "Good progress",
        visibility: "LEARNER_VISIBLE",
      }),
    );
    const rows = await StudentNoting._getNote({ note });
    expect(rows[0].tags).toEqual([]);
  });

  test("revise updates body, visibility, tags, followUpAt", async () => {
    const a = author("staff3");
    const l = learner("student3");
    const { note } = ok(
      await StudentNoting.write({
        author: a,
        learner: l,
        body: "Original",
        visibility: "STAFF_ONLY",
      }),
    );
    const followUp = new Date("2026-07-01");
    ok(
      await StudentNoting.revise({
        note,
        body: "Updated body",
        visibility: "LEARNER_VISIBLE",
        tags: ["math", "urgent"],
        followUpAt: followUp,
      }),
    );
    const rows = await StudentNoting._getNote({ note });
    expect(rows).toHaveLength(1);
    expect(rows[0].body).toBe("Updated body");
    expect(rows[0].visibility).toBe("LEARNER_VISIBLE");
    expect(rows[0].tags).toEqual(["math", "urgent"]);
    expect(rows[0].followUpAt).toEqual(followUp);
    expect(rows[0].updatedAt).toBeInstanceOf(Date);
  });

  test("revise fails on non-OPEN note", async () => {
    const a = author("staff4");
    const l = learner("student4");
    const { note } = ok(
      await StudentNoting.write({
        author: a,
        learner: l,
        body: "Some note",
        visibility: "STAFF_ONLY",
      }),
    );
    ok(await StudentNoting.resolve({ note }));
    expect(
      await StudentNoting.revise({ note, body: "Changed" }),
    ).toHaveProperty("error");
  });

  test("resolve transitions OPEN->RESOLVED", async () => {
    const a = author("staff5");
    const l = learner("student5");
    const { note } = ok(
      await StudentNoting.write({
        author: a,
        learner: l,
        body: "To resolve",
        visibility: "LEARNER_VISIBLE",
      }),
    );
    ok(await StudentNoting.resolve({ note }));
    const rows = await StudentNoting._getNote({ note });
    expect(rows[0].status).toBe("RESOLVED");
  });

  test("resolve fails on non-OPEN note", async () => {
    const a = author("staff6");
    const l = learner("student6");
    const { note } = ok(
      await StudentNoting.write({
        author: a,
        learner: l,
        body: "Already resolved",
        visibility: "STAFF_ONLY",
      }),
    );
    ok(await StudentNoting.resolve({ note }));
    expect(await StudentNoting.resolve({ note })).toHaveProperty("error");
  });

  test("archive transitions RESOLVED->ARCHIVED", async () => {
    const a = author("staff7");
    const l = learner("student7");
    const { note } = ok(
      await StudentNoting.write({
        author: a,
        learner: l,
        body: "To archive",
        visibility: "LEARNER_VISIBLE",
      }),
    );
    ok(await StudentNoting.resolve({ note }));
    ok(await StudentNoting.archive({ note }));
    const rows = await StudentNoting._getNote({ note });
    expect(rows[0].status).toBe("ARCHIVED");
  });

  test("archive fails on non-RESOLVED note", async () => {
    const a = author("staff8");
    const l = learner("student8");
    const { note } = ok(
      await StudentNoting.write({
        author: a,
        learner: l,
        body: "Open note",
        visibility: "STAFF_ONLY",
      }),
    );
    expect(await StudentNoting.archive({ note })).toHaveProperty("error");
  });

  test("restore transitions RESOLVED/ARCHIVED -> OPEN", async () => {
    const a = author("staff9");
    const l = learner("student9");

    const { note: n1 } = ok(
      await StudentNoting.write({
        author: a,
        learner: l,
        body: "Resolved note",
        visibility: "STAFF_ONLY",
      }),
    );
    ok(await StudentNoting.resolve({ note: n1 }));
    ok(await StudentNoting.restore({ note: n1 }));
    expect((await StudentNoting._getNote({ note: n1 }))[0].status).toBe("OPEN");

    const { note: n2 } = ok(
      await StudentNoting.write({
        author: a,
        learner: l,
        body: "Archived note",
        visibility: "LEARNER_VISIBLE",
      }),
    );
    ok(await StudentNoting.resolve({ note: n2 }));
    ok(await StudentNoting.archive({ note: n2 }));
    ok(await StudentNoting.restore({ note: n2 }));
    expect((await StudentNoting._getNote({ note: n2 }))[0].status).toBe("OPEN");
  });

  test("restore fails on already OPEN note", async () => {
    const a = author("staff10");
    const l = learner("student10");
    const { note } = ok(
      await StudentNoting.write({
        author: a,
        learner: l,
        body: "Open note",
        visibility: "STAFF_ONLY",
      }),
    );
    expect(await StudentNoting.restore({ note })).toHaveProperty("error");
  });

  test("acknowledge sets acknowledgedAt for LEARNER_VISIBLE note", async () => {
    const a = author("staff11");
    const l = learner("student11");
    const { note } = ok(
      await StudentNoting.write({
        author: a,
        learner: l,
        body: "Feedback",
        visibility: "LEARNER_VISIBLE",
      }),
    );
    ok(await StudentNoting.acknowledge({ note, learner: l }));
    const rows = await StudentNoting._getNote({ note });
    expect(rows[0].acknowledgedAt).toBeInstanceOf(Date);
  });

  test("acknowledge fails for STAFF_ONLY note", async () => {
    const a = author("staff12");
    const l = learner("student12");
    const { note } = ok(
      await StudentNoting.write({
        author: a,
        learner: l,
        body: "Internal",
        visibility: "STAFF_ONLY",
      }),
    );
    expect(
      await StudentNoting.acknowledge({ note, learner: l }),
    ).toHaveProperty("error");
  });

  test("acknowledge fails if learner does not match note's learner", async () => {
    const a = author("staff13");
    const l1 = learner("student13");
    const l2 = learner("student14");
    const { note } = ok(
      await StudentNoting.write({
        author: a,
        learner: l1,
        body: "Feedback",
        visibility: "LEARNER_VISIBLE",
      }),
    );
    expect(
      await StudentNoting.acknowledge({ note, learner: l2 }),
    ).toHaveProperty("error");
  });

  test("_getActiveStaffNotes excludes ARCHIVED but includes OPEN+RESOLVED", async () => {
    const a = author("staff14");
    const l = learner("student15");

    const { note: open } = ok(
      await StudentNoting.write({
        author: a,
        learner: l,
        body: "Open",
        visibility: "STAFF_ONLY",
      }),
    );
    const { note: resolved } = ok(
      await StudentNoting.write({
        author: a,
        learner: l,
        body: "Resolved",
        visibility: "LEARNER_VISIBLE",
      }),
    );
    const { note: archived } = ok(
      await StudentNoting.write({
        author: a,
        learner: l,
        body: "Archived",
        visibility: "STAFF_ONLY",
      }),
    );
    ok(await StudentNoting.resolve({ note: resolved }));
    ok(await StudentNoting.resolve({ note: archived }));
    ok(await StudentNoting.archive({ note: archived }));

    const active = await StudentNoting._getActiveStaffNotes({ learner: l });
    const activeIds = active.map((r) => r.note);
    expect(activeIds).toContain(open);
    expect(activeIds).toContain(resolved);
    expect(activeIds).not.toContain(archived);
  });

  test("_getLearnerVisibleNotes excludes STAFF_ONLY notes", async () => {
    const a = author("staff15");
    const l = learner("student16");

    const { note: staffOnly } = ok(
      await StudentNoting.write({
        author: a,
        learner: l,
        body: "Staff only",
        visibility: "STAFF_ONLY",
      }),
    );
    const { note: learnerVisible } = ok(
      await StudentNoting.write({
        author: a,
        learner: l,
        body: "Learner visible",
        visibility: "LEARNER_VISIBLE",
      }),
    );

    const results = await StudentNoting._getLearnerVisibleNotes({ learner: l });
    const ids = results.map((r) => r.note);
    expect(ids).toContain(learnerVisible);
    expect(ids).not.toContain(staffOnly);
  });

  test("_getLearnerVisibleNotes excludes ARCHIVED notes", async () => {
    const a = author("staff16");
    const l = learner("student17");

    const { note: active } = ok(
      await StudentNoting.write({
        author: a,
        learner: l,
        body: "Active",
        visibility: "LEARNER_VISIBLE",
      }),
    );
    const { note: archived } = ok(
      await StudentNoting.write({
        author: a,
        learner: l,
        body: "Old",
        visibility: "LEARNER_VISIBLE",
      }),
    );
    ok(await StudentNoting.resolve({ note: archived }));
    ok(await StudentNoting.archive({ note: archived }));

    const results = await StudentNoting._getLearnerVisibleNotes({ learner: l });
    const ids = results.map((r) => r.note);
    expect(ids).toContain(active);
    expect(ids).not.toContain(archived);
  });

  test("_getNotesByAuthor returns all notes by author", async () => {
    const a1 = author("staff17");
    const a2 = author("staff18");
    const l = learner("student18");

    const { note: n1 } = ok(
      await StudentNoting.write({
        author: a1,
        learner: l,
        body: "First",
        visibility: "STAFF_ONLY",
      }),
    );
    const { note: n2 } = ok(
      await StudentNoting.write({
        author: a1,
        learner: l,
        body: "Second",
        visibility: "LEARNER_VISIBLE",
      }),
    );
    ok(
      await StudentNoting.write({
        author: a2,
        learner: l,
        body: "Other author",
        visibility: "STAFF_ONLY",
      }),
    );

    const results = await StudentNoting._getNotesByAuthor({ author: a1 });
    const noteIds = results.map((r) => r.note);
    expect(results).toHaveLength(2);
    expect(noteIds).toContain(n1);
    expect(noteIds).toContain(n2);
    for (const r of results) {
      expect(r.learner).toBe(l);
      expect(r.createdAt).toBeInstanceOf(Date);
    }
  });

  test("_getOpenFollowUps filters by followUpAt before date", async () => {
    const a = author("staff19");
    const l = learner("student19");

    const past = new Date("2026-01-01");
    const future = new Date("2027-01-01");
    const cutoff = new Date("2026-06-15");

    ok(
      await StudentNoting.write({
        author: a,
        learner: l,
        body: "Due soon",
        visibility: "STAFF_ONLY",
        followUpAt: past,
      }),
    );
    ok(
      await StudentNoting.write({
        author: a,
        learner: l,
        body: "Not yet due",
        visibility: "LEARNER_VISIBLE",
        followUpAt: future,
      }),
    );
    // resolved note with past follow-up should not appear
    const { note: resolved } = ok(
      await StudentNoting.write({
        author: a,
        learner: l,
        body: "Resolved follow-up",
        visibility: "STAFF_ONLY",
        followUpAt: past,
      }),
    );
    ok(await StudentNoting.resolve({ note: resolved }));

    const results = await StudentNoting._getOpenFollowUps({ before: cutoff });
    expect(results).toHaveLength(1);
    expect(results[0].body).toBe("Due soon");
    expect(results[0].followUpAt).toEqual(past);
  });

  test("Tags stored and retrieved correctly", async () => {
    const a = author("staff20");
    const l = learner("student20");

    const { note: n1 } = ok(
      await StudentNoting.write({
        author: a,
        learner: l,
        body: "Tagged note",
        visibility: "LEARNER_VISIBLE",
        tags: ["reading", "comprehension"],
      }),
    );
    const rows = await StudentNoting._getNote({ note: n1 });
    expect(rows[0].tags).toEqual(["reading", "comprehension"]);

    ok(
      await StudentNoting.revise({
        note: n1,
        tags: ["math", "algebra"],
      }),
    );
    const updated = await StudentNoting._getNote({ note: n1 });
    expect(updated[0].tags).toEqual(["math", "algebra"]);
  });

  test("namespaces isolate duplicate concept instances", async () => {
    const NotesA = new StudentNotingConcept(mongo.db, "NotesA");
    const NotesB = new StudentNotingConcept(mongo.db, "NotesB");
    const a = author("staff21");
    const l = learner("student21");

    const { note } = ok(
      await NotesA.write({
        author: a,
        learner: l,
        body: "In namespace A",
        visibility: "STAFF_ONLY",
      }),
    );
    const rowsA = await NotesA._getNote({ note });
    expect(rowsA).toHaveLength(1);
    expect(rowsA[0].body).toBe("In namespace A");

    const rowsB = await NotesB._getNote({ note });
    expect(rowsB).toEqual([]);

    const rowsDefault = await StudentNoting._getNote({ note });
    expect(rowsDefault).toEqual([]);
  });
});
