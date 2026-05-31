/**
 * Notification synchronizations.
 *
 * Endpoints:
 *   POST /notifications/list        { session }               -> { notifications }
 *   POST /notifications/unreadCount { session }               -> { count }
 *   POST /notifications/markRead    { session, notification } -> { notification }
 *   POST /notifications/markAllRead { session }               -> { recipient }
 *   POST /notifications/dismiss     { session, notification } -> { notification }
 */
import { Notifying, Sessioning } from "@concepts";
import {
  type ActionOk,
  defineEndpoint,
  type QueryRow,
} from "@concepts/Requesting/api.ts";

type NotificationsListOutput = {
  notifications: QueryRow<typeof Notifying, "_getInbox">[];
};
type NotificationsUnreadCountOutput = QueryRow<
  typeof Notifying,
  "_getUnreadCount"
>;
type MarkReadOutput = ActionOk<typeof Notifying, "markRead">;
type MarkAllReadOutput = ActionOk<typeof Notifying, "markAllRead">;
type DismissOutput = ActionOk<typeof Notifying, "dismiss">;

// --- list ---

const list = defineEndpoint(
  "/notifications/list",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    NotificationsListResponse: Sync(
      ({ session, user, notification, notifications }) => ({
        when: Actions(Request({ session })),
        where: async (frames) => {
          const [base] = frames;
          frames = await frames.query(
            Sessioning._getUser,
            { session },
            { user },
          );
          frames = await frames.query(
            Notifying._getInbox,
            { recipient: user },
            { notification },
          );
          return frames.aggregate(base, [notification], notifications);
        },
        then: Actions(Respond<NotificationsListOutput>({ notifications })),
      }),
    ),

    NotificationsListInvalidSession: Sync(({ session, active }) => ({
      when: Actions(Request({ session })),
      where: async (frames) => {
        frames = await frames.query(
          Sessioning._isActive,
          { session },
          { active },
        );
        return frames.filter(($) => $[active] === false);
      },
      then: Actions(Fail("Invalid or expired session.")),
    })),
  }),
);

// --- unreadCount ---

const unreadCount = defineEndpoint(
  "/notifications/unreadCount",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    NotificationsUnreadCountResponse: Sync(({ session, user, count }) => ({
      when: Actions(Request({ session })),
      where: async (frames) => {
        frames = await frames.query(Sessioning._getUser, { session }, { user });
        return await frames.query(
          Notifying._getUnreadCount,
          { recipient: user },
          { count },
        );
      },
      then: Actions(Respond<NotificationsUnreadCountOutput>({ count })),
    })),

    NotificationsUnreadCountInvalidSession: Sync(({ session, active }) => ({
      when: Actions(Request({ session })),
      where: async (frames) => {
        frames = await frames.query(
          Sessioning._isActive,
          { session },
          { active },
        );
        return frames.filter(($) => $[active] === false);
      },
      then: Actions(Fail("Invalid or expired session.")),
    })),
  }),
);

// --- markRead ---

const markRead = defineEndpoint(
  "/notifications/markRead",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    NotificationsMarkReadRequest: Sync(({ session, notification, user }) => ({
      when: Actions(Request({ session, notification })),
      where: async (frames) =>
        await frames.query(Sessioning._getUser, { session }, { user }),
      then: Actions([Notifying.markRead, { notification }]),
    })),

    NotificationsMarkReadResponse: Sync(({ notification }) => ({
      when: Actions([Notifying.markRead, {}, { notification }]),
      then: Actions(Respond<MarkReadOutput>({ notification })),
    })),

    NotificationsMarkReadError: Sync(({ error }) => ({
      when: Actions([Notifying.markRead, {}, { error }]),
      then: Actions(Fail(error)),
    })),

    NotificationsMarkReadInvalidSession: Sync(({ session, active }) => ({
      when: Actions(Request({ session })),
      where: async (frames) => {
        frames = await frames.query(
          Sessioning._isActive,
          { session },
          { active },
        );
        return frames.filter(($) => $[active] === false);
      },
      then: Actions(Fail("Invalid or expired session.")),
    })),
  }),
);

// --- markAllRead ---

const markAllRead = defineEndpoint(
  "/notifications/markAllRead",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    NotificationsMarkAllReadRequest: Sync(({ session, user }) => ({
      when: Actions(Request({ session })),
      where: async (frames) =>
        await frames.query(Sessioning._getUser, { session }, { user }),
      then: Actions([Notifying.markAllRead, { recipient: user }]),
    })),

    NotificationsMarkAllReadResponse: Sync(({ recipient }) => ({
      when: Actions([Notifying.markAllRead, {}, { recipient }]),
      then: Actions(Respond<MarkAllReadOutput>({ recipient })),
    })),

    NotificationsMarkAllReadInvalidSession: Sync(({ session, active }) => ({
      when: Actions(Request({ session })),
      where: async (frames) => {
        frames = await frames.query(
          Sessioning._isActive,
          { session },
          { active },
        );
        return frames.filter(($) => $[active] === false);
      },
      then: Actions(Fail("Invalid or expired session.")),
    })),
  }),
);

// --- dismiss ---

const dismiss = defineEndpoint(
  "/notifications/dismiss",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    NotificationsDismissRequest: Sync(({ session, notification, user }) => ({
      when: Actions(Request({ session, notification })),
      where: async (frames) =>
        await frames.query(Sessioning._getUser, { session }, { user }),
      then: Actions([Notifying.dismiss, { notification }]),
    })),

    NotificationsDismissResponse: Sync(({ notification }) => ({
      when: Actions([Notifying.dismiss, {}, { notification }]),
      then: Actions(Respond<DismissOutput>({ notification })),
    })),

    NotificationsDismissError: Sync(({ error }) => ({
      when: Actions([Notifying.dismiss, {}, { error }]),
      then: Actions(Fail(error)),
    })),

    NotificationsDismissInvalidSession: Sync(({ session, active }) => ({
      when: Actions(Request({ session })),
      where: async (frames) => {
        frames = await frames.query(
          Sessioning._isActive,
          { session },
          { active },
        );
        return frames.filter(($) => $[active] === false);
      },
      then: Actions(Fail("Invalid or expired session.")),
    })),
  }),
);

export const notificationsApi = {
  list,
  unreadCount,
  markRead,
  markAllRead,
  dismiss,
};
