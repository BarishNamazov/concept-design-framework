import { collectionName } from "@utils/database.ts";
import type { ID } from "@utils/types.ts";
import type { Collection, Db } from "mongodb";
import { ForumErrorCode } from "../../sdk/error-codes.ts";

// Generic types of this concept.
type Question = ID;
type Answer = ID;
type User = ID;

/**
 * a set of Resolutions with
 *   a question Question
 *   an answer Answer
 *   a resolvedBy User
 *   a resolvedAt DateTime
 *
 * Invariant: at most one Resolution exists per question; the question id is
 * used as the Resolution's `_id`.
 */
interface ResolutionDoc {
  _id: Question;
  answer: Answer;
  resolvedBy: User;
  resolvedAt: Date;
}

/**
 * concept: Resolving [Question, Answer, User]
 *
 * purpose: let the asker (or staff) designate which reply actually answers a
 * question, so that future readers can jump straight to the resolution.
 */
export default class ResolvingConcept {
  private readonly resolutions: Collection<ResolutionDoc>;

  constructor(
    private readonly db: Db,
    namespace = "Resolving",
  ) {
    this.resolutions = this.db.collection(
      collectionName(namespace, "resolutions"),
    );
  }

  /**
   * accept (question: Question, answer: Answer, by: User): (resolution: Question)
   *
   * **requires** true
   *
   * **effects** records `answer` as the accepted answer of `question` by user
   * `by` at the current time, replacing any existing Resolution for
   * `question`; returns the question id as `resolution`
   */
  async accept({
    question,
    answer,
    by,
  }: {
    question: Question;
    answer: Answer;
    by: User;
  }): Promise<{ resolution: Question }> {
    await this.resolutions.updateOne(
      { _id: question },
      { $set: { answer, resolvedBy: by, resolvedAt: new Date() } },
      { upsert: true },
    );
    return { resolution: question };
  }

  /**
   * clear (question: Question): (question: Question)
   *
   * **requires** a Resolution exists for `question`
   *
   * **effects** removes the Resolution for `question` from the state; returns
   * `question`
   */
  async clear({
    question,
  }: {
    question: Question;
  }): Promise<
    { question: Question } | { error: ForumErrorCode; detail?: string }
  > {
    const doc = await this.resolutions.findOne({ _id: question });
    if (doc === null) {
      return { error: ForumErrorCode.RESOLUTION_NOT_FOUND };
    }
    await this.resolutions.deleteOne({ _id: question });
    return { question };
  }

  /**
   * _isResolved (question: Question): (resolved: Flag)
   *
   * **requires** true
   *
   * **effects** returns a single result whose `resolved` is true iff a
   * Resolution exists for `question`
   */
  async _isResolved({
    question,
  }: {
    question: Question;
  }): Promise<{ resolved: boolean }[]> {
    const doc = await this.resolutions.findOne({ _id: question });
    return [{ resolved: doc !== null }];
  }

  /**
   * _getAnswer (question: Question): (answer: Answer)
   *
   * **requires** true
   *
   * **effects** returns the accepted `answer` of `question` (zero or one)
   */
  async _getAnswer({
    question,
  }: {
    question: Question;
  }): Promise<{ answer: Answer }[]> {
    const doc = await this.resolutions.findOne({ _id: question });
    return doc === null ? [] : [{ answer: doc.answer }];
  }

  /**
   * _getResolution (question: Question): (answer: Answer, resolvedBy: User, resolvedAt: DateTime)
   *
   * **requires** true
   *
   * **effects** returns the Resolution for `question` (zero or one), with its
   * answer, the user who resolved it and the time it was resolved
   */
  async _getResolution({
    question,
  }: {
    question: Question;
  }): Promise<{ answer: Answer; resolvedBy: User; resolvedAt: Date }[]> {
    const doc = await this.resolutions.findOne({ _id: question });
    return doc === null
      ? []
      : [
          {
            answer: doc.answer,
            resolvedBy: doc.resolvedBy,
            resolvedAt: doc.resolvedAt,
          },
        ];
  }
}
