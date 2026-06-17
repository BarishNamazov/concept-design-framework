import { collectionName, freshID } from "@utils/database.ts";
import type { ID } from "@utils/types.ts";
import type { Collection, Db } from "mongodb";

type User = ID;
type Section = ID;
type Seat = ID;

interface ClassDoc {
  _id: string;
  code: string;
  title: string;
  term: string;
  timezone: string;
  status: "ACTIVE" | "ARCHIVED";
}

interface SectionDoc {
  _id: Section;
  name: string;
  location?: string;
  meetingPattern?: string;
  status: "ACTIVE" | "ARCHIVED";
}

interface SeatDoc {
  _id: Seat;
  user?: User;
  externalKey: string;
  email: string;
  rosterName: string;
  kind: "STUDENT" | "STAFF" | "AUDITOR";
  section?: Section;
  status: "PENDING" | "ACTIVE" | "DROPPED";
}

/**
 * concept: Rostering
 *
 * purpose: manage class setup, recitation sections, and roster seats for a
 * single class deployment, linking students/staff/auditors to seats and
 * sections.
 */
export default class RosteringConcept {
  private readonly class_: Collection<ClassDoc>;
  private readonly sections: Collection<SectionDoc>;
  private readonly seats: Collection<SeatDoc>;

  constructor(
    private readonly db: Db,
    namespace = "Rostering",
  ) {
    this.class_ = this.db.collection(collectionName(namespace, "class"));
    this.sections = this.db.collection(collectionName(namespace, "sections"));
    this.seats = this.db.collection(collectionName(namespace, "seats"));
  }

  /**
   * configureClass (code: String, title: String, term: String, timezone: String):
   *   (class: Class)
   *
   * **requires** no Class exists yet
   *
   * **effects** creates the singleton Class with ACTIVE status;
   * returns it as `class`
   */
  async configureClass({
    code,
    title,
    term,
    timezone,
  }: {
    code: string;
    title: string;
    term: string;
    timezone: string;
  }): Promise<{ class: ClassDoc } | { error: string }> {
    const existing = await this.class_.findOne({});
    if (existing !== null) {
      return { error: "A class is already configured." };
    }
    const doc: ClassDoc = {
      _id: freshID() as string,
      code,
      title,
      term,
      timezone,
      status: "ACTIVE",
    };
    await this.class_.insertOne(doc);
    return { class: doc };
  }

  /**
   * archiveClass (): (class: Class)
   *
   * **requires** a Class exists
   *
   * **effects** sets the Class status to ARCHIVED; returns the updated `class`
   */
  async archiveClass(): Promise<{ class: ClassDoc } | { error: string }> {
    const doc = await this.class_.findOne({});
    if (doc === null) {
      return { error: "No class configured to archive." };
    }
    await this.class_.updateOne(
      { _id: doc._id },
      { $set: { status: "ARCHIVED" } },
    );
    return { class: { ...doc, status: "ARCHIVED" } };
  }

  /**
   * createSection (name: String, location?: String, meetingPattern?: String):
   *   (section: Section)
   *
   * **requires** true
   *
   * **effects** creates a fresh Section with ACTIVE status;
   * returns it as `section`
   */
  async createSection({
    name,
    location,
    meetingPattern,
  }: {
    name: string;
    location?: string;
    meetingPattern?: string;
  }): Promise<{ section: SectionDoc } | { error: string }> {
    const _id = freshID() as Section;
    const doc: SectionDoc = {
      _id,
      name,
      location,
      meetingPattern,
      status: "ACTIVE",
    };
    await this.sections.insertOne(doc);
    return { section: doc };
  }

  /**
   * updateSection (section: Section, name: String, location?: String, meetingPattern?: String):
   *   (section: Section)
   *
   * **requires** the Section exists
   *
   * **effects** updates the Section fields; returns the updated `section`
   */
  async updateSection({
    section,
    name,
    location,
    meetingPattern,
  }: {
    section: Section;
    name: string;
    location?: string;
    meetingPattern?: string;
  }): Promise<{ section: SectionDoc } | { error: string }> {
    const doc = await this.sections.findOne({ _id: section });
    if (doc === null) {
      return { error: "Section does not exist." };
    }
    const updated: SectionDoc = {
      ...doc,
      name,
      location,
      meetingPattern,
    };
    await this.sections.updateOne(
      { _id: section },
      { $set: { name, location, meetingPattern } },
    );
    return { section: updated };
  }

  /**
   * archiveSection (section: Section): (section: Section)
   *
   * **requires** the Section exists
   *
   * **effects** sets the Section status to ARCHIVED;
   * returns the updated `section`
   */
  async archiveSection({
    section,
  }: {
    section: Section;
  }): Promise<{ section: SectionDoc } | { error: string }> {
    const doc = await this.sections.findOne({ _id: section });
    if (doc === null) {
      return { error: "Section does not exist." };
    }
    await this.sections.updateOne(
      { _id: section },
      { $set: { status: "ARCHIVED" } },
    );
    return { section: { ...doc, status: "ARCHIVED" } };
  }

  /**
   * importSeat (externalKey: String, email: String, rosterName: String,
   *   kind: "STUDENT"|"STAFF"|"AUDITOR", section?: Section): (seat: Seat)
   *
   * **requires** no Seat exists with the given `externalKey`
   *
   * **effects** creates a fresh PENDING Seat; returns it as `seat`
   */
  async importSeat({
    externalKey,
    email,
    rosterName,
    kind,
    section,
  }: {
    externalKey: string;
    email: string;
    rosterName: string;
    kind: "STUDENT" | "STAFF" | "AUDITOR";
    section?: Section;
  }): Promise<{ seat: SeatDoc } | { error: string }> {
    const existing = await this.seats.findOne({ externalKey });
    if (existing !== null) {
      return {
        error: `A seat with externalKey "${externalKey}" already exists.`,
      };
    }
    const _id = freshID() as Seat;
    const doc: SeatDoc = {
      _id,
      externalKey,
      email,
      rosterName,
      kind,
      section,
      status: "PENDING",
    };
    await this.seats.insertOne(doc);
    return { seat: doc };
  }

  /**
   * claimSeat (seat: Seat, user: User): (seat: Seat)
   *
   * **requires** the Seat exists and is PENDING, and the `user` does not
   * already have an ACTIVE seat
   *
   * **effects** transitions the Seat to ACTIVE, associates it with `user`;
   * returns the updated `seat`
   */
  async claimSeat({
    seat,
    user,
  }: {
    seat: Seat;
    user: User;
  }): Promise<{ seat: SeatDoc } | { error: string }> {
    const doc = await this.seats.findOne({ _id: seat });
    if (doc === null) {
      return { error: "Seat does not exist." };
    }
    if (doc.status !== "PENDING") {
      return { error: "Seat is not in PENDING status." };
    }
    const activeForUser = await this.seats.findOne({
      user,
      status: "ACTIVE",
      _id: { $ne: seat },
    });
    if (activeForUser !== null) {
      return {
        error: "User already has an ACTIVE seat and cannot claim another.",
      };
    }
    await this.seats.updateOne(
      { _id: seat },
      { $set: { user, status: "ACTIVE" } },
    );
    return { seat: { ...doc, user, status: "ACTIVE" } };
  }

  /**
   * linkUser (seat: Seat, user: User): (seat: Seat)
   *
   * **requires** the Seat exists and is PENDING, and the `user` does not
   * already have an ACTIVE seat
   *
   * **effects** staff-initiated variant of claimSeat; transitions the Seat to
   * ACTIVE, associates it with `user`; returns the updated `seat`
   */
  async linkUser({
    seat,
    user,
  }: {
    seat: Seat;
    user: User;
  }): Promise<{ seat: SeatDoc } | { error: string }> {
    return this.claimSeat({ seat, user });
  }

  /**
   * dropSeat (seat: Seat): (seat: Seat)
   *
   * **requires** the Seat exists and is ACTIVE
   *
   * **effects** transitions the Seat to DROPPED; returns the updated `seat`
   */
  async dropSeat({
    seat,
  }: {
    seat: Seat;
  }): Promise<{ seat: SeatDoc } | { error: string }> {
    const doc = await this.seats.findOne({ _id: seat });
    if (doc === null) {
      return { error: "Seat does not exist." };
    }
    if (doc.status !== "ACTIVE") {
      return { error: "Seat is not in ACTIVE status." };
    }
    await this.seats.updateOne({ _id: seat }, { $set: { status: "DROPPED" } });
    return { seat: { ...doc, status: "DROPPED" } };
  }

  /**
   * reinstateSeat (seat: Seat): (seat: Seat)
   *
   * **requires** the Seat exists and is DROPPED
   *
   * **effects** transitions the Seat back to ACTIVE; returns the updated `seat`
   */
  async reinstateSeat({
    seat,
  }: {
    seat: Seat;
  }): Promise<{ seat: SeatDoc } | { error: string }> {
    const doc = await this.seats.findOne({ _id: seat });
    if (doc === null) {
      return { error: "Seat does not exist." };
    }
    if (doc.status !== "DROPPED") {
      return { error: "Seat is not in DROPPED status." };
    }
    await this.seats.updateOne({ _id: seat }, { $set: { status: "ACTIVE" } });
    return { seat: { ...doc, status: "ACTIVE" } };
  }

  /**
   * moveSection (seat: Seat, section: Section): (seat: Seat)
   *
   * **requires** the Seat exists
   *
   * **effects** changes the Seat's section; returns the updated `seat`
   */
  async moveSection({
    seat,
    section,
  }: {
    seat: Seat;
    section: Section;
  }): Promise<{ seat: SeatDoc } | { error: string }> {
    const doc = await this.seats.findOne({ _id: seat });
    if (doc === null) {
      return { error: "Seat does not exist." };
    }
    await this.seats.updateOne({ _id: seat }, { $set: { section } });
    return { seat: { ...doc, section } };
  }

  /**
   * setKind (seat: Seat, kind: "STUDENT"|"STAFF"|"AUDITOR"): (seat: Seat)
   *
   * **requires** the Seat exists
   *
   * **effects** changes the Seat's kind; returns the updated `seat`
   */
  async setKind({
    seat,
    kind,
  }: {
    seat: Seat;
    kind: "STUDENT" | "STAFF" | "AUDITOR";
  }): Promise<{ seat: SeatDoc } | { error: string }> {
    const doc = await this.seats.findOne({ _id: seat });
    if (doc === null) {
      return { error: "Seat does not exist." };
    }
    await this.seats.updateOne({ _id: seat }, { $set: { kind } });
    return { seat: { ...doc, kind } };
  }

  /**
   * _getClass (): (code: String, title: String, term: String,
   *   timezone: String, status: "ACTIVE" | "ARCHIVED")
   *
   * **requires** true
   *
   * **effects** returns the current Class configuration, or an empty array
   * if none exists
   */
  async _getClass(): Promise<
    {
      code: string;
      title: string;
      term: string;
      timezone: string;
      status: "ACTIVE" | "ARCHIVED";
    }[]
  > {
    const doc = await this.class_.findOne({});
    if (doc === null) return [];
    return [
      {
        code: doc.code,
        title: doc.title,
        term: doc.term,
        timezone: doc.timezone,
        status: doc.status,
      },
    ];
  }

  /**
   * _getSections (): (section: Section, name: String, location?: String,
   *   meetingPattern?: String, status: "ACTIVE" | "ARCHIVED")
   *
   * **requires** true
   *
   * **effects** returns every Section with its details
   */
  async _getSections(): Promise<
    {
      section: Section;
      name: string;
      location?: string;
      meetingPattern?: string;
      status: "ACTIVE" | "ARCHIVED";
    }[]
  > {
    const docs = await this.sections.find().toArray();
    return docs.map((doc) => ({
      section: doc._id,
      name: doc.name,
      location: doc.location ?? undefined,
      meetingPattern: doc.meetingPattern ?? undefined,
      status: doc.status,
    }));
  }

  /**
   * _getSeat (seat: Seat): (seat: Seat, user?: User, externalKey: String,
   *   email: String, rosterName: String, kind: "STUDENT"|"STAFF"|"AUDITOR",
   *   section?: Section, status: "PENDING"|"ACTIVE"|"DROPPED")
   *
   * **requires** true
   *
   * **effects** returns the Seat details for the given `seat` id
   */
  async _getSeat({ seat }: { seat: Seat }): Promise<
    {
      seat: Seat;
      user?: User;
      externalKey: string;
      email: string;
      rosterName: string;
      kind: "STUDENT" | "STAFF" | "AUDITOR";
      section?: Section;
      status: "PENDING" | "ACTIVE" | "DROPPED";
    }[]
  > {
    const doc = await this.seats.findOne({ _id: seat });
    if (doc === null) return [];
    return [
      {
        seat: doc._id,
        user: doc.user ?? undefined,
        externalKey: doc.externalKey,
        email: doc.email,
        rosterName: doc.rosterName,
        kind: doc.kind,
        section: doc.section ?? undefined,
        status: doc.status,
      },
    ];
  }

  /**
   * _getSeatByUser (user: User): (seat: Seat, user: User, externalKey: String,
   *   email: String, rosterName: String, kind: "STUDENT"|"STAFF"|"AUDITOR",
   *   section?: Section, status: "PENDING"|"ACTIVE"|"DROPPED")
   *
   * **requires** true
   *
   * **effects** returns the Seat associated with the given `user`
   */
  async _getSeatByUser({ user }: { user: User }): Promise<
    {
      seat: Seat;
      user: User;
      externalKey: string;
      email: string;
      rosterName: string;
      kind: "STUDENT" | "STAFF" | "AUDITOR";
      section?: Section;
      status: "PENDING" | "ACTIVE" | "DROPPED";
    }[]
  > {
    const docs = await this.seats.find({ user }).toArray();
    return docs.map((doc) => ({
      seat: doc._id,
      user: doc.user as ID,
      externalKey: doc.externalKey,
      email: doc.email,
      rosterName: doc.rosterName,
      kind: doc.kind,
      section: doc.section ?? undefined,
      status: doc.status,
    }));
  }

  /**
   * _getSeatByExternalKey (externalKey: String): (seat: Seat, user?: User,
   *   externalKey: String, email: String, rosterName: String,
   *   kind: "STUDENT"|"STAFF"|"AUDITOR", section?: Section,
   *   status: "PENDING"|"ACTIVE"|"DROPPED")
   *
   * **requires** true
   *
   * **effects** returns the Seat (zero or one) with the given `externalKey`
   */
  async _getSeatByExternalKey({
    externalKey,
  }: {
    externalKey: string;
  }): Promise<
    {
      seat: Seat;
      user?: User;
      externalKey: string;
      email: string;
      rosterName: string;
      kind: "STUDENT" | "STAFF" | "AUDITOR";
      section?: Section;
      status: "PENDING" | "ACTIVE" | "DROPPED";
    }[]
  > {
    const doc = await this.seats.findOne({ externalKey });
    if (doc === null) return [];
    return [
      {
        seat: doc._id,
        user: doc.user ?? undefined,
        externalKey: doc.externalKey,
        email: doc.email,
        rosterName: doc.rosterName,
        kind: doc.kind,
        section: doc.section ?? undefined,
        status: doc.status,
      },
    ];
  }

  /**
   * _getActiveMembers (): (user: User, seat: Seat, kind:
   *   "STUDENT"|"STAFF"|"AUDITOR", section?: Section, rosterName: String,
   *   email: String)
   *
   * **requires** true
   *
   * **effects** returns every ACTIVE seat across all kinds
   */
  async _getActiveMembers(): Promise<
    {
      user: User;
      seat: Seat;
      kind: "STUDENT" | "STAFF" | "AUDITOR";
      section?: Section;
      rosterName: string;
      email: string;
    }[]
  > {
    const docs = await this.seats.find({ status: "ACTIVE" }).toArray();
    return docs.map((doc) => ({
      user: doc.user as ID,
      seat: doc._id,
      kind: doc.kind,
      section: doc.section ?? undefined,
      rosterName: doc.rosterName,
      email: doc.email,
    }));
  }

  /**
   * _getActiveStudents (): (user: User, seat: Seat, section?: Section,
   *   rosterName: String, email: String)
   *
   * **requires** true
   *
   * **effects** returns every ACTIVE STUDENT seat
   */
  async _getActiveStudents(): Promise<
    {
      user: User;
      seat: Seat;
      section?: Section;
      rosterName: string;
      email: string;
    }[]
  > {
    const docs = await this.seats
      .find({ status: "ACTIVE", kind: "STUDENT" })
      .toArray();
    return docs.map((doc) => ({
      user: doc.user as ID,
      seat: doc._id,
      section: doc.section ?? undefined,
      rosterName: doc.rosterName,
      email: doc.email,
    }));
  }

  /**
   * _getActiveStudentsInSection (section: Section): (user: User,
   *   seat: Seat, rosterName: String, email: String)
   *
   * **requires** true
   *
   * **effects** returns every ACTIVE STUDENT seat in the given `section`
   */
  async _getActiveStudentsInSection({
    section,
  }: {
    section: Section;
  }): Promise<{ user: User; seat: Seat; rosterName: string; email: string }[]> {
    const docs = await this.seats
      .find({ status: "ACTIVE", kind: "STUDENT", section })
      .toArray();
    return docs.map((doc) => ({
      user: doc.user as ID,
      seat: doc._id,
      rosterName: doc.rosterName,
      email: doc.email,
    }));
  }

  /**
   * _getUnclaimedSeats (): (seat: Seat, externalKey: String, email: String,
   *   rosterName: String, kind: "STUDENT"|"STAFF"|"AUDITOR", section?: Section)
   *
   * **requires** true
   *
   * **effects** returns every PENDING seat that has no user assigned
   */
  async _getUnclaimedSeats(): Promise<
    {
      seat: Seat;
      externalKey: string;
      email: string;
      rosterName: string;
      kind: "STUDENT" | "STAFF" | "AUDITOR";
      section?: Section;
    }[]
  > {
    const docs = await this.seats
      .find({ status: "PENDING", user: { $exists: false } })
      .toArray();
    return docs.map((doc) => ({
      seat: doc._id,
      externalKey: doc.externalKey,
      email: doc.email,
      rosterName: doc.rosterName,
      kind: doc.kind,
      section: doc.section ?? undefined,
    }));
  }

  /**
   * _isActiveStudent (user: User): (active: Boolean)
   *
   * **requires** true
   *
   * **effects** returns a single result whose `active` is true iff the `user`
   * has an ACTIVE STUDENT seat
   */
  async _isActiveStudent({
    user,
  }: {
    user: User;
  }): Promise<{ active: boolean }[]> {
    const doc = await this.seats.findOne({
      user,
      status: "ACTIVE",
      kind: "STUDENT",
    });
    return [{ active: doc !== null }];
  }

  /**
   * _isActiveStaff (user: User): (active: Boolean)
   *
   * **requires** true
   *
   * **effects** returns a single result whose `active` is true iff the `user`
   * has an ACTIVE STAFF seat
   */
  async _isActiveStaff({
    user,
  }: {
    user: User;
  }): Promise<{ active: boolean }[]> {
    const doc = await this.seats.findOne({
      user,
      status: "ACTIVE",
      kind: "STAFF",
    });
    return [{ active: doc !== null }];
  }
}
