import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { setupTestDb } from "@utils/testing.ts";
import type { ID } from "@utils/types.ts";
import AssigningConcept from "./AssigningConcept.ts";

const mongo = await setupTestDb();
const Assigning = new AssigningConcept(mongo.db);

afterAll(() => mongo.stop());

beforeEach(async () => {
  await mongo.db.collection("Assigning.assignments").deleteMany({});
  await mongo.db.collection("Assigning.releases").deleteMany({});
});

/** Narrow a result union to its success branch, failing the test otherwise. */
function ok<T>(result: T | { error: string }): T {
  if (result && typeof result === "object" && "error" in result) {
    throw new Error(`Expected success but got error: ${result.error}`);
  }
  return result as T;
}

const author = (s: string) => s as ID;
const assignee = (s: string) => s as ID;

function draftPayload(overrides: Record<string, unknown> = {}) {
  return {
    author: author("teacher1"),
    title: "Test Assignment",
    instructions: "Complete the work.",
    kind: "HOMEWORK" as const,
    availableAt: new Date("2026-06-01"),
    dueAt: new Date("2026-06-15"),
    acceptsSubmissions: true,
    audience: "EVERYONE" as const,
    ...overrides,
  };
}

describe("Assigning", () => {
  test("createDraft creates assignment in DRAFT status", async () => {
    const { assignment } = ok(await Assigning.createDraft(draftPayload()));
    expect(assignment).toBeString();
    const [doc] = await Assigning._getAssignment({ assignment });
    expect(doc.status).toBe("DRAFT");
    expect(doc.title).toBe("Test Assignment");
  });

  test("createDraft with EVERYONE audience requires empty targets", async () => {
    const result = await Assigning.createDraft(
      draftPayload({ audience: "EVERYONE", targets: [assignee("s1")] }),
    );
    expect(result).toHaveProperty("error");
  });

  test("createDraft with TARGETS audience requires non-empty targets", async () => {
    const result = await Assigning.createDraft(
      draftPayload({ audience: "TARGETS", targets: [] }),
    );
    expect(result).toHaveProperty("error");
  });

  test("createDraft with TARGETS audience stores targets", async () => {
    const { assignment } = ok(
      await Assigning.createDraft(
        draftPayload({
          audience: "TARGETS",
          targets: [assignee("s1"), assignee("s2")],
        }),
      ),
    );
    const [doc] = await Assigning._getAssignment({ assignment });
    expect(doc.audience).toBe("TARGETS");
    expect(doc.targets).toHaveLength(2);
  });

  test("revise updates assignment fields", async () => {
    const { assignment } = ok(await Assigning.createDraft(draftPayload()));
    ok(
      await Assigning.revise({
        assignment,
        ...draftPayload({ title: "Revised Title", instructions: "Updated." }),
      }),
    );
    const [doc] = await Assigning._getAssignment({ assignment });
    expect(doc.title).toBe("Revised Title");
    expect(doc.instructions).toBe("Updated.");
  });

  test("revise fails for non-existent assignment", async () => {
    const result = await Assigning.revise({
      assignment: author("ghost"),
      ...draftPayload(),
    });
    expect(result).toHaveProperty("error");
  });

  test("publish transitions DRAFT to PUBLISHED", async () => {
    const { assignment } = ok(await Assigning.createDraft(draftPayload()));
    ok(await Assigning.publish({ assignment }));
    const [doc] = await Assigning._getAssignment({ assignment });
    expect(doc.status).toBe("PUBLISHED");
  });

  test("publish fails if already published", async () => {
    const { assignment } = ok(await Assigning.createDraft(draftPayload()));
    ok(await Assigning.publish({ assignment }));
    const result = await Assigning.publish({ assignment });
    expect(result).toHaveProperty("error");
  });

  test("publish fails if not DRAFT", async () => {
    const { assignment } = ok(await Assigning.createDraft(draftPayload()));
    ok(await Assigning.publish({ assignment }));
    ok(await Assigning.archive({ assignment }));
    const result = await Assigning.publish({ assignment });
    expect(result).toHaveProperty("error");
  });

  test("archive changes status to ARCHIVED", async () => {
    const { assignment } = ok(await Assigning.createDraft(draftPayload()));
    ok(await Assigning.archive({ assignment }));
    const [doc] = await Assigning._getAssignment({ assignment });
    expect(doc.status).toBe("ARCHIVED");
  });

  test("assign creates release for published assignment", async () => {
    const { assignment } = ok(await Assigning.createDraft(draftPayload()));
    ok(await Assigning.publish({ assignment }));
    const { release } = ok(
      await Assigning.assign({ assignment, assignee: assignee("student1") }),
    );
    expect(release).toBeString();
    const [rel] = await Assigning._getRelease({
      assignment,
      assignee: assignee("student1"),
    });
    expect(rel.status).toBe("ASSIGNED");
  });

  test("assign rejects for non-published assignment", async () => {
    const { assignment } = ok(await Assigning.createDraft(draftPayload()));
    const result = await Assigning.assign({
      assignment,
      assignee: assignee("student1"),
    });
    expect(result).toHaveProperty("error");
  });

  test("assign rejects duplicate (assignment, assignee)", async () => {
    const { assignment } = ok(await Assigning.createDraft(draftPayload()));
    ok(await Assigning.publish({ assignment }));
    ok(await Assigning.assign({ assignment, assignee: assignee("student1") }));
    const result = await Assigning.assign({
      assignment,
      assignee: assignee("student1"),
    });
    expect(result).toHaveProperty("error");
  });

  test("withdraw changes release status to WITHDRAWN", async () => {
    const { assignment } = ok(await Assigning.createDraft(draftPayload()));
    ok(await Assigning.publish({ assignment }));
    const student = assignee("student1");
    ok(await Assigning.assign({ assignment, assignee: student }));
    const { release } = ok(
      await Assigning.withdraw({ assignment, assignee: student }),
    );
    expect(release).toBeString();
    const [rel] = await Assigning._getRelease({
      assignment,
      assignee: student,
    });
    expect(rel.status).toBe("WITHDRAWN");
  });

  test("withdraw fails if no active release", async () => {
    const { assignment } = ok(await Assigning.createDraft(draftPayload()));
    const result = await Assigning.withdraw({
      assignment,
      assignee: assignee("student1"),
    });
    expect(result).toHaveProperty("error");
  });

  test("setDueOverride sets override date", async () => {
    const { assignment } = ok(await Assigning.createDraft(draftPayload()));
    ok(await Assigning.publish({ assignment }));
    const student = assignee("student1");
    ok(await Assigning.assign({ assignment, assignee: student }));
    const overrideDate = new Date("2026-06-20");
    ok(
      await Assigning.setDueOverride({
        assignment,
        assignee: student,
        dueAt: overrideDate,
      }),
    );
    const [rel] = await Assigning._getRelease({
      assignment,
      assignee: student,
    });
    expect(rel.dueOverride).toEqual(overrideDate);
  });

  test("clearDueOverride removes override", async () => {
    const { assignment } = ok(await Assigning.createDraft(draftPayload()));
    ok(await Assigning.publish({ assignment }));
    const student = assignee("student1");
    ok(await Assigning.assign({ assignment, assignee: student }));
    ok(
      await Assigning.setDueOverride({
        assignment,
        assignee: student,
        dueAt: new Date("2026-06-20"),
      }),
    );
    ok(await Assigning.clearDueOverride({ assignment, assignee: student }));
    const [rel] = await Assigning._getRelease({
      assignment,
      assignee: student,
    });
    expect(rel.dueOverride).toBeUndefined();
  });

  test("_getDue returns override when set, assignment dueAt otherwise", async () => {
    const { assignment } = ok(await Assigning.createDraft(draftPayload()));
    ok(await Assigning.publish({ assignment }));
    const student = assignee("student1");
    ok(await Assigning.assign({ assignment, assignee: student }));

    // Without override
    const [due1] = await Assigning._getDue({ assignment, assignee: student });
    expect(due1.dueAt).toEqual(new Date("2026-06-15"));

    // With override
    const overrideDate = new Date("2026-06-25");
    ok(
      await Assigning.setDueOverride({
        assignment,
        assignee: student,
        dueAt: overrideDate,
      }),
    );
    const [due2] = await Assigning._getDue({ assignment, assignee: student });
    expect(due2.dueAt).toEqual(overrideDate);
  });

  test("_getDue returns both dueAt and closeAt", async () => {
    const { assignment } = ok(
      await Assigning.createDraft(
        draftPayload({ closeAt: new Date("2026-06-30") }),
      ),
    );
    ok(await Assigning.publish({ assignment }));
    const student = assignee("student1");
    ok(await Assigning.assign({ assignment, assignee: student }));
    const [due] = await Assigning._getDue({ assignment, assignee: student });
    expect(due.dueAt).toEqual(new Date("2026-06-15"));
    expect(due.closeAt).toEqual(new Date("2026-06-30"));
  });

  test("_getDue returns empty for non-existent assignment", async () => {
    const result = await Assigning._getDue({
      assignment: author("ghost"),
      assignee: assignee("student1"),
    });
    expect(result).toEqual([]);
  });

  test("_isAssigned returns true when release exists with ASSIGNED status", async () => {
    const { assignment } = ok(await Assigning.createDraft(draftPayload()));
    ok(await Assigning.publish({ assignment }));
    const student = assignee("student1");

    const [before] = await Assigning._isAssigned({
      assignment,
      assignee: student,
    });
    expect(before.assigned).toBe(false);

    ok(await Assigning.assign({ assignment, assignee: student }));
    const [after] = await Assigning._isAssigned({
      assignment,
      assignee: student,
    });
    expect(after.assigned).toBe(true);
  });

  test("_isAssigned returns false after withdraw", async () => {
    const { assignment } = ok(await Assigning.createDraft(draftPayload()));
    ok(await Assigning.publish({ assignment }));
    const student = assignee("student1");
    ok(await Assigning.assign({ assignment, assignee: student }));
    ok(await Assigning.withdraw({ assignment, assignee: student }));
    const [result] = await Assigning._isAssigned({
      assignment,
      assignee: student,
    });
    expect(result.assigned).toBe(false);
  });

  test("_getAssigned returns all assignments for an assignee", async () => {
    const a1 = ok(await Assigning.createDraft(draftPayload()));
    const a2 = ok(
      await Assigning.createDraft(
        draftPayload({ title: "Second Assignment", kind: "PROJECT" as const }),
      ),
    );
    ok(await Assigning.publish({ assignment: a1.assignment }));
    ok(await Assigning.publish({ assignment: a2.assignment }));
    const student = assignee("student1");
    ok(
      await Assigning.assign({ assignment: a1.assignment, assignee: student }),
    );
    ok(
      await Assigning.assign({ assignment: a2.assignment, assignee: student }),
    );

    const assigned = await Assigning._getAssigned({ assignee: student });
    expect(assigned).toHaveLength(2);
    expect(assigned).toContainEqual({
      assignment: a1.assignment,
      release: expect.any(String) as ID,
      dueOverride: undefined,
      status: "ASSIGNED",
    });
    expect(assigned).toContainEqual({
      assignment: a2.assignment,
      release: expect.any(String) as ID,
      dueOverride: undefined,
      status: "ASSIGNED",
    });
  });

  test("_getAssignees returns all assignees for an assignment", async () => {
    const { assignment } = ok(await Assigning.createDraft(draftPayload()));
    ok(await Assigning.publish({ assignment }));
    const s1 = assignee("student1");
    const s2 = assignee("student2");
    ok(await Assigning.assign({ assignment, assignee: s1 }));
    ok(await Assigning.assign({ assignment, assignee: s2 }));

    const assignees = await Assigning._getAssignees({ assignment });
    expect(assignees).toHaveLength(2);
    expect(assignees).toContainEqual({ assignee: s1 });
    expect(assignees).toContainEqual({ assignee: s2 });
  });

  test("_getAssignees excludes withdrawn releases", async () => {
    const { assignment } = ok(await Assigning.createDraft(draftPayload()));
    ok(await Assigning.publish({ assignment }));
    const s1 = assignee("student1");
    ok(await Assigning.assign({ assignment, assignee: s1 }));
    ok(await Assigning.withdraw({ assignment, assignee: s1 }));

    const assignees = await Assigning._getAssignees({ assignment });
    expect(assignees).toEqual([]);
  });

  test("_getPublished returns only PUBLISHED assignments", async () => {
    const _d = ok(await Assigning.createDraft(draftPayload()));
    const p = ok(
      await Assigning.createDraft(draftPayload({ title: "Publish Me" })),
    );
    ok(await Assigning.publish({ assignment: p.assignment }));

    const published = await Assigning._getPublished();
    expect(published).toHaveLength(1);
    expect(published[0].assignment).toBe(p.assignment);
    expect(published[0].audience).toBe("EVERYONE");
  });

  test("_getPublishedInWindow filters by date window", async () => {
    const { assignment: a1 } = ok(
      await Assigning.createDraft(
        draftPayload({
          title: "June",
          availableAt: new Date("2026-06-01"),
          dueAt: new Date("2026-06-10"),
        }),
      ),
    );
    const { assignment: a2 } = ok(
      await Assigning.createDraft(
        draftPayload({
          title: "July",
          availableAt: new Date("2026-07-01"),
          dueAt: new Date("2026-07-15"),
        }),
      ),
    );
    ok(await Assigning.publish({ assignment: a1 }));
    ok(await Assigning.publish({ assignment: a2 }));

    const june = await Assigning._getPublishedInWindow({
      start: new Date("2026-06-01"),
      end: new Date("2026-06-30"),
    });
    expect(june).toHaveLength(1);
    expect(june[0].assignment).toBe(a1);

    const july = await Assigning._getPublishedInWindow({
      start: new Date("2026-07-01"),
      end: new Date("2026-07-31"),
    });
    expect(july).toHaveLength(1);
    expect(july[0].assignment).toBe(a2);
  });

  test("_getPublishedInWindow matches availableAt in window", async () => {
    const { assignment } = ok(
      await Assigning.createDraft(
        draftPayload({
          availableAt: new Date("2026-08-01"),
          dueAt: new Date("2026-12-31"),
        }),
      ),
    );
    ok(await Assigning.publish({ assignment }));

    const result = await Assigning._getPublishedInWindow({
      start: new Date("2026-08-01"),
      end: new Date("2026-08-07"),
    });
    expect(result).toHaveLength(1);
  });

  test("_getPublishedForAudience matches EVERYONE and TARGETS correctly", async () => {
    const { assignment: a1 } = ok(
      await Assigning.createDraft(
        draftPayload({ title: "Everyone", audience: "EVERYONE" as const }),
      ),
    );
    const sectionA = author("section-a");
    const { assignment: a2 } = ok(
      await Assigning.createDraft(
        draftPayload({
          title: "Section A Only",
          audience: "TARGETS" as const,
          targets: [sectionA],
        }),
      ),
    );
    const { assignment: a3 } = ok(
      await Assigning.createDraft(
        draftPayload({
          title: "Section B Only",
          audience: "TARGETS" as const,
          targets: [author("section-b")],
        }),
      ),
    );
    ok(await Assigning.publish({ assignment: a1 }));
    ok(await Assigning.publish({ assignment: a2 }));
    ok(await Assigning.publish({ assignment: a3 }));

    // section-a sees EVERYONE assignments plus TARGETS where in targets
    const forA = await Assigning._getPublishedForAudience({
      audience: sectionA,
    });
    expect(forA).toHaveLength(2);
    expect(forA).toContainEqual({ assignment: a1 });
    expect(forA).toContainEqual({ assignment: a2 });

    // section-b sees EVERYONE assignments plus TARGETS where in targets
    const forB = await Assigning._getPublishedForAudience({
      audience: author("section-b"),
    });
    expect(forB).toHaveLength(2);
    expect(forB).toContainEqual({ assignment: a1 });
    expect(forB).toContainEqual({ assignment: a3 });

    // unrelated audience only sees EVERYONE
    const forX = await Assigning._getPublishedForAudience({
      audience: author("section-x"),
    });
    expect(forX).toHaveLength(1);
    expect(forX).toContainEqual({ assignment: a1 });
  });

  test("Assignment created at date is stored", async () => {
    const before = new Date();
    const { assignment } = ok(await Assigning.createDraft(draftPayload()));
    const after = new Date();
    const [doc] = await Assigning._getAssignment({ assignment });
    expect(doc.createdAt instanceof Date).toBe(true);
    expect(doc.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(doc.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  test("revise does not change author or createdAt", async () => {
    const { assignment } = ok(await Assigning.createDraft(draftPayload()));
    const [original] = await Assigning._getAssignment({ assignment });
    ok(
      await Assigning.revise({
        assignment,
        ...draftPayload({ title: "Changed" }),
      }),
    );
    const [revised] = await Assigning._getAssignment({ assignment });
    expect(revised.author).toBe(original.author);
    expect(revised.createdAt).toEqual(original.createdAt);
    expect(revised.updatedAt).toBeTruthy();
  });

  test("archive can be called on any status", async () => {
    const { assignment } = ok(await Assigning.createDraft(draftPayload()));
    // Archive from DRAFT
    ok(await Assigning.archive({ assignment }));
    const [doc] = await Assigning._getAssignment({ assignment });
    expect(doc.status).toBe("ARCHIVED");
  });

  test("publish sets updatedAt", async () => {
    const { assignment } = ok(await Assigning.createDraft(draftPayload()));
    ok(await Assigning.publish({ assignment }));
    const [doc] = await Assigning._getAssignment({ assignment });
    expect(doc.updatedAt).toBeTruthy();
  });
});
