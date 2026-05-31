import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { setupTestDb } from "@utils/testing.ts";
import type { ID } from "@utils/types.ts";
import NotifyingConcept from "./NotifyingConcept.ts";

const mongo = await setupTestDb();
const Notifying = new NotifyingConcept(mongo.db);

afterAll(() => mongo.stop());

beforeEach(async () => {
  await mongo.db.collection("Notifying.notifications").deleteMany({});
});

/** Narrow a result union to its success branch, failing the test otherwise. */
function ok<T>(result: T | { error: string }): T {
  if (result && typeof result === "object" && "error" in result) {
    throw new Error(`Expected success but got error: ${result.error}`);
  }
  return result as T;
}

/** Pause briefly so successive notifications get distinct `createdAt` values. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

const user = (s: string) => s as ID;

describe("Notifying", () => {
  test("principle: an event becomes unread, then read, then dismissed", async () => {
    const u = user("alice");
    const { notification } = ok(
      await Notifying.notify({ recipient: u, kind: "mention", subject: "hi" }),
    );
    // it appears in the inbox as unread, counting toward the unread total
    expect(await Notifying._getInbox({ recipient: u })).toEqual([
      {
        notification,
        kind: "mention",
        subject: "hi",
        link: null,
        createdAt: expect.any(Date),
        read: false,
      },
    ]);
    expect(await Notifying._getUnreadCount({ recipient: u })).toEqual([
      { count: 1 },
    ]);
    // after reading it no longer counts as unread, but remains in the inbox
    ok(await Notifying.markRead({ notification }));
    expect(await Notifying._getUnreadCount({ recipient: u })).toEqual([
      { count: 0 },
    ]);
    expect(await Notifying._getUnread({ recipient: u })).toEqual([]);
    expect(await Notifying._getInbox({ recipient: u })).toHaveLength(1);
    // dismissing it removes it for good
    ok(await Notifying.dismiss({ notification }));
    expect(await Notifying._getInbox({ recipient: u })).toEqual([]);
  });

  test("notify stores the optional link, defaulting to null", async () => {
    const u = user("bob");
    const withLink = ok(
      await Notifying.notify({
        recipient: u,
        kind: "comment",
        subject: "new reply",
        link: "/posts/1",
      }),
    );
    const withoutLink = ok(
      await Notifying.notify({
        recipient: u,
        kind: "system",
        subject: "welcome",
      }),
    );
    const inbox = await Notifying._getInbox({ recipient: u });
    expect(inbox).toContainEqual(
      expect.objectContaining({
        notification: withLink.notification,
        link: "/posts/1",
      }),
    );
    expect(inbox).toContainEqual(
      expect.objectContaining({
        notification: withoutLink.notification,
        link: null,
      }),
    );
  });

  test("markRead requires the notification to exist", async () => {
    expect(
      await Notifying.markRead({ notification: user("ghost") }),
    ).toHaveProperty("error");
    const u = user("carol");
    const { notification } = ok(
      await Notifying.notify({ recipient: u, kind: "mention", subject: "x" }),
    );
    const read = ok(await Notifying.markRead({ notification }));
    expect(read.notification).toBe(notification);
    expect(await Notifying._getUnreadCount({ recipient: u })).toEqual([
      { count: 0 },
    ]);
  });

  test("markAllRead clears the unread total for one recipient only", async () => {
    const u = user("dave");
    const other = user("erin");
    ok(await Notifying.notify({ recipient: u, kind: "a", subject: "1" }));
    ok(await Notifying.notify({ recipient: u, kind: "b", subject: "2" }));
    ok(await Notifying.notify({ recipient: other, kind: "c", subject: "3" }));
    const result = await Notifying.markAllRead({ recipient: u });
    expect(result).toEqual({ recipient: u });
    expect(await Notifying._getUnreadCount({ recipient: u })).toEqual([
      { count: 0 },
    ]);
    // a different recipient's notifications are untouched
    expect(await Notifying._getUnreadCount({ recipient: other })).toEqual([
      { count: 1 },
    ]);
  });

  test("dismiss requires the notification to exist and removes it", async () => {
    expect(
      await Notifying.dismiss({ notification: user("ghost") }),
    ).toHaveProperty("error");
    const u = user("frank");
    const { notification } = ok(
      await Notifying.notify({ recipient: u, kind: "mention", subject: "x" }),
    );
    const removed = ok(await Notifying.dismiss({ notification }));
    expect(removed.notification).toBe(notification);
    expect(await Notifying._getInbox({ recipient: u })).toEqual([]);
  });

  test("_getInbox returns every notification newest-first", async () => {
    const u = user("grace");
    const first = ok(
      await Notifying.notify({ recipient: u, kind: "a", subject: "first" }),
    );
    await tick();
    const second = ok(
      await Notifying.notify({ recipient: u, kind: "b", subject: "second" }),
    );
    await tick();
    const third = ok(
      await Notifying.notify({ recipient: u, kind: "c", subject: "third" }),
    );
    const inbox = await Notifying._getInbox({ recipient: u });
    expect(inbox.map((n) => n.notification)).toEqual([
      third.notification,
      second.notification,
      first.notification,
    ]);
  });

  test("_getUnreadCount returns exactly one row counting unread only", async () => {
    const u = user("heidi");
    expect(await Notifying._getUnreadCount({ recipient: u })).toEqual([
      { count: 0 },
    ]);
    const a = ok(
      await Notifying.notify({ recipient: u, kind: "a", subject: "1" }),
    );
    ok(await Notifying.notify({ recipient: u, kind: "b", subject: "2" }));
    expect(await Notifying._getUnreadCount({ recipient: u })).toEqual([
      { count: 2 },
    ]);
    ok(await Notifying.markRead({ notification: a.notification }));
    expect(await Notifying._getUnreadCount({ recipient: u })).toEqual([
      { count: 1 },
    ]);
  });

  test("_getUnread returns unread notifications newest-first", async () => {
    const u = user("ivan");
    const first = ok(
      await Notifying.notify({ recipient: u, kind: "a", subject: "first" }),
    );
    await tick();
    const second = ok(
      await Notifying.notify({ recipient: u, kind: "b", subject: "second" }),
    );
    // reading the older one removes it from the unread list
    ok(await Notifying.markRead({ notification: first.notification }));
    const unread = await Notifying._getUnread({ recipient: u });
    expect(unread).toEqual([
      {
        notification: second.notification,
        kind: "b",
        subject: "second",
        link: null,
        createdAt: expect.any(Date),
      },
    ]);
  });

  test("namespaces isolate duplicate concept instances", async () => {
    const Alerts = new NotifyingConcept(mongo.db, "Alerts");
    const Digests = new NotifyingConcept(mongo.db, "Digests");
    const u = user("judy");

    const alert = ok(
      await Alerts.notify({ recipient: u, kind: "alert", subject: "a" }),
    );
    ok(await Digests.notify({ recipient: u, kind: "digest", subject: "d" }));

    expect(await Alerts._getInbox({ recipient: u })).toEqual([
      {
        notification: alert.notification,
        kind: "alert",
        subject: "a",
        link: null,
        createdAt: expect.any(Date),
        read: false,
      },
    ]);
    expect(await Digests._getUnreadCount({ recipient: u })).toEqual([
      { count: 1 },
    ]);
    expect(await Notifying._getInbox({ recipient: u })).toEqual([]);
  });
});
