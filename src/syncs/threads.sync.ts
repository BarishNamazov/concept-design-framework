/**
 * Thread / post / conversation synchronizations.
 *
 * Endpoints:
 *   POST /threads/create { session, content }          -> { post, conversation, node }
 *   POST /threads/reply  { session, parent, content }   -> { post, node }
 *   POST /threads/get    { conversation }               -> { thread }
 *   POST /posts/get      { post }                       -> { post }
 *   POST /posts/edit     { session, post, content }     -> { post }
 *   POST /posts/delete   { session, post }              -> { post }
 *   POST /posts/byAuthor { author }                     -> { posts }
 */
import { actions, type Sync } from "@engine";
import {
  Conversing,
  Formatting,
  Linking,
  Posting,
  Requesting,
  Sessioning,
  Tracking,
} from "@concepts";

/** Parses `[[<id>]]` references out of post markdown into an array of ids. */
function parseLinkTargets(content: string): string[] {
  return [...content.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1]);
}

// --- threads/create ---

export const ThreadCreateRequest: Sync = (
  { request, session, content, user },
) => ({
  when: actions([
    Requesting.request,
    { path: "/threads/create", session, content },
    { request },
  ]),
  where: async (frames) =>
    await frames.query(Sessioning._getUser, { session }, { user }),
  then: actions([Posting.create, { author: user, content }]),
});

export const ThreadCreateStartsConversation: Sync = ({ request, post }) => ({
  when: actions(
    [Requesting.request, { path: "/threads/create" }, { request }],
    [Posting.create, {}, { post }],
  ),
  then: actions([Conversing.start, { item: post }]),
});

export const ThreadCreateSetsSource: Sync = ({ request, content, post }) => ({
  when: actions(
    [Requesting.request, { path: "/threads/create", content }, { request }],
    [Posting.create, {}, { post }],
  ),
  then: actions([Formatting.setSource, { target: post, source: content }]),
});

export const ThreadCreateRegistersUnread: Sync = (
  { request, post, conversation },
) => ({
  when: actions(
    [Requesting.request, { path: "/threads/create" }, { request }],
    [Posting.create, {}, { post }],
    [Conversing.start, {}, { conversation }],
  ),
  then: actions([Tracking.register, { item: post, scope: conversation }]),
});

export const ThreadCreateResponse: Sync = (
  { request, post, conversation, node },
) => ({
  when: actions(
    [Requesting.request, { path: "/threads/create" }, { request }],
    [Posting.create, {}, { post }],
    [Conversing.start, {}, { conversation, node }],
  ),
  then: actions([Requesting.respond, { request, post, conversation, node }]),
});

export const ThreadCreateInvalidSession: Sync = (
  { request, session, active },
) => ({
  when: actions([
    Requesting.request,
    { path: "/threads/create", session },
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

// --- threads/reply ---

export const ThreadReplyRequest: Sync = (
  { request, session, content, user },
) => ({
  when: actions([
    Requesting.request,
    { path: "/threads/reply", session, content },
    { request },
  ]),
  where: async (frames) =>
    await frames.query(Sessioning._getUser, { session }, { user }),
  then: actions([Posting.create, { author: user, content }]),
});

export const ThreadReplyAttaches: Sync = ({ request, parent, post }) => ({
  when: actions(
    [Requesting.request, { path: "/threads/reply", parent }, { request }],
    [Posting.create, {}, { post }],
  ),
  then: actions([Conversing.reply, { item: post, parent }]),
});

export const ThreadReplySetsSource: Sync = ({ request, content, post }) => ({
  when: actions(
    [Requesting.request, { path: "/threads/reply", content }, { request }],
    [Posting.create, {}, { post }],
  ),
  then: actions([Formatting.setSource, { target: post, source: content }]),
});

export const ThreadReplyRegistersUnread: Sync = (
  { request, parent, post, conversation },
) => ({
  when: actions(
    [Requesting.request, { path: "/threads/reply", parent }, { request }],
    [Posting.create, {}, { post }],
  ),
  where: async (frames) =>
    await frames.query(
      Conversing._getConversation,
      { node: parent },
      { conversation },
    ),
  then: actions([Tracking.register, { item: post, scope: conversation }]),
});

export const ThreadReplyDerivesLinks: Sync = (
  { request, content, post, targets },
) => ({
  when: actions(
    [Requesting.request, { path: "/threads/reply", content }, { request }],
    [Posting.create, {}, { post }],
  ),
  where: async (frames) =>
    frames.map(($) => ({
      ...$,
      [targets]: parseLinkTargets($[content] as string),
    })),
  then: actions([Linking.setLinks, { source: post, targets }]),
});

export const ThreadReplyResponse: Sync = ({ request, post, node }) => ({
  when: actions(
    [Requesting.request, { path: "/threads/reply" }, { request }],
    [Posting.create, {}, { post }],
    [Conversing.reply, {}, { node }],
  ),
  then: actions([Requesting.respond, { request, post, node }]),
});

export const ThreadReplyInvalidSession: Sync = (
  { request, session, active },
) => ({
  when: actions([
    Requesting.request,
    { path: "/threads/reply", session },
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

// --- threads/get: assemble an ordered, enriched thread view ---

export const ThreadGetResponse: Sync = (
  { request, conversation, node, item, parent, depth, post, rendered, thread },
) => ({
  when: actions([
    Requesting.request,
    { path: "/threads/get", conversation },
    { request },
  ]),
  where: async (frames) => {
    const [base] = frames;
    frames = await frames.query(
      Conversing._getThread,
      { conversation },
      { node, item, parent, depth },
    );
    frames = await frames.query(Posting._getPost, { post: item }, { post });
    frames = await frames.query(
      Formatting._getRendered,
      { target: item },
      { rendered },
    );
    frames = frames.aggregate(
      base,
      [node, item, parent, depth, post, rendered],
      thread,
    );
    return frames.map(($) => ({
      ...$,
      [thread]: ($[thread] as { post: { createdAt: Date } }[]).slice().sort(
        (a, b) =>
          new Date(a.post.createdAt).getTime() -
          new Date(b.post.createdAt).getTime(),
      ),
    }));
  },
  then: actions([Requesting.respond, { request, thread }]),
});

// --- posts/get: combine post fields with its rendered html ---

export const PostGetResponse: Sync = (
  { request, post, postData, rendered, result },
) => ({
  when: actions([
    Requesting.request,
    { path: "/posts/get", post },
    { request },
  ]),
  where: async (frames) => {
    frames = await frames.query(Posting._getPost, { post }, { post: postData });
    frames = await frames.query(
      Formatting._getRendered,
      { target: post },
      { rendered },
    );
    return frames.map(($) => ({
      ...$,
      [result]: { ...($[postData] as object), rendered: $[rendered] },
    }));
  },
  then: actions([Requesting.respond, { request, post: result }]),
});

export const PostGetNotFound: Sync = ({ request, post, exists }) => ({
  when: actions([
    Requesting.request,
    { path: "/posts/get", post },
    { request },
  ]),
  where: async (frames) => {
    frames = await frames.query(Posting._exists, { post }, { exists });
    return frames.filter(($) => $[exists] === false);
  },
  then: actions([Requesting.respond, { request, error: "Post not found." }]),
});

// --- posts/edit (author-only) ---

export const PostEditRequest: Sync = (
  { request, session, post, content, user, author },
) => ({
  when: actions([
    Requesting.request,
    { path: "/posts/edit", session, post, content },
    { request },
  ]),
  where: async (frames) => {
    frames = await frames.query(Sessioning._getUser, { session }, { user });
    frames = await frames.query(Posting._getAuthor, { post }, { author });
    return frames.filter(($) => $[author] === $[user]);
  },
  then: actions([Posting.edit, { post, content }]),
});

export const PostEditSetsSource: Sync = ({ request, content, post }) => ({
  when: actions(
    [Requesting.request, { path: "/posts/edit", content }, { request }],
    [Posting.edit, {}, { post }],
  ),
  then: actions([Formatting.setSource, { target: post, source: content }]),
});

export const PostEditDerivesLinks: Sync = (
  { request, content, post, targets },
) => ({
  when: actions(
    [Requesting.request, { path: "/posts/edit", content }, { request }],
    [Posting.edit, {}, { post }],
  ),
  where: async (frames) =>
    frames.map(($) => ({
      ...$,
      [targets]: parseLinkTargets($[content] as string),
    })),
  then: actions([Linking.setLinks, { source: post, targets }]),
});

export const PostEditResponse: Sync = ({ request, post }) => ({
  when: actions(
    [Requesting.request, { path: "/posts/edit" }, { request }],
    [Posting.edit, {}, { post }],
  ),
  then: actions([Requesting.respond, { request, post }]),
});

export const PostEditNotAuthor: Sync = (
  { request, session, post, user, author },
) => ({
  when: actions([
    Requesting.request,
    { path: "/posts/edit", session, post },
    { request },
  ]),
  where: async (frames) => {
    frames = await frames.query(Sessioning._getUser, { session }, { user });
    frames = await frames.query(Posting._getAuthor, { post }, { author });
    return frames.filter(($) => $[author] !== $[user]);
  },
  then: actions([
    Requesting.respond,
    { request, error: "Not authorized to edit this post." },
  ]),
});

export const PostEditInvalidSession: Sync = (
  { request, session, active },
) => ({
  when: actions([
    Requesting.request,
    { path: "/posts/edit", session },
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

// --- posts/delete (author-only, cascades) ---

export const PostDeleteRequest: Sync = (
  { request, session, post, user, author },
) => ({
  when: actions([
    Requesting.request,
    { path: "/posts/delete", session, post },
    { request },
  ]),
  where: async (frames) => {
    frames = await frames.query(Sessioning._getUser, { session }, { user });
    frames = await frames.query(Posting._getAuthor, { post }, { author });
    return frames.filter(($) => $[author] === $[user]);
  },
  then: actions([Posting.delete, { post }]),
});

export const PostDeleteClearsFormatting: Sync = ({ request, post }) => ({
  when: actions(
    [Requesting.request, { path: "/posts/delete" }, { request }],
    [Posting.delete, {}, { post }],
  ),
  then: actions([Formatting.clear, { target: post }]),
});

export const PostDeleteUnregisters: Sync = ({ request, post }) => ({
  when: actions(
    [Requesting.request, { path: "/posts/delete" }, { request }],
    [Posting.delete, {}, { post }],
  ),
  then: actions([Tracking.unregister, { item: post }]),
});

export const PostDeleteClearsLinks: Sync = ({ request, post }) => ({
  when: actions(
    [Requesting.request, { path: "/posts/delete" }, { request }],
    [Posting.delete, {}, { post }],
  ),
  then: actions([Linking.clearLinks, { source: post }]),
});

export const PostDeleteRemovesNode: Sync = ({ request, post, node }) => ({
  when: actions(
    [Requesting.request, { path: "/posts/delete" }, { request }],
    [Posting.delete, {}, { post }],
  ),
  where: async (frames) =>
    await frames.query(Conversing._getNodeByItem, { item: post }, { node }),
  then: actions([Conversing.remove, { node }]),
});

export const PostDeleteResponse: Sync = ({ request, post }) => ({
  when: actions(
    [Requesting.request, { path: "/posts/delete" }, { request }],
    [Posting.delete, {}, { post }],
  ),
  then: actions([Requesting.respond, { request, post }]),
});

export const PostDeleteNotAuthor: Sync = (
  { request, session, post, user, author },
) => ({
  when: actions([
    Requesting.request,
    { path: "/posts/delete", session, post },
    { request },
  ]),
  where: async (frames) => {
    frames = await frames.query(Sessioning._getUser, { session }, { user });
    frames = await frames.query(Posting._getAuthor, { post }, { author });
    return frames.filter(($) => $[author] !== $[user]);
  },
  then: actions([
    Requesting.respond,
    { request, error: "Not authorized to delete this post." },
  ]),
});

export const PostDeleteInvalidSession: Sync = (
  { request, session, active },
) => ({
  when: actions([
    Requesting.request,
    { path: "/posts/delete", session },
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

// --- posts/byAuthor: public listing ---

export const PostsByAuthorResponse: Sync = (
  { request, author, post, posts },
) => ({
  when: actions([
    Requesting.request,
    { path: "/posts/byAuthor", author },
    { request },
  ]),
  where: async (frames) => {
    const [base] = frames;
    frames = await frames.query(Posting._getByAuthor, { author }, { post });
    return frames.aggregate(base, [post], posts);
  },
  then: actions([Requesting.respond, { request, posts }]),
});
