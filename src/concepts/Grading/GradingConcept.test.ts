import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { setupTestDb } from "@utils/testing.ts";
import type { ID } from "@utils/types.ts";
import GradingConcept from "./GradingConcept.ts";

const mongo = await setupTestDb();
const Grading = new GradingConcept(mongo.db);

afterAll(() => mongo.stop());

beforeEach(async () => {
  await mongo.db.collection("Grading.gradeItems").deleteMany({});
  await mongo.db.collection("Grading.criteria").deleteMany({});
  await mongo.db.collection("Grading.gradeRecords").deleteMany({});
  await mongo.db.collection("Grading.criterionScores").deleteMany({});
});

/** Narrow a result union to its success branch, failing the test otherwise. */
function ok<T>(result: T | { error: string }): T {
  if (result && typeof result === "object" && "error" in result) {
    throw new Error(`Expected success but got error: ${result.error}`);
  }
  return result as T;
}

const item = (s: string) => s as ID;
const learner = (s: string) => s as ID;
const grader = (s: string) => s as ID;

describe("Grading", () => {
  test("configureItem creates grade item with maxPoints default 100", async () => {
    const i = item("assignment1");
    const { gradeItem } = ok(
      await Grading.configureItem({ item: i, label: "Assignment 1" }),
    );
    expect(gradeItem).toBeString();
    const rows = await Grading._getItem({ item: i });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.label).toBe("Assignment 1");
    expect(rows[0]?.maxPoints).toBe(100);
    expect(rows[0]?.status).toBe("ACTIVE");
  });

  test("configureItem updates existing active item for same item", async () => {
    const i = item("assignment2");
    ok(
      await Grading.configureItem({
        item: i,
        label: "Original",
        maxPoints: 50,
      }),
    );
    ok(
      await Grading.configureItem({
        item: i,
        label: "Updated",
        maxPoints: 75,
      }),
    );
    const rows = await Grading._getItem({ item: i });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.label).toBe("Updated");
    expect(rows[0]?.maxPoints).toBe(75);
  });

  test("archiveItem changes status to ARCHIVED", async () => {
    const i = item("assignment3");
    ok(
      await Grading.configureItem({
        item: i,
        label: "To Archive",
        maxPoints: 30,
      }),
    );
    ok(await Grading.archiveItem({ item: i }));
    const rows = await Grading._getItem({ item: i });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("ARCHIVED");
  });

  test("addCriterion creates criterion for item", async () => {
    const i = item("assignment4");
    ok(
      await Grading.configureItem({
        item: i,
        label: "With Criteria",
        maxPoints: 100,
      }),
    );
    const { criterion } = ok(
      await Grading.addCriterion({
        item: i,
        name: "Correctness",
        maxPoints: 60,
        position: 1,
      }),
    );
    expect(criterion).toBeString();
    const criteria = await Grading._getCriteria({ item: i });
    expect(criteria).toHaveLength(1);
    expect(criteria[0]?.name).toBe("Correctness");
    expect(criteria[0]?.maxPoints).toBe(60);
    expect(criteria[0]?.position).toBe(1);
  });

  test("reviseCriterion updates fields", async () => {
    const i = item("assignment5");
    ok(
      await Grading.configureItem({
        item: i,
        label: "Revise Test",
        maxPoints: 100,
      }),
    );
    const { criterion } = ok(
      await Grading.addCriterion({
        item: i,
        name: "Original",
        maxPoints: 10,
        position: 1,
      }),
    );
    ok(
      await Grading.reviseCriterion({
        criterion,
        name: "Revised",
        maxPoints: 20,
        position: 2,
      }),
    );
    const criteria = await Grading._getCriteria({ item: i });
    expect(criteria).toHaveLength(1);
    expect(criteria[0]?.name).toBe("Revised");
    expect(criteria[0]?.maxPoints).toBe(20);
    expect(criteria[0]?.position).toBe(2);
  });

  test("removeCriterion clears the criterion", async () => {
    const i = item("assignment6");
    ok(
      await Grading.configureItem({
        item: i,
        label: "Remove Test",
        maxPoints: 100,
      }),
    );
    const { criterion } = ok(
      await Grading.addCriterion({
        item: i,
        name: "To Remove",
        maxPoints: 10,
        position: 1,
      }),
    );
    ok(await Grading.removeCriterion({ criterion }));
    const criteria = await Grading._getCriteria({ item: i });
    expect(criteria).toHaveLength(0);
  });

  test("recordDraft saves draft score and feedback", async () => {
    const i = item("assignment7");
    const l = learner("alice");
    const g = grader("teacher");
    ok(
      await Grading.configureItem({
        item: i,
        label: "Draft Test",
        maxPoints: 50,
      }),
    );
    const { grade } = ok(
      await Grading.recordDraft({
        learner: l,
        item: i,
        grader: g,
        score: 42,
        feedback: "Good work",
      }),
    );
    expect(grade).toBeString();
    const rows = await Grading._getGrade({ learner: l, item: i });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("DRAFT");
    expect(rows[0]?.score).toBe(42);
    expect(rows[0]?.feedback).toBe("Good work");
  });

  test("recordDraft updates existing draft", async () => {
    const i = item("assignment8");
    const l = learner("bob");
    const g = grader("teacher");
    ok(
      await Grading.configureItem({
        item: i,
        label: "Update Draft",
        maxPoints: 100,
      }),
    );
    ok(
      await Grading.recordDraft({
        learner: l,
        item: i,
        grader: g,
        score: 70,
        feedback: "First pass",
      }),
    );
    ok(
      await Grading.recordDraft({
        learner: l,
        item: i,
        grader: g,
        score: 85,
        feedback: "Revised",
      }),
    );
    const rows = await Grading._getGrade({ learner: l, item: i });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.score).toBe(85);
    expect(rows[0]?.feedback).toBe("Revised");
  });

  test("recordDraft rejects if grade already RELEASED", async () => {
    const i = item("assignment9");
    const l = learner("carol");
    const g = grader("teacher");
    ok(
      await Grading.configureItem({
        item: i,
        label: "Released Test",
        maxPoints: 100,
      }),
    );
    ok(
      await Grading.recordDraft({
        learner: l,
        item: i,
        grader: g,
        score: 90,
      }),
    );
    ok(await Grading.release({ learner: l, item: i }));
    expect(
      await Grading.recordDraft({
        learner: l,
        item: i,
        grader: g,
        score: 50,
      }),
    ).toHaveProperty("error");
  });

  test("recordDraft rejects if grade already EXCUSED", async () => {
    const i = item("assignment10");
    const l = learner("dave");
    const g = grader("teacher");
    ok(
      await Grading.configureItem({
        item: i,
        label: "Excused Test",
        maxPoints: 100,
      }),
    );
    ok(
      await Grading.recordDraft({
        learner: l,
        item: i,
        grader: g,
        score: 80,
      }),
    );
    ok(await Grading.excuse({ learner: l, item: i, grader: g }));
    expect(
      await Grading.recordDraft({
        learner: l,
        item: i,
        grader: g,
        score: 50,
      }),
    ).toHaveProperty("error");
  });

  test("release transitions DRAFT to RELEASED with releasedAt", async () => {
    const i = item("assignment11");
    const l = learner("erin");
    const g = grader("teacher");
    ok(
      await Grading.configureItem({
        item: i,
        label: "Release Test",
        maxPoints: 100,
      }),
    );
    ok(
      await Grading.recordDraft({
        learner: l,
        item: i,
        grader: g,
        score: 95,
      }),
    );
    ok(await Grading.release({ learner: l, item: i }));
    const rows = await Grading._getGrade({ learner: l, item: i });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("RELEASED");
    expect(rows[0]?.releasedAt).toBeInstanceOf(Date);
  });

  test("release fails if no draft exists", async () => {
    const i = item("assignment12");
    const l = learner("frank");
    ok(
      await Grading.configureItem({
        item: i,
        label: "No Draft",
        maxPoints: 100,
      }),
    );
    expect(await Grading.release({ learner: l, item: i })).toHaveProperty(
      "error",
    );
  });

  test("retract transitions RELEASED back to DRAFT", async () => {
    const i = item("assignment13");
    const l = learner("grace");
    const g = grader("teacher");
    ok(
      await Grading.configureItem({
        item: i,
        label: "Retract Test",
        maxPoints: 100,
      }),
    );
    ok(
      await Grading.recordDraft({
        learner: l,
        item: i,
        grader: g,
        score: 88,
      }),
    );
    ok(await Grading.release({ learner: l, item: i }));
    ok(await Grading.retract({ learner: l, item: i }));
    const rows = await Grading._getGrade({ learner: l, item: i });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("DRAFT");
    expect(rows[0]?.releasedAt).toBeUndefined();
  });

  test("retract fails if not RELEASED", async () => {
    const i = item("assignment14");
    const l = learner("heidi");
    const g = grader("teacher");
    ok(
      await Grading.configureItem({
        item: i,
        label: "Not Released",
        maxPoints: 100,
      }),
    );
    ok(
      await Grading.recordDraft({
        learner: l,
        item: i,
        grader: g,
        score: 77,
      }),
    );
    expect(await Grading.retract({ learner: l, item: i })).toHaveProperty(
      "error",
    );
  });

  test("excuse sets status to EXCUSED", async () => {
    const i = item("assignment15");
    const l = learner("ivan");
    const g = grader("teacher");
    ok(
      await Grading.configureItem({
        item: i,
        label: "Excuse Test",
        maxPoints: 100,
      }),
    );
    ok(
      await Grading.recordDraft({
        learner: l,
        item: i,
        grader: g,
        score: 65,
      }),
    );
    ok(await Grading.excuse({ learner: l, item: i, grader: g, feedback: "Medical" }));
    const rows = await Grading._getGrade({ learner: l, item: i });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("EXCUSED");
    expect(rows[0]?.score).toBe(0);
    expect(rows[0]?.feedback).toBe("Medical");
  });

  test("_getGrade returns all statuses", async () => {
    const i = item("assignment16");
    const g = grader("teacher");
    ok(
      await Grading.configureItem({
        item: i,
        label: "All Statuses",
        maxPoints: 100,
      }),
    );
    ok(
      await Grading.recordDraft({
        learner: learner("alice"),
        item: i,
        grader: g,
        score: 80,
      }),
    );
    ok(
      await Grading.recordDraft({
        learner: learner("bob"),
        item: i,
        grader: g,
        score: 90,
      }),
    );
    ok(await Grading.release({ learner: learner("bob"), item: i }));
    ok(
      await Grading.recordDraft({
        learner: learner("carol"),
        item: i,
        grader: g,
        score: 70,
      }),
    );
    ok(
      await Grading.excuse({ learner: learner("carol"), item: i, grader: g }),
    );
    expect(
      await Grading._getGrade({ learner: learner("alice"), item: i }),
    ).toHaveLength(1);
    expect(
      await Grading._getGrade({ learner: learner("bob"), item: i }),
    ).toHaveLength(1);
    expect(
      await Grading._getGrade({ learner: learner("carol"), item: i }),
    ).toHaveLength(1);
  });

  test("_getReleasedGrade returns only RELEASED and EXCUSED", async () => {
    const i = item("assignment17");
    const g = grader("teacher");
    ok(
      await Grading.configureItem({
        item: i,
        label: "Released Query",
        maxPoints: 100,
      }),
    );
    ok(
      await Grading.recordDraft({
        learner: learner("alice"),
        item: i,
        grader: g,
        score: 80,
      }),
    );
    ok(
      await Grading.recordDraft({
        learner: learner("bob"),
        item: i,
        grader: g,
        score: 90,
      }),
    );
    ok(await Grading.release({ learner: learner("bob"), item: i }));
    ok(
      await Grading.recordDraft({
        learner: learner("carol"),
        item: i,
        grader: g,
        score: 70,
      }),
    );
    ok(
      await Grading.excuse({ learner: learner("carol"), item: i, grader: g }),
    );
    // alice is DRAFT — should not appear in released
    const aliceReleased = await Grading._getReleasedGrade({
      learner: learner("alice"),
      item: i,
    });
    expect(aliceReleased).toEqual([]);
    // bob is RELEASED
    const bobReleased = await Grading._getReleasedGrade({
      learner: learner("bob"),
      item: i,
    });
    expect(bobReleased).toHaveLength(1);
    expect(bobReleased[0]?.status).toBe("RELEASED");
    // carol is EXCUSED
    const carolReleased = await Grading._getReleasedGrade({
      learner: learner("carol"),
      item: i,
    });
    expect(carolReleased).toHaveLength(1);
    expect(carolReleased[0]?.status).toBe("EXCUSED");
  });

  test("_getDraftsForItem returns only DRAFT grades", async () => {
    const i = item("assignment18");
    const g = grader("teacher");
    ok(
      await Grading.configureItem({
        item: i,
        label: "Drafts Query",
        maxPoints: 100,
      }),
    );
    ok(
      await Grading.recordDraft({
        learner: learner("alice"),
        item: i,
        grader: g,
        score: 80,
      }),
    );
    ok(
      await Grading.recordDraft({
        learner: learner("bob"),
        item: i,
        grader: g,
        score: 90,
      }),
    );
    ok(await Grading.release({ learner: learner("bob"), item: i }));
    const drafts = await Grading._getDraftsForItem({ item: i });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.learner).toBe(learner("alice"));
  });

  test("scoreCriterion saves criterion score", async () => {
    const i = item("assignment19");
    const l = learner("alice");
    const g = grader("teacher");
    ok(
      await Grading.configureItem({
        item: i,
        label: "Criterion Score Test",
        maxPoints: 100,
      }),
    );
    const { criterion } = ok(
      await Grading.addCriterion({
        item: i,
        name: "Readability",
        maxPoints: 20,
        position: 1,
      }),
    );
    ok(
      await Grading.recordDraft({
        learner: l,
        item: i,
        grader: g,
        score: 85,
      }),
    );
    const { criterionScore } = ok(
      await Grading.scoreCriterion({
        learner: l,
        item: i,
        criterion,
        grader: g,
        points: 15,
        feedback: "Clear structure",
      }),
    );
    expect(criterionScore).toBeString();
    const scores = await Grading._getCriterionScores({
      learner: l,
      item: i,
    });
    expect(scores).toHaveLength(1);
    expect(scores[0]?.criterion).toBe(criterion);
    expect(scores[0]?.points).toBe(15);
    expect(scores[0]?.feedback).toBe("Clear structure");
  });

  test("_getCriterionScores returns all criterion scores for a learner's item", async () => {
    const i = item("assignment20");
    const l = learner("bob");
    const g = grader("teacher");
    ok(
      await Grading.configureItem({
        item: i,
        label: "Multi Criteria",
        maxPoints: 100,
      }),
    );
    const { criterion: c1 } = ok(
      await Grading.addCriterion({
        item: i,
        name: "Content",
        maxPoints: 50,
        position: 1,
      }),
    );
    const { criterion: c2 } = ok(
      await Grading.addCriterion({
        item: i,
        name: "Style",
        maxPoints: 50,
        position: 2,
      }),
    );
    ok(
      await Grading.recordDraft({
        learner: l,
        item: i,
        grader: g,
        score: 80,
      }),
    );
    ok(
      await Grading.scoreCriterion({
        learner: l,
        item: i,
        criterion: c1,
        grader: g,
        points: 45,
        feedback: "Great content",
      }),
    );
    ok(
      await Grading.scoreCriterion({
        learner: l,
        item: i,
        criterion: c2,
        grader: g,
        points: 35,
        feedback: "Good style",
      }),
    );
    const scores = await Grading._getCriterionScores({
      learner: l,
      item: i,
    });
    expect(scores).toHaveLength(2);
    expect(scores).toContainEqual({
      criterion: c1,
      points: 45,
      feedback: "Great content",
    });
    expect(scores).toContainEqual({
      criterion: c2,
      points: 35,
      feedback: "Good style",
    });
  });

  test("Score validation: non-excused score between 0 and maxPoints", async () => {
    const i = item("assignment21");
    const l = learner("carol");
    const g = grader("teacher");
    ok(
      await Grading.configureItem({
        item: i,
        label: "Score Validation",
        maxPoints: 25,
      }),
    );
    expect(
      await Grading.recordDraft({
        learner: l,
        item: i,
        grader: g,
        score: -1,
      }),
    ).toHaveProperty("error");
    expect(
      await Grading.recordDraft({
        learner: l,
        item: i,
        grader: g,
        score: 30,
      }),
    ).toHaveProperty("error");
    // valid score works
    const { grade } = ok(
      await Grading.recordDraft({
        learner: l,
        item: i,
        grader: g,
        score: 20,
      }),
    );
    expect(grade).toBeString();
  });
});
