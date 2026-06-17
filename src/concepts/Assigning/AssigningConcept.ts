import { collectionName, freshID } from "@utils/database.ts";
import type { ID } from "@utils/types.ts";
import type { Collection, Db } from "mongodb";

// Generic types of this concept.
type Author = ID;
type Assignee = ID;
type Audience = ID;
type Assignment = ID;
type Release = ID;

/**
 * a set of Assignments with
 *   an author Author
 *   a title String
 *   instructions String
 *   a kind "HOMEWORK" | "PROJECT" | "READING" | "RECITATION" | "ADMIN"
 *   an availableAt Date
 *   a dueAt Date
 *   an optional closeAt Date
 *   acceptsSubmissions Boolean
 *   an audience "EVERYONE" | "TARGETS"
 *   targets set of ID
 *   a status "DRAFT" | "PUBLISHED" | "ARCHIVED"
 *   a createdAt Date
 *   an optional updatedAt Date
 *
 * Invariants:
 *   - targets empty when audience is EVERYONE
 *   - targets non-empty when audience is TARGETS
 */
interface AssignmentDoc {
  _id: Assignment;
  author: Author;
  title: string;
  instructions: string;
  kind: "HOMEWORK" | "PROJECT" | "READING" | "RECITATION" | "ADMIN";
  availableAt: Date;
  dueAt: Date;
  closeAt?: Date;
  acceptsSubmissions: boolean;
  audience: "EVERYONE" | "TARGETS";
  targets: ID[];
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  createdAt: Date;
  updatedAt?: Date;
}

/**
 * a set of Releases with
 *   an assignment Assignment
 *   an assignee Assignee
 *   an assignedAt Date
 *   an optional dueOverride Date
 *   a status "ASSIGNED" | "WITHDRAWN"
 *
 * Invariants:
 *   - at most one Release per (assignment, assignee)
 *   - Release only for PUBLISHED assignments
 */
interface ReleaseDoc {
  _id: Release;
  assignment: Assignment;
  assignee: Assignee;
  assignedAt: Date;
  dueOverride?: Date;
  status: "ASSIGNED" | "WITHDRAWN";
}

type AssignmentKind =
  | "HOMEWORK"
  | "PROJECT"
  | "READING"
  | "RECITATION"
  | "ADMIN";

/**
 * concept: Assigning [Author, Assignee, Audience]
 *
 * purpose: manage assignment lifecycle, audiences (everyone/section-targeted),
 * per-student releases, and due overrides.
 */
export default class AssigningConcept {
  private readonly assignments: Collection<AssignmentDoc>;
  private readonly releases: Collection<ReleaseDoc>;

  constructor(
    private readonly db: Db,
    namespace = "Assigning",
  ) {
    this.assignments = this.db.collection(
      collectionName(namespace, "assignments"),
    );
    this.releases = this.db.collection(collectionName(namespace, "releases"));
  }

  /**
   * createDraft ({ author, title, instructions, kind, availableAt, dueAt,
   * closeAt?, acceptsSubmissions, audience, targets? }): (assignment: Assignment)
   *
   * **requires** if audience is EVERYONE then targets is empty (or omitted);
   * if audience is TARGETS then targets is non-empty
   *
   * **effects** creates a fresh Assignment in DRAFT status with the given
   * fields; returns the assignment id
   */
  async createDraft({
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
  }: {
    author: Author;
    title: string;
    instructions: string;
    kind: AssignmentKind;
    availableAt: Date;
    dueAt: Date;
    closeAt?: Date;
    acceptsSubmissions: boolean;
    audience: "EVERYONE" | "TARGETS";
    targets?: ID[];
  }): Promise<{ assignment: Assignment } | { error: string }> {
    const resolvedTargets = targets ?? [];
    if (audience === "EVERYONE" && resolvedTargets.length > 0) {
      return {
        error: "Audience EVERYONE must not have targets.",
      };
    }
    if (audience === "TARGETS" && resolvedTargets.length === 0) {
      return {
        error: "Audience TARGETS must have at least one target.",
      };
    }
    const assignment = freshID() as Assignment;
    const now = new Date();
    await this.assignments.insertOne({
      _id: assignment,
      author,
      title,
      instructions,
      kind,
      availableAt,
      dueAt,
      closeAt,
      acceptsSubmissions,
      audience,
      targets: resolvedTargets,
      status: "DRAFT",
      createdAt: now,
    });
    return { assignment };
  }

  /**
   * revise ({ assignment, title, instructions, kind, availableAt, dueAt,
   * closeAt?, acceptsSubmissions, audience, targets? }): (assignment: Assignment)
   *
   * **requires** assignment exists and is in DRAFT or PUBLISHED status
   *
   * **effects** updates the assignment fields (except author, status, createdAt);
   * sets updatedAt to now; returns the assignment id
   */
  async revise({
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
  }: {
    assignment: Assignment;
    title: string;
    instructions: string;
    kind: AssignmentKind;
    availableAt: Date;
    dueAt: Date;
    closeAt?: Date;
    acceptsSubmissions: boolean;
    audience: "EVERYONE" | "TARGETS";
    targets?: ID[];
  }): Promise<{ assignment: Assignment } | { error: string }> {
    const doc = await this.assignments.findOne({ _id: assignment });
    if (doc === null) {
      return { error: "Assignment not found." };
    }
    if (doc.status !== "DRAFT" && doc.status !== "PUBLISHED") {
      return { error: "Only DRAFT or PUBLISHED assignments can be revised." };
    }
    const resolvedTargets = targets ?? [];
    if (audience === "EVERYONE" && resolvedTargets.length > 0) {
      return {
        error: "Audience EVERYONE must not have targets.",
      };
    }
    if (audience === "TARGETS" && resolvedTargets.length === 0) {
      return {
        error: "Audience TARGETS must have at least one target.",
      };
    }
    const now = new Date();
    await this.assignments.updateOne(
      { _id: assignment },
      {
        $set: {
          title,
          instructions,
          kind,
          availableAt,
          dueAt,
          closeAt,
          acceptsSubmissions,
          audience,
          targets: resolvedTargets,
          updatedAt: now,
        },
      },
    );
    return { assignment };
  }

  /**
   * publish ({ assignment }): (assignment: Assignment)
   *
   * **requires** assignment exists and is in DRAFT status
   *
   * **effects** transitions the assignment to PUBLISHED status; sets updatedAt
   * to now; returns the assignment id
   */
  async publish({
    assignment,
  }: {
    assignment: Assignment;
  }): Promise<{ assignment: Assignment } | { error: string }> {
    const doc = await this.assignments.findOne({ _id: assignment });
    if (doc === null) {
      return { error: "Assignment not found." };
    }
    if (doc.status !== "DRAFT") {
      return { error: "Only DRAFT assignments can be published." };
    }
    const now = new Date();
    await this.assignments.updateOne(
      { _id: assignment },
      { $set: { status: "PUBLISHED", updatedAt: now } },
    );
    return { assignment };
  }

  /**
   * archive ({ assignment }): (assignment: Assignment)
   *
   * **requires** assignment exists
   *
   * **effects** transitions the assignment to ARCHIVED status; sets updatedAt
   * to now; returns the assignment id
   */
  async archive({
    assignment,
  }: {
    assignment: Assignment;
  }): Promise<{ assignment: Assignment } | { error: string }> {
    const doc = await this.assignments.findOne({ _id: assignment });
    if (doc === null) {
      return { error: "Assignment not found." };
    }
    const now = new Date();
    await this.assignments.updateOne(
      { _id: assignment },
      { $set: { status: "ARCHIVED", updatedAt: now } },
    );
    return { assignment };
  }

  /**
   * assign ({ assignment, assignee }): (release: Release)
   *
   * **requires** the assignment exists and is PUBLISHED; no release exists for
   * this (assignment, assignee) pair with status ASSIGNED
   *
   * **effects** creates a fresh Release in ASSIGNED status for the given
   * assignment and assignee; returns the release id
   */
  async assign({
    assignment,
    assignee,
  }: {
    assignment: Assignment;
    assignee: Assignee;
  }): Promise<{ release: Release } | { error: string }> {
    const doc = await this.assignments.findOne({ _id: assignment });
    if (doc === null) {
      return { error: "Assignment not found." };
    }
    if (doc.status !== "PUBLISHED") {
      return { error: "Only PUBLISHED assignments can be assigned." };
    }
    const existing = await this.releases.findOne({
      assignment,
      assignee,
      status: "ASSIGNED",
    });
    if (existing !== null) {
      return {
        error: "A release already exists for this assignment and assignee.",
      };
    }
    const release = freshID() as Release;
    await this.releases.insertOne({
      _id: release,
      assignment,
      assignee,
      assignedAt: new Date(),
      status: "ASSIGNED",
    });
    return { release };
  }

  /**
   * withdraw ({ assignment, assignee }): (release: Release)
   *
   * **requires** a Release exists for this (assignment, assignee) pair with
   * status ASSIGNED
   *
   * **effects** transitions that Release to WITHDRAWN status; returns the
   * release id
   */
  async withdraw({
    assignment,
    assignee,
  }: {
    assignment: Assignment;
    assignee: Assignee;
  }): Promise<{ release: Release } | { error: string }> {
    const existing = await this.releases.findOne({
      assignment,
      assignee,
      status: "ASSIGNED",
    });
    if (existing === null) {
      return { error: "No active release to withdraw." };
    }
    await this.releases.updateOne(
      { _id: existing._id },
      { $set: { status: "WITHDRAWN" } },
    );
    return { release: existing._id };
  }

  /**
   * setDueOverride ({ assignment, assignee, dueAt }): (release: Release)
   *
   * **requires** a Release exists for this (assignment, assignee) pair with
   * status ASSIGNED
   *
   * **effects** sets the dueOverride on that Release to the given dueAt;
   * returns the release id
   */
  async setDueOverride({
    assignment,
    assignee,
    dueAt,
  }: {
    assignment: Assignment;
    assignee: Assignee;
    dueAt: Date;
  }): Promise<{ release: Release } | { error: string }> {
    const existing = await this.releases.findOne({
      assignment,
      assignee,
      status: "ASSIGNED",
    });
    if (existing === null) {
      return { error: "No active release found." };
    }
    await this.releases.updateOne(
      { _id: existing._id },
      { $set: { dueOverride: dueAt } },
    );
    return { release: existing._id };
  }

  /**
   * clearDueOverride ({ assignment, assignee }): (release: Release)
   *
   * **requires** a Release exists for this (assignment, assignee) pair with
   * status ASSIGNED
   *
   * **effects** removes the dueOverride from that Release; returns the release
   * id
   */
  async clearDueOverride({
    assignment,
    assignee,
  }: {
    assignment: Assignment;
    assignee: Assignee;
  }): Promise<{ release: Release } | { error: string }> {
    const existing = await this.releases.findOne({
      assignment,
      assignee,
      status: "ASSIGNED",
    });
    if (existing === null) {
      return { error: "No active release found." };
    }
    await this.releases.updateOne(
      { _id: existing._id },
      { $unset: { dueOverride: "" } },
    );
    return { release: existing._id };
  }

  /**
   * _getAssignment ({ assignment }): (assignment, author, title, instructions,
   * kind, availableAt, dueAt, closeAt, acceptsSubmissions, audience, targets,
   * status, createdAt, updatedAt)
   *
   * **requires** true
   *
   * **effects** returns the full details of the given assignment
   */
  async _getAssignment({ assignment }: { assignment: Assignment }): Promise<
    {
      assignment: Assignment;
      author: Author;
      title: string;
      instructions: string;
      kind: AssignmentKind;
      availableAt: Date;
      dueAt: Date;
      closeAt?: Date;
      acceptsSubmissions: boolean;
      audience: "EVERYONE" | "TARGETS";
      targets: ID[];
      status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
      createdAt: Date;
      updatedAt?: Date;
    }[]
  > {
    const doc = await this.assignments.findOne({ _id: assignment });
    if (doc === null) {
      return [];
    }
    return [
      {
        assignment: doc._id,
        author: doc.author,
        title: doc.title,
        instructions: doc.instructions,
        kind: doc.kind,
        availableAt: doc.availableAt,
        dueAt: doc.dueAt,
        closeAt: doc.closeAt,
        acceptsSubmissions: doc.acceptsSubmissions,
        audience: doc.audience,
        targets: doc.targets,
        status: doc.status,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      },
    ];
  }

  /**
   * _getRelease ({ assignment, assignee }): (release, assignment, assignee,
   * assignedAt, dueOverride, status)
   *
   * **requires** true
   *
   * **effects** returns the release details for the given assignment and
   * assignee
   */
  async _getRelease({
    assignment,
    assignee,
  }: {
    assignment: Assignment;
    assignee: Assignee;
  }): Promise<
    {
      release: Release;
      assignment: Assignment;
      assignee: Assignee;
      assignedAt: Date;
      dueOverride?: Date;
      status: "ASSIGNED" | "WITHDRAWN";
    }[]
  > {
    const doc = await this.releases.findOne({ assignment, assignee });
    if (doc === null) {
      return [];
    }
    return [
      {
        release: doc._id,
        assignment: doc.assignment,
        assignee: doc.assignee,
        assignedAt: doc.assignedAt,
        dueOverride: doc.dueOverride,
        status: doc.status,
      },
    ];
  }

  /**
   * _getAssignees ({ assignment }): (assignee: Assignee)
   *
   * **requires** true
   *
   * **effects** returns every assignee with an ASSIGNED release for the given
   * assignment
   */
  async _getAssignees({
    assignment,
  }: {
    assignment: Assignment;
  }): Promise<{ assignee: Assignee }[]> {
    const docs = await this.releases
      .find({ assignment, status: "ASSIGNED" })
      .toArray();
    return docs.map((d) => ({ assignee: d.assignee }));
  }

  /**
   * _getAssigned ({ assignee }): (assignment, release, dueOverride, status)
   *
   * **requires** true
   *
   * **effects** returns every ASSIGNED release for the given assignee
   */
  async _getAssigned({ assignee }: { assignee: Assignee }): Promise<
    {
      assignment: Assignment;
      release: Release;
      dueOverride?: Date;
      status: "ASSIGNED";
    }[]
  > {
    const docs = await this.releases
      .find({ assignee, status: "ASSIGNED" })
      .toArray();
    return docs.map((d) => ({
      assignment: d.assignment,
      release: d._id,
      dueOverride: d.dueOverride,
      status: "ASSIGNED" as const,
    }));
  }

  /**
   * _getPublished (): (assignment, audience, targets)
   *
   * **requires** true
   *
   * **effects** returns every PUBLISHED assignment with its audience and
   * targets
   */
  async _getPublished(): Promise<
    {
      assignment: Assignment;
      audience: "EVERYONE" | "TARGETS";
      targets: ID[];
    }[]
  > {
    const docs = await this.assignments.find({ status: "PUBLISHED" }).toArray();
    return docs.map((d) => ({
      assignment: d._id,
      audience: d.audience,
      targets: d.targets,
    }));
  }

  /**
   * _getPublishedInWindow ({ start, end }): (assignment: Assignment)
   *
   * **requires** true
   *
   * **effects** returns every PUBLISHED assignment whose dueAt or availableAt
   * falls within the given window [start, end]
   */
  async _getPublishedInWindow({
    start,
    end,
  }: {
    start: Date;
    end: Date;
  }): Promise<{ assignment: Assignment }[]> {
    const docs = await this.assignments
      .find({
        status: "PUBLISHED",
        $or: [
          { dueAt: { $gte: start, $lte: end } },
          { availableAt: { $gte: start, $lte: end } },
        ],
      })
      .toArray();
    return docs.map((d) => ({ assignment: d._id }));
  }

  /**
   * _getPublishedForAudience ({ audience }): (assignment: Assignment)
   *
   * **requires** true
   *
   * **effects** returns every PUBLISHED assignment where the given audience
   * matches — either the assignment has audience EVERYONE, or audience TARGETS
   * and the given audience ID is in its targets
   */
  async _getPublishedForAudience({
    audience,
  }: {
    audience: Audience;
  }): Promise<{ assignment: Assignment }[]> {
    const docs = await this.assignments
      .find({
        status: "PUBLISHED",
        $or: [
          { audience: "EVERYONE" },
          { audience: "TARGETS", targets: audience },
        ],
      })
      .toArray();
    return docs.map((d) => ({ assignment: d._id }));
  }

  /**
   * _isAssigned ({ assignment, assignee }): (assigned: Boolean)
   *
   * **requires** true
   *
   * **effects** returns a single result whose `assigned` is true iff a Release
   * exists for the given (assignment, assignee) pair with status ASSIGNED
   */
  async _isAssigned({
    assignment,
    assignee,
  }: {
    assignment: Assignment;
    assignee: Assignee;
  }): Promise<{ assigned: boolean }[]> {
    const doc = await this.releases.findOne({
      assignment,
      assignee,
      status: "ASSIGNED",
    });
    return [{ assigned: doc !== null }];
  }

  /**
   * _getDue ({ assignment, assignee }): (dueAt: Date, closeAt?: Date)
   *
   * **requires** true
   *
   * **effects** returns the effective dueAt (override if present, else
   * assignment dueAt) and closeAt for the given assignment and assignee
   */
  async _getDue({
    assignment,
    assignee,
  }: {
    assignment: Assignment;
    assignee: Assignee;
  }): Promise<{ dueAt: Date; closeAt?: Date }[]> {
    const assignmentDoc = await this.assignments.findOne({ _id: assignment });
    if (assignmentDoc === null) {
      return [];
    }
    const releaseDoc = await this.releases.findOne({
      assignment,
      assignee,
      status: "ASSIGNED",
    });
    const dueAt = releaseDoc?.dueOverride ?? assignmentDoc.dueAt;
    return [{ dueAt, closeAt: assignmentDoc.closeAt }];
  }
}
