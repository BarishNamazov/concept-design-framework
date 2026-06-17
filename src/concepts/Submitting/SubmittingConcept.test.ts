import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { setupTestDb } from "@utils/testing.ts";
import type { ID } from "@utils/types.ts";
import SubmittingConcept from "./SubmittingConcept.ts";

const mongo = await setupTestDb();
const Submitting = new SubmittingConcept(mongo.db);

afterAll(() => mongo.stop());

beforeEach(async () => {
  await mongo.db.collection("Submitting.submissions").deleteMany({});
});

/** Narrow a result union to its success branch, failing the test otherwise. */
function ok<T>(result: T | { error: string }): T {
  if (result && typeof result === "object" && "error" in result) {
    throw new Error(`Expected success but got error: ${result.error}`);
  }
  return result as T;
}

const assignment = (s: string) => s as ID;
const submitter = (s: string) => s as ID;
const artifact = (s: string) => s as ID;

describe("Submitting", () => {
  test("submit creates SUBMITTED submission with attempt number 1", async () => {
    const a = assignment("hw1");
    const s = submitter("alice");
    const { submission } = ok(
      await Submitting.submit({ assignment: a, submitter: s, artifacts: [artifact("a1")] }),
    );
    expect(submission).toBeString();
    const result = await Submitting._getSubmission({ submission });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      submission,
      assignment: a,
      submitter: s,
      number: 1,
      artifacts: [artifact("a1")],
      status: "SUBMITTED",
    });
    expect(result[0]!.submittedAt).toBeInstanceOf(Date);
  });

  test("submit increments attempt number for same (assignment, submitter)", async () => {
    const a = assignment("hw1");
    const s = submitter("alice");
    const first = ok(
      await Submitting.submit({ assignment: a, submitter: s, artifacts: [artifact("a1")] }),
    );
    const second = ok(
      await Submitting.submit({ assignment: a, submitter: s, artifacts: [artifact("a2")] }),
    );
    const r1 = await Submitting._getSubmission({ submission: first.submission });
    expect(r1[0]!.number).toBe(1);
    const r2 = await Submitting._getSubmission({ submission: second.submission });
    expect(r2[0]!.number).toBe(2);
  });

  test("submit creates unique submission IDs", async () => {
    const a = assignment("hw1");
    const s = submitter("alice");
    const first = ok(
      await Submitting.submit({ assignment: a, submitter: s, artifacts: [artifact("a1")] }),
    );
    const second = ok(
      await Submitting.submit({ assignment: a, submitter: s, artifacts: [artifact("a2")] }),
    );
    expect(first.submission).not.toBe(second.submission);
  });

  test("withdraw changes status to WITHDRAWN", async () => {
    const a = assignment("hw1");
    const s = submitter("alice");
    const { submission } = ok(
      await Submitting.submit({ assignment: a, submitter: s, artifacts: [artifact("a1")] }),
    );
    ok(await Submitting.withdraw({ submission }));
    const result = await Submitting._getSubmission({ submission });
    expect(result[0]!.status).toBe("WITHDRAWN");
  });

  test("restore changes WITHDRAWN back to SUBMITTED", async () => {
    const a = assignment("hw1");
    const s = submitter("alice");
    const { submission } = ok(
      await Submitting.submit({ assignment: a, submitter: s, artifacts: [artifact("a1")] }),
    );
    ok(await Submitting.withdraw({ submission }));
    ok(await Submitting.restore({ submission }));
    const result = await Submitting._getSubmission({ submission });
    expect(result[0]!.status).toBe("SUBMITTED");
  });

  test("withdraw fails on already WITHDRAWN submission", async () => {
    const a = assignment("hw1");
    const s = submitter("alice");
    const { submission } = ok(
      await Submitting.submit({ assignment: a, submitter: s, artifacts: [artifact("a1")] }),
    );
    ok(await Submitting.withdraw({ submission }));
    expect(await Submitting.withdraw({ submission })).toHaveProperty("error");
  });

  test("restore fails on already SUBMITTED submission", async () => {
    const a = assignment("hw1");
    const s = submitter("alice");
    const { submission } = ok(
      await Submitting.submit({ assignment: a, submitter: s, artifacts: [artifact("a1")] }),
    );
    expect(await Submitting.restore({ submission })).toHaveProperty("error");
  });

  test("restore fails on non-existent submission", async () => {
    expect(await Submitting.restore({ submission: "nonexistent" as ID })).toHaveProperty(
      "error",
    );
  });

  test("withdraw fails on non-existent submission", async () => {
    expect(await Submitting.withdraw({ submission: "nonexistent" as ID })).toHaveProperty(
      "error",
    );
  });

  test("submit requires at least one artifact", async () => {
    const a = assignment("hw1");
    const s = submitter("alice");
    expect(
      await Submitting.submit({ assignment: a, submitter: s, artifacts: [] }),
    ).toHaveProperty("error");
  });

  test("_getLatest returns most recent SUBMITTED attempt", async () => {
    const a = assignment("hw1");
    const s = submitter("alice");
    ok(await Submitting.submit({ assignment: a, submitter: s, artifacts: [artifact("a1")] }));
    const { submission: second } = ok(
      await Submitting.submit({ assignment: a, submitter: s, artifacts: [artifact("a2")] }),
    );
    const latest = await Submitting._getLatest({ assignment: a, submitter: s });
    expect(latest).toHaveLength(1);
    expect(latest[0]!.submission).toBe(second);
    expect(latest[0]!.number).toBe(2);
  });

  test("_getLatest ignores WITHDRAWN submissions", async () => {
    const a = assignment("hw1");
    const s = submitter("alice");
    const { submission: first } = ok(
      await Submitting.submit({ assignment: a, submitter: s, artifacts: [artifact("a1")] }),
    );
    ok(await Submitting.submit({ assignment: a, submitter: s, artifacts: [artifact("a2")] }));
    ok(await Submitting.withdraw({ submission: first }));
    const latest = await Submitting._getLatest({ assignment: a, submitter: s });
    expect(latest).toHaveLength(1);
    expect(latest[0]!.number).toBe(2);
  });

  test("_getAttempts returns all attempts sorted", async () => {
    const a = assignment("hw1");
    const s = submitter("alice");
    const { submission: first } = ok(
      await Submitting.submit({ assignment: a, submitter: s, artifacts: [artifact("a1")] }),
    );
    const { submission: second } = ok(
      await Submitting.submit({ assignment: a, submitter: s, artifacts: [artifact("a2")] }),
    );
    const { submission: third } = ok(
      await Submitting.submit({ assignment: a, submitter: s, artifacts: [artifact("a3")] }),
    );
    const attempts = await Submitting._getAttempts({ assignment: a, submitter: s });
    expect(attempts).toHaveLength(3);
    expect(attempts[0]!.submission).toBe(first);
    expect(attempts[0]!.number).toBe(1);
    expect(attempts[1]!.submission).toBe(second);
    expect(attempts[1]!.number).toBe(2);
    expect(attempts[2]!.submission).toBe(third);
    expect(attempts[2]!.number).toBe(3);
  });

  test("_hasSubmission returns true/false correctly", async () => {
    const a = assignment("hw1");
    const s = submitter("alice");
    expect(await Submitting._hasSubmission({ assignment: a, submitter: s })).toEqual([
      { submitted: false },
    ]);
    const { submission } = ok(
      await Submitting.submit({ assignment: a, submitter: s, artifacts: [artifact("a1")] }),
    );
    expect(await Submitting._hasSubmission({ assignment: a, submitter: s })).toEqual([
      { submitted: true },
    ]);
    ok(await Submitting.withdraw({ submission }));
    expect(await Submitting._hasSubmission({ assignment: a, submitter: s })).toEqual([
      { submitted: false },
    ]);
  });

  test("_hasSubmission returns false after withdrawal even with attempts", async () => {
    const a = assignment("hw1");
    const s = submitter("alice");
    const { submission } = ok(
      await Submitting.submit({ assignment: a, submitter: s, artifacts: [artifact("a1")] }),
    );
    ok(await Submitting.withdraw({ submission }));
    expect(await Submitting._hasSubmission({ assignment: a, submitter: s })).toEqual([
      { submitted: false },
    ]);
  });

  test("_getSubmissionsForAssignment filters by assignment", async () => {
    const a1 = assignment("hw1");
    const a2 = assignment("hw2");
    const s1 = submitter("alice");
    const s2 = submitter("bob");
    ok(await Submitting.submit({ assignment: a1, submitter: s1, artifacts: [artifact("a1")] }));
    ok(await Submitting.submit({ assignment: a1, submitter: s2, artifacts: [artifact("a2")] }));
    ok(await Submitting.submit({ assignment: a2, submitter: s1, artifacts: [artifact("a3")] }));
    const forA1 = await Submitting._getSubmissionsForAssignment({ assignment: a1 });
    expect(forA1).toHaveLength(2);
    expect(forA1.map((r) => r.submitter)).toContain(s1);
    expect(forA1.map((r) => r.submitter)).toContain(s2);
    const forA2 = await Submitting._getSubmissionsForAssignment({ assignment: a2 });
    expect(forA2).toHaveLength(1);
    expect(forA2[0]!.submitter).toBe(s1);
  });

  test("_getSubmissionsForSubmitter filters by submitter", async () => {
    const a1 = assignment("hw1");
    const a2 = assignment("hw2");
    const s1 = submitter("alice");
    const s2 = submitter("bob");
    ok(await Submitting.submit({ assignment: a1, submitter: s1, artifacts: [artifact("a1")] }));
    ok(await Submitting.submit({ assignment: a2, submitter: s1, artifacts: [artifact("a2")] }));
    ok(await Submitting.submit({ assignment: a1, submitter: s2, artifacts: [artifact("a3")] }));
    const forS1 = await Submitting._getSubmissionsForSubmitter({ submitter: s1 });
    expect(forS1).toHaveLength(2);
    expect(forS1.map((r) => r.assignment)).toContain(a1);
    expect(forS1.map((r) => r.assignment)).toContain(a2);
    const forS2 = await Submitting._getSubmissionsForSubmitter({ submitter: s2 });
    expect(forS2).toHaveLength(1);
    expect(forS2[0]!.assignment).toBe(a1);
  });

  test("_getSubmission returns full details", async () => {
    const a = assignment("hw1");
    const s = submitter("alice");
    const arts = [artifact("a1"), artifact("a2"), artifact("a3")];
    const { submission } = ok(
      await Submitting.submit({ assignment: a, submitter: s, artifacts: arts }),
    );
    const result = await Submitting._getSubmission({ submission });
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      submission,
      assignment: a,
      submitter: s,
      artifacts: arts,
      submittedAt: expect.any(Date),
      number: 1,
      status: "SUBMITTED",
    });
  });

  test("_getSubmission returns empty array for non-existent submission", async () => {
    const result = await Submitting._getSubmission({ submission: "nonexistent" as ID });
    expect(result).toEqual([]);
  });

  test("Multiple artifacts stored correctly", async () => {
    const a = assignment("hw1");
    const s = submitter("alice");
    const arts = [artifact("report.pdf"), artifact("code.zip"), artifact("screenshot.png")];
    const { submission } = ok(
      await Submitting.submit({ assignment: a, submitter: s, artifacts: arts }),
    );
    const result = await Submitting._getSubmission({ submission });
    expect(result[0]!.artifacts).toEqual(arts);
  });

  test("attempt numbers are independent across different assignments", async () => {
    const a1 = assignment("hw1");
    const a2 = assignment("hw2");
    const s = submitter("alice");
    ok(await Submitting.submit({ assignment: a1, submitter: s, artifacts: [artifact("a1")] }));
    ok(await Submitting.submit({ assignment: a1, submitter: s, artifacts: [artifact("a2")] }));
    const result = ok(
      await Submitting.submit({ assignment: a2, submitter: s, artifacts: [artifact("b1")] }),
    );
    const details = await Submitting._getSubmission({ submission: result.submission });
    expect(details[0]!.number).toBe(1);
  });

  test("attempt numbers are independent across different submitters", async () => {
    const a = assignment("hw1");
    const s1 = submitter("alice");
    const s2 = submitter("bob");
    ok(await Submitting.submit({ assignment: a, submitter: s1, artifacts: [artifact("a1")] }));
    ok(await Submitting.submit({ assignment: a, submitter: s1, artifacts: [artifact("a2")] }));
    const result = ok(
      await Submitting.submit({ assignment: a, submitter: s2, artifacts: [artifact("b1")] }),
    );
    const details = await Submitting._getSubmission({ submission: result.submission });
    expect(details[0]!.number).toBe(1);
  });

  test("namespaces isolate duplicate concept instances", async () => {
    const Drafts = new SubmittingConcept(mongo.db, "Drafts");
    const Finals = new SubmittingConcept(mongo.db, "Finals");

    const a = assignment("hw1");
    const s = submitter("alice");
    ok(await Drafts.submit({ assignment: a, submitter: s, artifacts: [artifact("draft")] }));
    ok(await Finals.submit({ assignment: a, submitter: s, artifacts: [artifact("final")] }));

    expect(await Drafts._hasSubmission({ assignment: a, submitter: s })).toEqual([
      { submitted: true },
    ]);
    expect(await Finals._hasSubmission({ assignment: a, submitter: s })).toEqual([
      { submitted: true },
    ]);
    expect(await Submitting._hasSubmission({ assignment: a, submitter: s })).toEqual([
      { submitted: false },
    ]);
  });
});
