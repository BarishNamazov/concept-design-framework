import { collectionName, freshID } from "@utils/database.ts";
import type { ID } from "@utils/types.ts";
import type { Collection, Db } from "mongodb";

// Generic types of this concept.
type User = ID;
type Notification = ID;

/**
 * a set of Notifications with
 *   a recipient User
 *   a kind String
 *   a subject String
 *   an optional link String
 *   a createdAt DateTime
 *   a read Flag
 */
interface NotificationDoc {
  _id: Notification;
  recipient: User;
  kind: string;
  subject: string;
  link: string | null;
  createdAt: Date;
  read: boolean;
}

/**
 * concept: Notifying [User]
 *
 * purpose: make sure a user learns about events relevant to them even when they
 * are not currently looking at where the event occurred.
 */
export default class NotifyingConcept {
  private readonly notifications: Collection<NotificationDoc>;

  constructor(
    private readonly db: Db,
    namespace = "Notifying",
  ) {
    this.notifications = this.db.collection(
      collectionName(namespace, "notifications"),
    );
  }

  /**
   * notify (recipient: User, kind: String, subject: String, link?: String): (notification: Notification)
   *
   * **requires** true
   *
   * **effects** creates a fresh unread Notification `n` with the given
   * `recipient`, `kind` and `subject`, `link` the given link or none, `read`
   * false and `createdAt` the current time; returns `n` as `notification`
   */
  async notify({
    recipient,
    kind,
    subject,
    link,
  }: {
    recipient: User;
    kind: string;
    subject: string;
    link?: string;
  }): Promise<{ notification: Notification }> {
    const notification = freshID() as Notification;
    await this.notifications.insertOne({
      _id: notification,
      recipient,
      kind,
      subject,
      link: link ?? null,
      createdAt: new Date(),
      read: false,
    });
    return { notification };
  }

  /**
   * markRead (notification: Notification): (notification: Notification)
   *
   * **requires** the `notification` exists
   *
   * **effects** sets the `read` of that Notification to true; returns it as
   * `notification`
   */
  async markRead({
    notification,
  }: {
    notification: Notification;
  }): Promise<{ notification: Notification } | { error: string }> {
    const doc = await this.notifications.findOne({ _id: notification });
    if (doc === null) {
      return { error: "Notification does not exist." };
    }
    await this.notifications.updateOne(
      { _id: notification },
      { $set: { read: true } },
    );
    return { notification };
  }

  /**
   * markAllRead (recipient: User): (recipient: User)
   *
   * **requires** true
   *
   * **effects** sets the `read` to true for every Notification of the given
   * `recipient`; returns `recipient`
   */
  async markAllRead({
    recipient,
  }: {
    recipient: User;
  }): Promise<{ recipient: User }> {
    await this.notifications.updateMany(
      { recipient },
      { $set: { read: true } },
    );
    return { recipient };
  }

  /**
   * dismiss (notification: Notification): (notification: Notification)
   *
   * **requires** the `notification` exists
   *
   * **effects** removes that Notification from the state; returns the removed
   * `notification`
   */
  async dismiss({
    notification,
  }: {
    notification: Notification;
  }): Promise<{ notification: Notification } | { error: string }> {
    const doc = await this.notifications.findOne({ _id: notification });
    if (doc === null) {
      return { error: "Notification does not exist." };
    }
    await this.notifications.deleteOne({ _id: notification });
    return { notification };
  }

  /**
   * _getInbox (recipient: User): (notification: {notification: Notification, kind: String, subject: String, link: String, createdAt: DateTime, read: Flag})
   *
   * **requires** true
   *
   * **effects** returns every Notification of the given `recipient`,
   * newest-first, each with its notification id, kind, subject, link, createdAt
   * and read flag
   */
  async _getInbox({ recipient }: { recipient: User }): Promise<
    {
      notification: Notification;
      kind: string;
      subject: string;
      link: string | null;
      createdAt: Date;
      read: boolean;
    }[]
  > {
    const docs = await this.notifications
      .find({ recipient })
      .sort({ createdAt: -1 })
      .toArray();
    return docs.map((d) => ({
      notification: d._id,
      kind: d.kind,
      subject: d.subject,
      link: d.link,
      createdAt: d.createdAt,
      read: d.read,
    }));
  }

  /**
   * _getUnreadCount (recipient: User): (count: Number)
   *
   * **requires** true
   *
   * **effects** returns a single result whose `count` is the number of unread
   * Notifications of the given `recipient`
   */
  async _getUnreadCount({
    recipient,
  }: {
    recipient: User;
  }): Promise<{ count: number }[]> {
    const count = await this.notifications.countDocuments({
      recipient,
      read: false,
    });
    return [{ count }];
  }

  /**
   * _getUnread (recipient: User): (notification: {notification: Notification, kind: String, subject: String, link: String, createdAt: DateTime})
   *
   * **requires** true
   *
   * **effects** returns every unread Notification of the given `recipient`,
   * newest-first, each with its notification id, kind, subject, link and
   * createdAt
   */
  async _getUnread({ recipient }: { recipient: User }): Promise<
    {
      notification: Notification;
      kind: string;
      subject: string;
      link: string | null;
      createdAt: Date;
    }[]
  > {
    const docs = await this.notifications
      .find({ recipient, read: false })
      .sort({ createdAt: -1 })
      .toArray();
    return docs.map((d) => ({
      notification: d._id,
      kind: d.kind,
      subject: d.subject,
      link: d.link,
      createdAt: d.createdAt,
    }));
  }
}
