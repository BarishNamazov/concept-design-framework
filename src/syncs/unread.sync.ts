/**
 * Unread (Tracking) synchronizations.
 *
 * Endpoints:
 *   POST /unread/list        { session, scope } -> { items }
 *   POST /unread/count       { session, scope } -> { count }
 *   POST /unread/markSeen    { session, item }  -> { item }
 *   POST /unread/markAllSeen { session, scope } -> { user }
 */
import { Sessioning, Tracking } from "@concepts";
import type { TrackingConcept } from "@concepts";
import {
  defineFeature,
  requestingEndpoint,
  type ActionOk,
  type QueryRow,
} from "@concepts/Requesting/api.ts";

const list = requestingEndpoint("/unread/list");
const unreadCount = requestingEndpoint("/unread/count");
const markSeen = requestingEndpoint("/unread/markSeen");
const markAllSeen = requestingEndpoint("/unread/markAllSeen");

type UnreadListOutput = { items: QueryRow<TrackingConcept, "_getUnread">[] };
type UnreadCountOutput = QueryRow<TrackingConcept, "_getUnreadCount">;
type MarkSeenOutput = ActionOk<TrackingConcept, "markSeen">;
type MarkAllSeenOutput = ActionOk<TrackingConcept, "markAllSeen">;

// --- list ---

export const UnreadListResponse = list.sync((
  { request, session, scope, user, item, items },
) => ({
  when: list.actions(list.request({ session, scope }, { request })),
  where: async (frames) => {
    const [base] = frames;
    frames = await frames.query(Sessioning._getUser, { session }, { user });
    frames = await frames.query(Tracking._getUnread, { user, scope }, { item });
    return frames.aggregate(base, [item], items);
  },
  then: list.actions(list.respond<UnreadListOutput>({ request, items })),
}));

export const UnreadListInvalidSession = list.sync((
  { request, session, active },
) => ({
  when: list.actions(list.request({ session }, { request })),
  where: async (frames) => {
    frames = await frames.query(Sessioning._isActive, { session }, { active });
    return frames.filter(($) => $[active] === false);
  },
  then: list.actions(list.error({ request, error: "Invalid or expired session." })),
}));

// --- count ---

export const UnreadCountResponse = unreadCount.sync((
  { request, session, scope, user, count },
) => ({
  when: unreadCount.actions(
    unreadCount.request({ session, scope }, { request }),
  ),
  where: async (frames) => {
    frames = await frames.query(Sessioning._getUser, { session }, { user });
    return await frames.query(
      Tracking._getUnreadCount,
      { user, scope },
      { count },
    );
  },
  then: unreadCount.actions(
    unreadCount.respond<UnreadCountOutput>({ request, count }),
  ),
}));

export const UnreadCountInvalidSession = unreadCount.sync((
  { request, session, active },
) => ({
  when: unreadCount.actions(unreadCount.request({ session }, { request })),
  where: async (frames) => {
    frames = await frames.query(Sessioning._isActive, { session }, { active });
    return frames.filter(($) => $[active] === false);
  },
  then: unreadCount.actions(
    unreadCount.error({ request, error: "Invalid or expired session." }),
  ),
}));

// --- markSeen ---

export const UnreadMarkSeenRequest = markSeen.sync((
  { request, session, item, user },
) => ({
  when: markSeen.actions(markSeen.request({ session, item }, { request })),
  where: async (frames) =>
    await frames.query(Sessioning._getUser, { session }, { user }),
  then: markSeen.actions([Tracking.markSeen, { user, item }]),
}));

export const UnreadMarkSeenResponse = markSeen.sync(({ request, item }) => ({
  when: markSeen.actions(
    markSeen.request({}, { request }),
    [Tracking.markSeen, {}, { item }],
  ),
  then: markSeen.actions(markSeen.respond<MarkSeenOutput>({ request, item })),
}));

export const UnreadMarkSeenError = markSeen.sync(({ request, error }) => ({
  when: markSeen.actions(
    markSeen.request({}, { request }),
    [Tracking.markSeen, {}, { error }],
  ),
  then: markSeen.actions(markSeen.error({ request, error })),
}));

export const UnreadMarkSeenInvalidSession = markSeen.sync((
  { request, session, active },
) => ({
  when: markSeen.actions(markSeen.request({ session }, { request })),
  where: async (frames) => {
    frames = await frames.query(Sessioning._isActive, { session }, { active });
    return frames.filter(($) => $[active] === false);
  },
  then: markSeen.actions(
    markSeen.error({ request, error: "Invalid or expired session." }),
  ),
}));

// --- markAllSeen ---

export const UnreadMarkAllSeenRequest = markAllSeen.sync((
  { request, session, scope, user },
) => ({
  when: markAllSeen.actions(
    markAllSeen.request({ session, scope }, { request }),
  ),
  where: async (frames) =>
    await frames.query(Sessioning._getUser, { session }, { user }),
  then: markAllSeen.actions([Tracking.markAllSeen, { user, scope }]),
}));

export const UnreadMarkAllSeenResponse = markAllSeen.sync(({ request, user }) => ({
  when: markAllSeen.actions(
    markAllSeen.request({}, { request }),
    [Tracking.markAllSeen, {}, { user }],
  ),
  then: markAllSeen.actions(
    markAllSeen.respond<MarkAllSeenOutput>({ request, user }),
  ),
}));

export const UnreadMarkAllSeenInvalidSession = markAllSeen.sync((
  { request, session, active },
) => ({
  when: markAllSeen.actions(markAllSeen.request({ session }, { request })),
  where: async (frames) => {
    frames = await frames.query(Sessioning._isActive, { session }, { active });
    return frames.filter(($) => $[active] === false);
  },
  then: markAllSeen.actions(
    markAllSeen.error({ request, error: "Invalid or expired session." }),
  ),
}));

export const unreadApi = defineFeature({
  list: list.define({
    UnreadListResponse,
    UnreadListInvalidSession,
  }),
  count: unreadCount.define({
    UnreadCountResponse,
    UnreadCountInvalidSession,
  }),
  markSeen: markSeen.define({
    UnreadMarkSeenRequest,
    UnreadMarkSeenResponse,
    UnreadMarkSeenError,
    UnreadMarkSeenInvalidSession,
  }),
  markAllSeen: markAllSeen.define({
    UnreadMarkAllSeenRequest,
    UnreadMarkAllSeenResponse,
    UnreadMarkAllSeenInvalidSession,
  }),
});
