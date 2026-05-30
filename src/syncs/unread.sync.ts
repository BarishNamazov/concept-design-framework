/**
 * Unread (Tracking) synchronizations.
 *
 * Endpoints:
 *   POST /unread/list        { session, scope } -> { items }
 *   POST /unread/count       { session, scope } -> { count }
 *   POST /unread/markSeen    { session, item }  -> { item }
 *   POST /unread/markAllSeen { session, scope } -> { user }
 */
import { actions, type Sync } from "@engine";
import { Requesting, Sessioning, Tracking } from "@concepts";

// --- list ---

export const UnreadListResponse: Sync = (
  { request, session, scope, user, item, items },
) => ({
  when: actions([
    Requesting.request,
    { path: "/unread/list", session, scope },
    { request },
  ]),
  where: async (frames) => {
    frames = await frames.query(Sessioning._getUser, { session }, { user });
    frames = await frames.query(Tracking._getUnread, { user, scope }, { item });
    return frames.collectAs([item], items);
  },
  then: actions([Requesting.respond, { request, items }]),
});

export const UnreadListInvalidSession: Sync = (
  { request, session, active },
) => ({
  when: actions([
    Requesting.request,
    { path: "/unread/list", session },
    { request },
  ]),
  where: async (frames) => {
    frames = await frames.query(Sessioning._isActive, { session }, { active });
    return frames.filter(($) => $[active] === false);
  },
  then: actions([
    Requesting.respond,
    { request, error: "Invalid or expired session." },
  ]),
});

// --- count ---

export const UnreadCountResponse: Sync = (
  { request, session, scope, user, count },
) => ({
  when: actions([
    Requesting.request,
    { path: "/unread/count", session, scope },
    { request },
  ]),
  where: async (frames) => {
    frames = await frames.query(Sessioning._getUser, { session }, { user });
    return await frames.query(
      Tracking._getUnreadCount,
      { user, scope },
      { count },
    );
  },
  then: actions([Requesting.respond, { request, count }]),
});

export const UnreadCountInvalidSession: Sync = (
  { request, session, active },
) => ({
  when: actions([
    Requesting.request,
    { path: "/unread/count", session },
    { request },
  ]),
  where: async (frames) => {
    frames = await frames.query(Sessioning._isActive, { session }, { active });
    return frames.filter(($) => $[active] === false);
  },
  then: actions([
    Requesting.respond,
    { request, error: "Invalid or expired session." },
  ]),
});

// --- markSeen ---

export const UnreadMarkSeenRequest: Sync = (
  { request, session, item, user },
) => ({
  when: actions([
    Requesting.request,
    { path: "/unread/markSeen", session, item },
    { request },
  ]),
  where: async (frames) =>
    await frames.query(Sessioning._getUser, { session }, { user }),
  then: actions([Tracking.markSeen, { user, item }]),
});

export const UnreadMarkSeenResponse: Sync = ({ request, item }) => ({
  when: actions(
    [Requesting.request, { path: "/unread/markSeen" }, { request }],
    [Tracking.markSeen, {}, { item }],
  ),
  then: actions([Requesting.respond, { request, item }]),
});

export const UnreadMarkSeenError: Sync = ({ request, error }) => ({
  when: actions(
    [Requesting.request, { path: "/unread/markSeen" }, { request }],
    [Tracking.markSeen, {}, { error }],
  ),
  then: actions([Requesting.respond, { request, error }]),
});

export const UnreadMarkSeenInvalidSession: Sync = (
  { request, session, active },
) => ({
  when: actions([
    Requesting.request,
    { path: "/unread/markSeen", session },
    { request },
  ]),
  where: async (frames) => {
    frames = await frames.query(Sessioning._isActive, { session }, { active });
    return frames.filter(($) => $[active] === false);
  },
  then: actions([
    Requesting.respond,
    { request, error: "Invalid or expired session." },
  ]),
});

// --- markAllSeen ---

export const UnreadMarkAllSeenRequest: Sync = (
  { request, session, scope, user },
) => ({
  when: actions([
    Requesting.request,
    { path: "/unread/markAllSeen", session, scope },
    { request },
  ]),
  where: async (frames) =>
    await frames.query(Sessioning._getUser, { session }, { user }),
  then: actions([Tracking.markAllSeen, { user, scope }]),
});

export const UnreadMarkAllSeenResponse: Sync = ({ request, user }) => ({
  when: actions(
    [Requesting.request, { path: "/unread/markAllSeen" }, { request }],
    [Tracking.markAllSeen, {}, { user }],
  ),
  then: actions([Requesting.respond, { request, user }]),
});

export const UnreadMarkAllSeenInvalidSession: Sync = (
  { request, session, active },
) => ({
  when: actions([
    Requesting.request,
    { path: "/unread/markAllSeen", session },
    { request },
  ]),
  where: async (frames) => {
    frames = await frames.query(Sessioning._isActive, { session }, { active });
    return frames.filter(($) => $[active] === false);
  },
  then: actions([
    Requesting.respond,
    { request, error: "Invalid or expired session." },
  ]),
});
