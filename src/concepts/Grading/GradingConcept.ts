import { collectionName, freshID } from "@utils/database.ts";
import type { ID } from "@utils/types.ts";
import type { Collection, Db } from "mongodb";

type Grader = ID;
type Learner = ID;
type Item = ID;
type Evidence = ID;
type Criterion = ID;
type GradeRecord = ID;
type CriterionScore = ID;

/**
 * a set of configured GradeItems with
 *   an item Item
 *   a label string
 *   a maxPoints number
 *   a status "ACTIVE" | "ARCHIVED"
 *
 * Invariant: at most one ACTIVE GradeItem per item.
 */
interface GradeItemDoc {
  _id: Item;
  item: Item;
  label: string;
  maxPoints: number;
  status: "ACTIVE" | "ARCHIVED";
}

/**
 * a set of Criteria belonging to a GradeItem with
 *   an item Item
 *   a name string
 *   a maxPoints number
 *   a position number
 */
interface CriterionDoc {
  _id: Criterion;
  item: Item;
  name: string;
  maxPoints: number;
  position: number;
}

/**
 * a set of GradeRecords with
 *   a learner Learner
 *   an item Item
 *   an optional evidence Evidence
 *   a grader Grader
 *   a score number
 *   a feedback string
 *   a status "DRAFT" | "RELEASED" | "EXCUSED"
 *   an updatedAt DateTime
 *   an optional releasedAt DateTime
 *
 * Invariants:
 *   - At most one GradeRecord per (learner, item)
 *   - Non-excused score is between 0 and the GradeItem's maxPoints
 */
interface GradeRecordDoc {
  _id: GradeRecord;
  learner: Learner;
  item: Item;
  evidence?: Evidence;
  grader: Grader;
  score: number;
  feedback: string;
  status: "DRAFT" | "RELEASED" | "EXCUSED";
  updatedAt: Date;
  releasedAt?: Date;
}

/**
 * a set of CriterionScores with
 *   a record GradeRecord
 *   a criterion Criterion
 *   a points number
 *   a feedback string
 *
 * Invariant: criterion points are between 0 and the criterion's maxPoints.
 */
interface CriterionScoreDoc {
  _id: CriterionScore;
  record: GradeRecord;
  criterion: Criterion;
  points: number;
  feedback: string;
}

/**
 * concept: Grading [Item, Learner, Grader]
 *
 * purpose: manage grade items, criteria, draft/released/excused grades with
 * scores and feedback so educators can assess learner work and learners can
 * review their results.
 */
export default class GradingConcept {
  private readonly gradeItems: Collection<GradeItemDoc>;
  private readonly criteria: Collection<CriterionDoc>;
  private readonly gradeRecords: Collection<GradeRecordDoc>;
  private readonly criterionScores: Collection<CriterionScoreDoc>;

  constructor(
    private readonly db: Db,
    namespace = "Grading",
  ) {
    this.gradeItems = this.db.collection(
      collectionName(namespace, "gradeItems"),
    );
    this.criteria = this.db.collection(collectionName(namespace, "criteria"));
    this.gradeRecords = this.db.collection(
      collectionName(namespace, "gradeRecords"),
    );
    this.criterionScores = this.db.collection(
      collectionName(namespace, "criterionScores"),
    );
  }

  /**
   * configureItem (item: Item, label: String, maxPoints: Number):
   *   (gradeItem: Item) | (error: String)
   *
   * **effects** upserts an ACTIVE GradeItem for the given `item` with the given
   * `label` and `maxPoints` (defaults to 100); returns the GradeItem id as
   * `gradeItem`
   */
  async configureItem({
    item,
    label,
    maxPoints = 100,
  }: {
    item: Item;
    label: string;
    maxPoints?: number;
  }): Promise<{ gradeItem: Item } | { error: string }> {
    if (maxPoints < 0) {
      return { error: "maxPoints must be non-negative." };
    }
    const existing = await this.gradeItems.findOne({ item, status: "ACTIVE" });
    if (existing !== null) {
      await this.gradeItems.updateOne(
        { _id: existing._id },
        { $set: { label, maxPoints } },
      );
      return { gradeItem: existing._id };
    }
    const gradeItem = freshID() as Item;
    await this.gradeItems.insertOne({
      _id: gradeItem,
      item,
      label,
      maxPoints,
      status: "ACTIVE",
    });
    return { gradeItem };
  }

  /**
   * archiveItem (item: Item): (gradeItem: Item) | (error: String)
   *
   * **requires** an ACTIVE GradeItem exists for the given `item`
   *
   * **effects** sets its status to "ARCHIVED"; returns the GradeItem id as
   * `gradeItem`
   */
  async archiveItem({
    item,
  }: {
    item: Item;
  }): Promise<{ gradeItem: Item } | { error: string }> {
    const existing = await this.gradeItems.findOne({ item, status: "ACTIVE" });
    if (existing === null) {
      return { error: "No active grade item found for this item." };
    }
    await this.gradeItems.updateOne(
      { _id: existing._id },
      { $set: { status: "ARCHIVED" } },
    );
    return { gradeItem: existing._id };
  }

  /**
   * addCriterion (item: Item, name: String, maxPoints: Number, position: Number):
   *   (criterion: Criterion) | (error: String)
   *
   * **requires** an ACTIVE GradeItem exists for the given `item`
   *
   * **effects** creates a fresh Criterion with the given fields; returns the
   * Criterion id as `criterion`
   */
  async addCriterion({
    item,
    name,
    maxPoints,
    position,
  }: {
    item: Item;
    name: string;
    maxPoints: number;
    position: number;
  }): Promise<{ criterion: Criterion } | { error: string }> {
    const gradeItem = await this.gradeItems.findOne({ item, status: "ACTIVE" });
    if (gradeItem === null) {
      return { error: "No active grade item found for this item." };
    }
    const criterion = freshID() as Criterion;
    await this.criteria.insertOne({
      _id: criterion,
      item,
      name,
      maxPoints,
      position,
    });
    return { criterion };
  }

  /**
   * reviseCriterion (criterion: Criterion, name: String, maxPoints: Number,
   *   position: Number): (criterion: Criterion) | (error: String)
   *
   * **requires** a Criterion with the given id exists
   *
   * **effects** updates the Criterion's fields to the given values; returns the
   * Criterion id as `criterion`
   */
  async reviseCriterion({
    criterion,
    name,
    maxPoints,
    position,
  }: {
    criterion: Criterion;
    name: string;
    maxPoints: number;
    position: number;
  }): Promise<{ criterion: Criterion } | { error: string }> {
    const existing = await this.criteria.findOne({ _id: criterion });
    if (existing === null) {
      return { error: "Criterion not found." };
    }
    await this.criteria.updateOne(
      { _id: criterion },
      { $set: { name, maxPoints, position } },
    );
    return { criterion };
  }

  /**
   * removeCriterion (criterion: Criterion): (criterion: Criterion) | (error: String)
   *
   * **requires** a Criterion with the given id exists
   *
   * **effects** removes the Criterion from the state; returns the Criterion id
   * as `criterion`
   */
  async removeCriterion({
    criterion,
  }: {
    criterion: Criterion;
  }): Promise<{ criterion: Criterion } | { error: string }> {
    const existing = await this.criteria.findOne({ _id: criterion });
    if (existing === null) {
      return { error: "Criterion not found." };
    }
    await this.criteria.deleteOne({ _id: criterion });
    return { criterion };
  }

  /**
   * recordDraft (learner: Learner, item: Item, evidence?: Evidence,
   *   grader: Grader, score: Number, feedback: String):
   *   (grade: GradeRecord) | (error: String)
   *
   * **requires** the grade is not already RELEASED or EXCUSED
   *
   * **effects** upserts a DRAFT GradeRecord for the given (`learner`, `item`)
   * pair with the provided fields; `score` defaults to 0; returns the
   * GradeRecord id as `grade`
   */
  async recordDraft({
    learner,
    item,
    evidence,
    grader,
    score = 0,
    feedback = "",
  }: {
    learner: Learner;
    item: Item;
    evidence?: Evidence;
    grader: Grader;
    score?: number;
    feedback?: string;
  }): Promise<{ grade: GradeRecord } | { error: string }> {
    const gradeItem = await this.gradeItems.findOne({ item, status: "ACTIVE" });
    if (gradeItem === null) {
      return { error: "No active grade item found for this item." };
    }
    if (score < 0 || score > gradeItem.maxPoints) {
      return { error: `Score must be between 0 and ${gradeItem.maxPoints}.` };
    }
    const existing = await this.gradeRecords.findOne({ learner, item });
    if (existing !== null) {
      if (existing.status === "RELEASED") {
        return {
          error: "Grade has already been released and cannot be modified.",
        };
      }
      if (existing.status === "EXCUSED") {
        return { error: "Learner has been excused from this item." };
      }
      await this.gradeRecords.updateOne(
        { _id: existing._id },
        { $set: { evidence, grader, score, feedback, updatedAt: new Date() } },
      );
      return { grade: existing._id };
    }
    const grade = freshID() as GradeRecord;
    await this.gradeRecords.insertOne({
      _id: grade,
      learner,
      item,
      evidence,
      grader,
      score,
      feedback,
      status: "DRAFT",
      updatedAt: new Date(),
    });
    return { grade };
  }

  /**
   * scoreCriterion (learner: Learner, item: Item, criterion: Criterion,
   *   grader: Grader, points: Number, feedback: String):
   *   (criterionScore: CriterionScore) | (error: String)
   *
   * **requires** a GradeRecord exists for the given (`learner`, `item`) and the
   * given `criterion` belongs to the same item
   *
   * **effects** upserts a CriterionScore for the (record, criterion) pair with
   * the given `points` and `feedback`; returns the CriterionScore id as
   * `criterionScore`
   */
  async scoreCriterion({
    learner,
    item,
    criterion,
    grader: _grader,
    points,
    feedback = "",
  }: {
    learner: Learner;
    item: Item;
    criterion: Criterion;
    grader: Grader;
    points: number;
    feedback?: string;
  }): Promise<{ criterionScore: CriterionScore } | { error: string }> {
    const record = await this.gradeRecords.findOne({ learner, item });
    if (record === null) {
      return { error: "No grade record found for this learner and item." };
    }
    const crit = await this.criteria.findOne({ _id: criterion });
    if (crit === null) {
      return { error: "Criterion not found." };
    }
    if (points < 0 || points > crit.maxPoints) {
      return { error: `Points must be between 0 and ${crit.maxPoints}.` };
    }
    const existing = await this.criterionScores.findOne({
      record: record._id,
      criterion,
    });
    if (existing !== null) {
      await this.criterionScores.updateOne(
        { _id: existing._id },
        { $set: { points, feedback } },
      );
      return { criterionScore: existing._id };
    }
    const csId = freshID() as CriterionScore;
    await this.criterionScores.insertOne({
      _id: csId,
      record: record._id,
      criterion,
      points,
      feedback,
    });
    return { criterionScore: csId };
  }

  /**
   * release (learner: Learner, item: Item): (grade: GradeRecord) | (error: String)
   *
   * **requires** a DRAFT GradeRecord exists for the given (`learner`, `item`)
   *
   * **effects** sets its status to "RELEASED" and records `releasedAt` to the
   * current time; returns the GradeRecord id as `grade`
   */
  async release({
    learner,
    item,
  }: {
    learner: Learner;
    item: Item;
  }): Promise<{ grade: GradeRecord } | { error: string }> {
    const record = await this.gradeRecords.findOne({
      learner,
      item,
      status: "DRAFT",
    });
    if (record === null) {
      return { error: "No draft grade found for this learner and item." };
    }
    await this.gradeRecords.updateOne(
      { _id: record._id },
      {
        $set: {
          status: "RELEASED",
          releasedAt: new Date(),
          updatedAt: new Date(),
        },
      },
    );
    return { grade: record._id };
  }

  /**
   * retract (learner: Learner, item: Item): (grade: GradeRecord) | (error: String)
   *
   * **requires** a RELEASED GradeRecord exists for the given (`learner`, `item`)
   *
   * **effects** sets its status back to "DRAFT" and clears `releasedAt`; returns
   * the GradeRecord id as `grade`
   */
  async retract({
    learner,
    item,
  }: {
    learner: Learner;
    item: Item;
  }): Promise<{ grade: GradeRecord } | { error: string }> {
    const record = await this.gradeRecords.findOne({
      learner,
      item,
      status: "RELEASED",
    });
    if (record === null) {
      return { error: "No released grade found for this learner and item." };
    }
    await this.gradeRecords.updateOne(
      { _id: record._id },
      {
        $set: { status: "DRAFT", updatedAt: new Date() },
        $unset: { releasedAt: "" },
      },
    );
    return { grade: record._id };
  }

  /**
   * excuse (learner: Learner, item: Item, grader: Grader, feedback: String):
   *   (grade: GradeRecord) | (error: String)
   *
   * **requires** a GradeRecord exists for the given (`learner`, `item`)
   *
   * **effects** sets its status to "EXCUSED", score to 0, and updates `grader`
   * and `feedback`; returns the GradeRecord id as `grade`
   */
  async excuse({
    learner,
    item,
    grader,
    feedback = "",
  }: {
    learner: Learner;
    item: Item;
    grader: Grader;
    feedback?: string;
  }): Promise<{ grade: GradeRecord } | { error: string }> {
    const record = await this.gradeRecords.findOne({ learner, item });
    if (record === null) {
      return { error: "No grade record found for this learner and item." };
    }
    await this.gradeRecords.updateOne(
      { _id: record._id },
      {
        $set: {
          status: "EXCUSED",
          score: 0,
          grader,
          feedback,
          updatedAt: new Date(),
        },
        $unset: { releasedAt: "" },
      },
    );
    return { grade: record._id };
  }

  /* ------------------------------------------------------------------ */
  /*  Queries                                                            */
  /* ------------------------------------------------------------------ */

  /**
   * _getItem (item: Item): (item: {item: Item, label: String, maxPoints: Number,
   *   status: String})
   *
   * **effects** returns every GradeItem for the given `item`, each with its
   * item, label, maxPoints and status
   */
  async _getItem({
    item,
  }: {
    item: Item;
  }): Promise<
    { item: Item; label: string; maxPoints: number; status: string }[]
  > {
    const docs = await this.gradeItems.find({ item }).toArray();
    return docs.map((d) => ({
      item: d.item,
      label: d.label,
      maxPoints: d.maxPoints,
      status: d.status,
    }));
  }

  /**
   * _getCriteria (item: Item): (criterion: {criterion: Criterion, name: String,
   *   maxPoints: Number, position: Number})
   *
   * **effects** returns every Criterion for the given `item`, each with its
   * criterion id, name, maxPoints and position, ordered by position ascending
   */
  async _getCriteria({ item }: { item: Item }): Promise<
    {
      criterion: Criterion;
      name: string;
      maxPoints: number;
      position: number;
    }[]
  > {
    const docs = await this.criteria
      .find({ item })
      .sort({ position: 1 })
      .toArray();
    return docs.map((d) => ({
      criterion: d._id,
      name: d.name,
      maxPoints: d.maxPoints,
      position: d.position,
    }));
  }

  /**
   * _getGrade (learner: Learner, item: Item):
   *   (grade: {grade: GradeRecord, learner: Learner, item: Item,
   *     evidence?: Evidence, grader: Grader, score: Number, feedback: String,
   *     status: String, updatedAt: DateTime, releasedAt?: DateTime})
   *
   * **effects** returns every GradeRecord for the given (`learner`, `item`) pair
   * regardless of status
   */
  async _getGrade({ learner, item }: { learner: Learner; item: Item }): Promise<
    {
      grade: GradeRecord;
      learner: Learner;
      item: Item;
      evidence?: Evidence;
      grader: Grader;
      score: number;
      feedback: string;
      status: string;
      updatedAt: Date;
      releasedAt?: Date;
    }[]
  > {
    const docs = await this.gradeRecords.find({ learner, item }).toArray();
    return docs.map((d) => ({
      grade: d._id,
      learner: d.learner,
      item: d.item,
      evidence: d.evidence,
      grader: d.grader,
      score: d.score,
      feedback: d.feedback,
      status: d.status,
      updatedAt: d.updatedAt,
      releasedAt: d.releasedAt,
    }));
  }

  /**
   * _getReleasedGrade (learner: Learner, item: Item):
   *   (grade: {grade: GradeRecord, learner: Learner, item: Item,
   *     evidence?: Evidence, grader: Grader, score: Number, feedback: String,
   *     status: String, updatedAt: DateTime, releasedAt?: DateTime})
   *
   * **effects** returns every GradeRecord for the given (`learner`, `item`) pair
   * whose status is RELEASED or EXCUSED
   */
  async _getReleasedGrade({
    learner,
    item,
  }: {
    learner: Learner;
    item: Item;
  }): Promise<
    {
      grade: GradeRecord;
      learner: Learner;
      item: Item;
      evidence?: Evidence;
      grader: Grader;
      score: number;
      feedback: string;
      status: string;
      updatedAt: Date;
      releasedAt?: Date;
    }[]
  > {
    const docs = await this.gradeRecords
      .find({ learner, item, status: { $in: ["RELEASED", "EXCUSED"] } })
      .toArray();
    return docs.map((d) => ({
      grade: d._id,
      learner: d.learner,
      item: d.item,
      evidence: d.evidence,
      grader: d.grader,
      score: d.score,
      feedback: d.feedback,
      status: d.status,
      updatedAt: d.updatedAt,
      releasedAt: d.releasedAt,
    }));
  }

  /**
   * _getCriterionScores (learner: Learner, item: Item):
   *   (criterion: {criterion: Criterion, points: Number, feedback: String})
   *
   * **effects** returns every CriterionScore for the GradeRecord of the given
   * (`learner`, `item`) pair, each with its criterion, points and feedback
   */
  async _getCriterionScores({
    learner,
    item,
  }: {
    learner: Learner;
    item: Item;
  }): Promise<{ criterion: Criterion; points: number; feedback: string }[]> {
    const record = await this.gradeRecords.findOne({ learner, item });
    if (record === null) return [];
    const docs = await this.criterionScores
      .find({ record: record._id })
      .toArray();
    return docs.map((d) => ({
      criterion: d.criterion,
      points: d.points,
      feedback: d.feedback,
    }));
  }

  /**
   * _getGradesForLearner (learner: Learner):
   *   (grade: {item: Item, grade: GradeRecord, score: Number, maxPoints: Number,
   *     status: String, label: String})
   *
   * **effects** returns every GradeRecord for the given `learner`, each with its
   * item, grade id, score, maxPoints, status and label (from the active
   * GradeItem)
   */
  async _getGradesForLearner({ learner }: { learner: Learner }): Promise<
    {
      item: Item;
      grade: GradeRecord;
      score: number;
      maxPoints: number;
      status: string;
      label: string;
    }[]
  > {
    const records = await this.gradeRecords.find({ learner }).toArray();
    const results: {
      item: Item;
      grade: GradeRecord;
      score: number;
      maxPoints: number;
      status: string;
      label: string;
    }[] = [];
    for (const r of records) {
      const gi = await this.gradeItems.findOne({
        item: r.item,
        status: "ACTIVE",
      });
      results.push({
        item: r.item,
        grade: r._id,
        score: r.score,
        maxPoints: gi?.maxPoints ?? 0,
        status: r.status,
        label: gi?.label ?? "",
      });
    }
    return results;
  }

  /**
   * _getGradesForItem (item: Item):
   *   (grade: {learner: Learner, grade: GradeRecord, score: Number, status: String})
   *
   * **effects** returns every GradeRecord for the given `item`, each with its
   * learner, grade id, score and status
   */
  async _getGradesForItem({
    item,
  }: {
    item: Item;
  }): Promise<
    { learner: Learner; grade: GradeRecord; score: number; status: string }[]
  > {
    const records = await this.gradeRecords.find({ item }).toArray();
    return records.map((r) => ({
      learner: r.learner,
      grade: r._id,
      score: r.score,
      status: r.status,
    }));
  }

  /**
   * _getDraftsForItem (item: Item):
   *   (draft: {learner: Learner, grade: GradeRecord})
   *
   * **effects** returns every DRAFT GradeRecord for the given `item`, each with
   * its learner and grade id
   */
  async _getDraftsForItem({
    item,
  }: {
    item: Item;
  }): Promise<{ learner: Learner; grade: GradeRecord }[]> {
    const records = await this.gradeRecords
      .find({ item, status: "DRAFT" })
      .toArray();
    return records.map((r) => ({ learner: r.learner, grade: r._id }));
  }
}
