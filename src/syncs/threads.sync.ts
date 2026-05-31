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
  Reacting,
  Requesting,
  Sessioning,
  Tagging,
  Tracking,
} from "@concepts";
import type {
  ConversingConcept,
  FormattingConcept,
  PostingConcept,
} from "@concepts";
import type {
  ActionOk,
  EndpointInputs,
  InputShape,
  Prettify,
  QueryRow,
} from "./contract.ts";

// --- Derived view shapes assembled by the read endpoints below ---

/** The post record `{ author, content, createdAt, editedAt }` from Posting. */
type PostRecord = QueryRow<PostingConcept, "_getPost">["post"];

/** A rendered-html row `{ rendered }` from Formatting. */
type RenderedRow = QueryRow<FormattingConcept, "_getRendered">;

/**
 * One enriched thread node, exactly as assembled by the `/threads/get` sync: the
 * Conversing node fields plus the post record and its rendered html.
 */
type ThreadNode = Prettify<
  & QueryRow<ConversingConcept, "_getThread">
  & { post: PostRecord }
  & RenderedRow
>;

/** A single post view (`/posts/get`): the post record merged with rendered html. */
type PostView = Prettify<PostRecord & RenderedRow>;

/**
 * One entry of the `/threads/list` feed: a conversation root (Conversing's
 * `_getConversations`) enriched with the root post's record.
 */
type ConversationSummary = Prettify<
  & QueryRow<ConversingConcept, "_getConversations">
  & { post: PostRecord }
>;

export const endpoints = {
  "/threads/create": { input: ["session", "content"] },
  "/threads/reply": { input: ["session", "parent", "content"] },
  "/threads/get": { input: ["conversation"] },
  "/threads/list": { input: [] },
  "/posts/get": { input: ["post"] },
  "/posts/edit": { input: ["session", "post", "content"] },
  "/posts/delete": { input: ["session", "post"] },
  "/posts/byAuthor": { input: ["author"] },
} as const satisfies EndpointInputs;

export type Endpoints = {
  "/threads/create": {
    input: InputShape<(typeof endpoints)["/threads/create"]["input"]>;
    output: Prettify<
      & ActionOk<PostingConcept, "create">
      & ActionOk<ConversingConcept, "start">
    >;
  };
  "/threads/reply": {
    input: InputShape<(typeof endpoints)["/threads/reply"]["input"]>;
    output: Prettify<
      & ActionOk<PostingConcept, "create">
      & ActionOk<ConversingConcept, "reply">
    >;
  };
  "/threads/get": {
    input: InputShape<(typeof endpoints)["/threads/get"]["input"]>;
    output: { thread: ThreadNode[] };
  };
  "/threads/list": {
    input: InputShape<(typeof endpoints)["/threads/list"]["input"]>;
    output: { conversations: ConversationSummary[] };
  };
  "/posts/get": {
    input: InputShape<(typeof endpoints)["/posts/get"]["input"]>;
    output: { post: PostView };
  };
  "/posts/edit": {
    input: InputShape<(typeof endpoints)["/posts/edit"]["input"]>;
    output: ActionOk<PostingConcept, "edit">;
  };
  "/posts/delete": {
    input: InputShape<(typeof endpoints)["/posts/delete"]["input"]>;
    output: ActionOk<PostingConcept, "delete">;
  };
  "/posts/byAuthor": {
    input: InputShape<(typeof endpoints)["/posts/byAuthor"]["input"]>;
    output: { posts: QueryRow<PostingConcept, "_getByAuthor">[] };
  };
};

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
  { request, session, post, user, author, node, reply, replies },
) => ({
  when: actions([
    Requesting.request,
    { path: "/posts/delete", session, post },
    { request },
  ]),
  where: async (frames) => {
    frames = await frames.query(Sessioning._getUser, { session }, { user });
    frames = await frames.query(Posting._getAuthor, { post }, { author });
    frames = frames.filter(($) => $[author] === $[user]);
    const [authored] = frames;
    if (authored === undefined) return frames;
    frames = await frames.query(
      Conversing._getNodeByItem,
      { item: post },
      { node },
    );
    frames = await frames.query(Conversing._getReplies, { node }, { reply });
    frames = frames.aggregate(authored, [reply], replies);
    return frames.filter(($) => ($[replies] as unknown[]).length === 0);
  },
  then: actions([Posting.delete, { post }]),
});

export const PostDeleteHasReplies: Sync = (
  { request, session, post, user, author, node, reply, replies },
) => ({
  when: actions([
    Requesting.request,
    { path: "/posts/delete", session, post },
    { request },
  ]),
  where: async (frames) => {
    frames = await frames.query(Sessioning._getUser, { session }, { user });
    frames = await frames.query(Posting._getAuthor, { post }, { author });
    frames = frames.filter(($) => $[author] === $[user]);
    const [authored] = frames;
    if (authored === undefined) return frames;
    frames = await frames.query(
      Conversing._getNodeByItem,
      { item: post },
      { node },
    );
    frames = await frames.query(Conversing._getReplies, { node }, { reply });
    frames = frames.aggregate(authored, [reply], replies);
    return frames.filter(($) => ($[replies] as unknown[]).length > 0);
  },
  then: actions([
    Requesting.respond,
    { request, error: "Cannot delete a post that has replies." },
  ]),
});

export const PostDeleteClearsFormatting: Sync = ({ request, post }) => ({
  when: actions(
    [Requesting.request, { path: "/posts/delete" }, { request }],
    [Posting.delete, {}, { post }],
  ),
  then: actions([Formatting.clear, { target: post }]),
});

export const PostDeleteClearsReactions: Sync = ({ request, post }) => ({
  when: actions(
    [Requesting.request, { path: "/posts/delete" }, { request }],
    [Posting.delete, {}, { post }],
  ),
  then: actions([Reacting.clearTarget, { target: post }]),
});

export const PostDeleteClearsTags: Sync = ({ request, post }) => ({
  when: actions(
    [Requesting.request, { path: "/posts/delete" }, { request }],
    [Posting.delete, {}, { post }],
  ),
  then: actions([Tagging.clearTarget, { target: post }]),
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

// --- threads/list: a newest-first feed of conversation roots ---

export const ThreadListResponse: Sync = (
  { request, conversation, root, item, createdAt, post, conversations },
) => ({
  when: actions([
    Requesting.request,
    { path: "/threads/list" },
    { request },
  ]),
  where: async (frames) => {
    const [base] = frames;
    frames = await frames.query(
      Conversing._getConversations,
      {},
      { conversation, root, item, createdAt },
    );
    frames = await frames.query(Posting._getPost, { post: item }, { post });
    frames = frames.aggregate(
      base,
      [conversation, root, item, createdAt, post],
      conversations,
    );
    return frames.map(($) => ({
      ...$,
      [conversations]: ($[conversations] as { createdAt: Date }[]).slice().sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    }));
  },
  then: actions([Requesting.respond, { request, conversations }]),
});

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
