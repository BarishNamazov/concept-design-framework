import { collectionName, freshID } from "@utils/database.ts";
import type { ID } from "@utils/types.ts";
import type { Collection, Db } from "mongodb";

// Generic types of this concept.
type Author = ID;
type Learner = ID;
type Note = ID;

/**
 * a set of Notes with
 *   an author Author
 *   a learner Learner
 *   a body String
 *   a visibility String ("STAFF_ONLY" | "LEARNER_VISIBLE")
 *   a status String ("OPEN" | "RESOLVED" | "ARCHIVED")
 *   a createdAt DateTime
 *   an updatedAt DateTime (optional)
 *   a followUpAt DateTime (optional)
 *   an acknowledgedAt DateTime (optional)
 *   a tags Array<String>
 *
 * Invariant: STAFF_ONLY notes are never returned by learner-visible queries.
 * Invariant: acknowledgedAt is only set on LEARNER_VISIBLE notes.
 * Invariant: Archived notes remain queryable but disappear from default active
 * lists.
 */
interface NoteDoc {
  _id: Note;
  author: Author;
  learner: Learner;
  body: string;
  visibility: "STAFF_ONLY" | "LEARNER_VISIBLE";
  status: "OPEN" | "RESOLVED" | "ARCHIVED";
  createdAt: Date;
  updatedAt?: Date;
  followUpAt?: Date;
  acknowledgedAt?: Date;
  tags: string[];
}

/**
 * concept: StudentNoting [Author, Learner]
 *
 * purpose: let staff write notes about students, control their visibility, track
 * follow-ups and record learner acknowledgements.
 */
export default class StudentNotingConcept {
  private readonly notes: Collection<NoteDoc>;

  constructor(
    private readonly db: Db,
    namespace = "StudentNoting",
  ) {
    this.notes = this.db.collection(collectionName(namespace, "notes"));
  }

  /**
   * write (author: Author, learner: Learner, body: String, visibility:
   * String, tags?: Array<String>, followUpAt?: DateTime): (note: Note)
   *
   * **requires** visibility is "STAFF_ONLY" or "LEARNER_VISIBLE"
   *
   * **effects** creates a fresh OPEN Note with the given fields, tags
   * defaulting to an empty array; returns it as `note`
   */
  async write({
    author,
    learner,
    body,
    visibility,
    tags,
    followUpAt,
  }: {
    author: Author;
    learner: Learner;
    body: string;
    visibility: "STAFF_ONLY" | "LEARNER_VISIBLE";
    tags?: string[];
    followUpAt?: Date;
  }): Promise<{ note: Note } | { error: string }> {
    if (visibility !== "STAFF_ONLY" && visibility !== "LEARNER_VISIBLE") {
      return { error: 'Visibility must be "STAFF_ONLY" or "LEARNER_VISIBLE".' };
    }
    const note = freshID() as Note;
    const createdAt: Date = new Date();
    await this.notes.insertOne({
      _id: note,
      author,
      learner,
      body,
      visibility,
      status: "OPEN",
      createdAt,
      tags: tags ?? [],
      ...(followUpAt !== undefined ? { followUpAt } : {}),
    });
    return { note };
  }

  /**
   * revise (note: Note, body?: String, visibility?: String, tags?:
   * Array<String>, followUpAt?: DateTime): (note: Note)
   *
   * **requires** `note` is OPEN
   *
   * **effects** updates the given fields on the note, setting `updatedAt` to the
   * current time; fields omitted or undefined stay unchanged; returns `note`
   */
  async revise({
    note,
    body,
    visibility,
    tags,
    followUpAt,
  }: {
    note: Note;
    body?: string;
    visibility?: "STAFF_ONLY" | "LEARNER_VISIBLE";
    tags?: string[];
    followUpAt?: Date;
  }): Promise<{ note: Note } | { error: string }> {
    const doc = await this.notes.findOne({ _id: note });
    if (doc === null) {
      return { error: "Note does not exist." };
    }
    if (doc.status !== "OPEN") {
      return { error: "Only OPEN notes can be revised." };
    }
    if (
      visibility !== undefined &&
      visibility !== "STAFF_ONLY" &&
      visibility !== "LEARNER_VISIBLE"
    ) {
      return { error: 'Visibility must be "STAFF_ONLY" or "LEARNER_VISIBLE".' };
    }
    const $set: Record<string, unknown> = { updatedAt: new Date() };
    if (body !== undefined) $set.body = body;
    if (visibility !== undefined) $set.visibility = visibility;
    if (tags !== undefined) $set.tags = tags;
    if (followUpAt !== undefined) {
      $set.followUpAt = followUpAt;
    }
    await this.notes.updateOne({ _id: note }, { $set });
    return { note };
  }

  /**
   * resolve (note: Note): (note: Note)
   *
   * **requires** `note` is OPEN
   *
   * **effects** transitions `note` status to RESOLVED; returns `note`
   */
  async resolve({
    note,
  }: {
    note: Note;
  }): Promise<{ note: Note } | { error: string }> {
    const doc = await this.notes.findOne({ _id: note });
    if (doc === null) {
      return { error: "Note does not exist." };
    }
    if (doc.status !== "OPEN") {
      return { error: "Only OPEN notes can be resolved." };
    }
    await this.notes.updateOne(
      { _id: note },
      { $set: { status: "RESOLVED", updatedAt: new Date() } },
    );
    return { note };
  }

  /**
   * archive (note: Note): (note: Note)
   *
   * **requires** `note` is RESOLVED
   *
   * **effects** transitions `note` status to ARCHIVED; returns `note`
   */
  async archive({
    note,
  }: {
    note: Note;
  }): Promise<{ note: Note } | { error: string }> {
    const doc = await this.notes.findOne({ _id: note });
    if (doc === null) {
      return { error: "Note does not exist." };
    }
    if (doc.status !== "RESOLVED") {
      return { error: "Only RESOLVED notes can be archived." };
    }
    await this.notes.updateOne(
      { _id: note },
      { $set: { status: "ARCHIVED", updatedAt: new Date() } },
    );
    return { note };
  }

  /**
   * restore (note: Note): (note: Note)
   *
   * **requires** `note` is RESOLVED or ARCHIVED
   *
   * **effects** transitions `note` status back to OPEN; returns `note`
   */
  async restore({
    note,
  }: {
    note: Note;
  }): Promise<{ note: Note } | { error: string }> {
    const doc = await this.notes.findOne({ _id: note });
    if (doc === null) {
      return { error: "Note does not exist." };
    }
    if (doc.status !== "RESOLVED" && doc.status !== "ARCHIVED") {
      return { error: "Only RESOLVED or ARCHIVED notes can be restored." };
    }
    await this.notes.updateOne(
      { _id: note },
      { $set: { status: "OPEN", updatedAt: new Date() } },
    );
    return { note };
  }

  /**
   * acknowledge (note: Note, learner: Learner): (note: Note)
   *
   * **requires** `note` is LEARNER_VISIBLE
   *
   * **effects** sets `acknowledgedAt` to the current time on the note; returns
   * `note`
   */
  async acknowledge({
    note,
    learner,
  }: {
    note: Note;
    learner: Learner;
  }): Promise<{ note: Note } | { error: string }> {
    const doc = await this.notes.findOne({ _id: note });
    if (doc === null) {
      return { error: "Note does not exist." };
    }
    if (doc.visibility !== "LEARNER_VISIBLE") {
      return {
        error: "Only LEARNER_VISIBLE notes can be acknowledged.",
      };
    }
    if (doc.learner !== learner) {
      return {
        error: "Only the note's learner can acknowledge it.",
      };
    }
    await this.notes.updateOne(
      { _id: note },
      { $set: { acknowledgedAt: new Date() } },
    );
    return { note };
  }

  /**
   * _getNote (note: Note): (note: Note, author: Author, learner: Learner, body:
   * String, visibility: String, status: String, createdAt: DateTime, updatedAt?:
   * DateTime, followUpAt?: DateTime, acknowledgedAt?: DateTime, tags:
   * Array<String>)
   *
   * **requires** true
   *
   * **effects** returns the Note with the given `note` id, if it exists
   */
  async _getNote({ note }: { note: Note }): Promise<
    {
      note: Note;
      author: Author;
      learner: Learner;
      body: string;
      visibility: string;
      status: string;
      createdAt: Date;
      updatedAt?: Date;
      followUpAt?: Date;
      acknowledgedAt?: Date;
      tags: string[];
    }[]
  > {
    const doc = await this.notes.findOne({ _id: note });
    if (doc === null) return [];
    return [
      {
        note: doc._id,
        author: doc.author,
        learner: doc.learner,
        body: doc.body,
        visibility: doc.visibility,
        status: doc.status,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        followUpAt: doc.followUpAt,
        acknowledgedAt: doc.acknowledgedAt,
        tags: doc.tags,
      },
    ];
  }

  /**
   * _getActiveStaffNotes (learner: Learner): (note: Note, ...)
   *
   * **requires** true
   *
   * **effects** returns all OPEN and RESOLVED notes (any visibility) for the
   * given learner, excluding ARCHIVED notes
   */
  async _getActiveStaffNotes({ learner }: { learner: Learner }): Promise<
    {
      note: Note;
      author: Author;
      learner: Learner;
      body: string;
      visibility: string;
      status: string;
      createdAt: Date;
      updatedAt?: Date;
      followUpAt?: Date;
      acknowledgedAt?: Date;
      tags: string[];
    }[]
  > {
    const docs = await this.notes
      .find({ learner, status: { $in: ["OPEN", "RESOLVED"] } })
      .toArray();
    return docs.map((d) => ({
      note: d._id,
      author: d.author,
      learner: d.learner,
      body: d.body,
      visibility: d.visibility,
      status: d.status,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      followUpAt: d.followUpAt,
      acknowledgedAt: d.acknowledgedAt,
      tags: d.tags,
    }));
  }

  /**
   * _getLearnerVisibleNotes (learner: Learner): (note: Note, ...)
   *
   * **requires** true
   *
   * **effects** returns all LEARNER_VISIBLE, OPEN and RESOLVED notes for the
   * given learner, excluding STAFF_ONLY and ARCHIVED notes
   */
  async _getLearnerVisibleNotes({ learner }: { learner: Learner }): Promise<
    {
      note: Note;
      author: Author;
      learner: Learner;
      body: string;
      status: string;
      createdAt: Date;
      updatedAt?: Date;
      followUpAt?: Date;
      acknowledgedAt?: Date;
      tags: string[];
    }[]
  > {
    const docs = await this.notes
      .find({
        learner,
        visibility: "LEARNER_VISIBLE",
        status: { $in: ["OPEN", "RESOLVED"] },
      })
      .toArray();
    return docs.map((d) => ({
      note: d._id,
      author: d.author,
      learner: d.learner,
      body: d.body,
      status: d.status,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      followUpAt: d.followUpAt,
      acknowledgedAt: d.acknowledgedAt,
      tags: d.tags,
    }));
  }

  /**
   * _getNotesByAuthor (author: Author): (note: Note, learner: Learner, status:
   * String, visibility: String, createdAt: DateTime)
   *
   * **requires** true
   *
   * **effects** returns all notes written by the given author
   */
  async _getNotesByAuthor({ author }: { author: Author }): Promise<
    {
      note: Note;
      learner: Learner;
      status: string;
      visibility: string;
      createdAt: Date;
    }[]
  > {
    const docs = await this.notes.find({ author }).toArray();
    return docs.map((d) => ({
      note: d._id,
      learner: d.learner,
      status: d.status,
      visibility: d.visibility,
      createdAt: d.createdAt,
    }));
  }

  /**
   * _getOpenFollowUps (before: DateTime): (note: Note, author: Author, learner:
   * Learner, body: String, followUpAt: DateTime, createdAt: DateTime)
   *
   * **requires** true
   *
   * **effects** returns all OPEN notes whose `followUpAt` is on or before
   * the given `before` date
   */
  async _getOpenFollowUps({ before }: { before: Date }): Promise<
    {
      note: Note;
      author: Author;
      learner: Learner;
      body: string;
      followUpAt: Date;
      createdAt: Date;
    }[]
  > {
    const docs = await this.notes
      .find({
        status: "OPEN",
        followUpAt: { $lte: before },
      })
      .toArray();
    return docs.map((d) => ({
      note: d._id,
      author: d.author,
      learner: d.learner,
      body: d.body,
      followUpAt: d.followUpAt as Date,
      createdAt: d.createdAt,
    }));
  }
}
