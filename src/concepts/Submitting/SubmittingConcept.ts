import { collectionName, freshID } from "@utils/database.ts";
import type { ID } from "@utils/types.ts";
import type { Collection, Db } from "mongodb";

// Generic types of this concept.
type Submitter = ID;
type Assignment = ID;
type Artifact = ID;
type Submission = ID;

/**
 * a set of Submissions with
 *   an assignment Assignment
 *   a submitter Submitter
 *   a number number (auto-incrementing per assignment-submitter pair)
 *   artifacts Artifact[]
 *   a submittedAt DateTime
 *   a status "SUBMITTED" | "WITHDRAWN"
 *
 * Invariant: artifacts is non-empty for SUBMITTED submissions.
 * Invariant: attempt numbers auto-increment per (assignment, submitter).
 */
interface SubmissionDoc {
  _id: Submission;
  assignment: Assignment;
  submitter: Submitter;
  number: number;
  artifacts: Artifact[];
  submittedAt: Date;
  status: "SUBMITTED" | "WITHDRAWN";
}

/**
 * concept: Submitting [Submitting, Assignment, Submitter]
 *
 * purpose: manage submission attempts with numbered attempts, artifacts,
 * and history, allowing submissions to be withdrawn and restored.
 */
export default class SubmittingConcept {
  private readonly submissions: Collection<SubmissionDoc>;

  constructor(
    private readonly db: Db,
    namespace = "Submitting",
  ) {
    this.submissions = this.db.collection(
      collectionName(namespace, "submissions"),
    );
  }

  /**
   * submit (assignment: Assignment, submitter: Submitter, artifacts: Artifact[]): (submission: Submission)
   *
   * **requires** artifacts is non-empty
   *
   * **effects** creates a fresh Submission with status SUBMITTED, an
   * auto-incremented attempt number for the given (assignment, submitter) pair,
   * and `submittedAt` the current time; returns `submission`
   */
  async submit({
    assignment,
    submitter,
    artifacts,
    artifact,
  }: {
    assignment: Assignment;
    submitter: Submitter;
    artifacts?: Artifact[];
    artifact?: Artifact;
  }): Promise<{ submission: Submission } | { error: string }> {
    const resolved = artifact !== undefined ? [artifact] : (artifacts ?? []);
    if (resolved.length === 0) {
      return { error: "At least one artifact is required to submit." };
    }
    const latest = await this.submissions
      .find({ assignment, submitter })
      .sort({ number: -1 })
      .limit(1)
      .toArray();
    const number = latest.length > 0 ? latest[0]?.number + 1 : 1;
    const submission = freshID() as Submission;
    const submittedAt: Date = new Date();
    await this.submissions.insertOne({
      _id: submission,
      assignment,
      submitter,
      number,
      artifacts: resolved,
      submittedAt,
      status: "SUBMITTED",
    });
    return { submission };
  }

  /**
   * withdraw (submission: Submission): (submission: Submission)
   *
   * **requires** submission exists with status SUBMITTED
   *
   * **effects** sets the submission's status to WITHDRAWN; returns `submission`
   */
  async withdraw({
    submission,
  }: {
    submission: Submission;
  }): Promise<{ submission: Submission } | { error: string }> {
    const doc = await this.submissions.findOne({ _id: submission });
    if (doc === null) {
      return { error: "Submission not found." };
    }
    if (doc.status !== "SUBMITTED") {
      return { error: "Only SUBMITTED submissions can be withdrawn." };
    }
    await this.submissions.updateOne(
      { _id: submission },
      { $set: { status: "WITHDRAWN" } },
    );
    return { submission };
  }

  /**
   * restore (submission: Submission): (submission: Submission)
   *
   * **requires** submission exists with status WITHDRAWN
   *
   * **effects** sets the submission's status back to SUBMITTED; returns
   * `submission`
   */
  async restore({
    submission,
  }: {
    submission: Submission;
  }): Promise<{ submission: Submission } | { error: string }> {
    const doc = await this.submissions.findOne({ _id: submission });
    if (doc === null) {
      return { error: "Submission not found." };
    }
    if (doc.status !== "WITHDRAWN") {
      return { error: "Only WITHDRAWN submissions can be restored." };
    }
    await this.submissions.updateOne(
      { _id: submission },
      { $set: { status: "SUBMITTED" } },
    );
    return { submission };
  }

  /**
   * _getSubmission (submission: Submission): (submission: Submission, assignment: Assignment, submitter: Submitter, artifacts: Artifact[], submittedAt: DateTime, number: Number, status: String)
   *
   * **requires** true
   *
   * **effects** returns the full details of the given submission, or an empty
   * array if not found
   */
  async _getSubmission({ submission }: { submission: Submission }): Promise<
    {
      submission: Submission;
      assignment: Assignment;
      submitter: Submitter;
      artifacts: Artifact[];
      submittedAt: Date;
      number: number;
      status: string;
    }[]
  > {
    const doc = await this.submissions.findOne({ _id: submission });
    if (doc === null) return [];
    return [
      {
        submission: doc._id,
        assignment: doc.assignment,
        submitter: doc.submitter,
        artifacts: doc.artifacts,
        submittedAt: doc.submittedAt,
        number: doc.number,
        status: doc.status,
      },
    ];
  }

  /**
   * _getLatest (assignment: Assignment, submitter: Submitter): (submission: Submission, artifacts: Artifact[], submittedAt: DateTime, number: Number, status: String)
   *
   * **requires** true
   *
   * **effects** returns the most recent SUBMITTED attempt for the given
   * (assignment, submitter) pair, or an empty array if none exists
   */
  async _getLatest({
    assignment,
    submitter,
  }: {
    assignment: Assignment;
    submitter: Submitter;
  }): Promise<
    {
      submission: Submission;
      artifacts: Artifact[];
      submittedAt: Date;
      number: number;
      status: string;
    }[]
  > {
    const docs = await this.submissions
      .find({ assignment, submitter, status: "SUBMITTED" })
      .sort({ number: -1 })
      .limit(1)
      .toArray();
    return docs.map((d) => ({
      submission: d._id,
      artifacts: d.artifacts,
      submittedAt: d.submittedAt,
      number: d.number,
      status: d.status,
    }));
  }

  /**
   * _getAttempts (assignment: Assignment, submitter: Submitter): (submission: Submission, artifacts: Artifact[], submittedAt: DateTime, number: Number, status: String)
   *
   * **requires** true
   *
   * **effects** returns all attempts for the given (assignment, submitter) pair,
   * sorted by attempt number ascending (oldest first)
   */
  async _getAttempts({
    assignment,
    submitter,
  }: {
    assignment: Assignment;
    submitter: Submitter;
  }): Promise<
    {
      submission: Submission;
      artifacts: Artifact[];
      submittedAt: Date;
      number: number;
      status: string;
    }[]
  > {
    const docs = await this.submissions
      .find({ assignment, submitter })
      .sort({ number: 1 })
      .toArray();
    return docs.map((d) => ({
      submission: d._id,
      artifacts: d.artifacts,
      submittedAt: d.submittedAt,
      number: d.number,
      status: d.status,
    }));
  }

  /**
   * _getSubmissionsForAssignment (assignment: Assignment): (submitter: Submitter, submission: Submission, submittedAt: DateTime, number: Number, status: String)
   *
   * **requires** true
   *
   * **effects** returns all submissions for the given assignment, one per
   * submitter-submission pair
   */
  async _getSubmissionsForAssignment({
    assignment,
  }: {
    assignment: Assignment;
  }): Promise<
    {
      submitter: Submitter;
      submission: Submission;
      submittedAt: Date;
      number: number;
      status: string;
    }[]
  > {
    const docs = await this.submissions
      .find({ assignment })
      .sort({ submittedAt: 1 })
      .toArray();
    return docs.map((d) => ({
      submitter: d.submitter,
      submission: d._id,
      submittedAt: d.submittedAt,
      number: d.number,
      status: d.status,
    }));
  }

  /**
   * _getSubmissionsForSubmitter (submitter: Submitter): (assignment: Assignment, submission: Submission, submittedAt: DateTime, number: Number, status: String)
   *
   * **requires** true
   *
   * **effects** returns all submissions by the given submitter, one per
   * assignment-submission pair
   */
  async _getSubmissionsForSubmitter({
    submitter,
  }: {
    submitter: Submitter;
  }): Promise<
    {
      assignment: Assignment;
      submission: Submission;
      submittedAt: Date;
      number: number;
      status: string;
    }[]
  > {
    const docs = await this.submissions
      .find({ submitter })
      .sort({ submittedAt: 1 })
      .toArray();
    return docs.map((d) => ({
      assignment: d.assignment,
      submission: d._id,
      submittedAt: d.submittedAt,
      number: d.number,
      status: d.status,
    }));
  }

  /**
   * _hasSubmission (assignment: Assignment, submitter: Submitter): (submitted: Flag)
   *
   * **requires** true
   *
   * **effects** returns a single result whose `submitted` is true iff at least
   * one SUBMITTED submission exists for the given (assignment, submitter) pair
   */
  async _hasSubmission({
    assignment,
    submitter,
  }: {
    assignment: Assignment;
    submitter: Submitter;
  }): Promise<{ submitted: boolean }[]> {
    const doc = await this.submissions.findOne({
      assignment,
      submitter,
      status: "SUBMITTED",
    });
    return [{ submitted: doc !== null }];
  }
}
