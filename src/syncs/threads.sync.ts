/**
 * Thread / post / conversation synchronizations.
 *
 * Endpoints:
 *   POST /threads/create { session, content }          -> { post, conversation, node }
 *   POST /threads/reply  { session, parent, content }   -> { post, node }
 *   POST /threads/get    { conversation }               -> { thread }
 *   POST /threads/list   {}                              -> { conversations }
 *   POST /posts/get      { post }                       -> { post }
 *   POST /posts/edit     { session, post, content }     -> { post }
 *   POST /posts/delete   { session, post }              -> { post }
 *   POST /posts/byAuthor { author }                     -> { posts }
 */
import {
  Conversing,
  Formatting,
  Linking,
  Posting,
  Reacting,
  Sessioning,
  Tagging,
  Tracking,
} from "@concepts";
import {
  defineFeature,
  requestingEndpoint,
  type ActionOk,
  type Prettify,
  type QueryRow,
} from "@concepts/Requesting/api.ts";

const threadCreate = requestingEndpoint("/threads/create");
const threadReply = requestingEndpoint("/threads/reply");
const threadGet = requestingEndpoint("/threads/get");
const threadList = requestingEndpoint("/threads/list");
const postGet = requestingEndpoint("/posts/get");
const postEdit = requestingEndpoint("/posts/edit");
const postDelete = requestingEndpoint("/posts/delete");
const postsByAuthor = requestingEndpoint("/posts/byAuthor");

// --- Derived view shapes assembled by the read endpoints below ---

/** The post record `{ author, content, createdAt, editedAt }` from Posting. */
type PostRecord = QueryRow<typeof Posting, "_getPost">["post"];

/** A rendered-html row `{ rendered }` from Formatting. */
type RenderedRow = QueryRow<typeof Formatting, "_getRendered">;

/**
 * One enriched thread node, exactly as assembled by the `/threads/get` sync: the
 * Conversing node fields plus the post record and its rendered html.
 */
type ThreadNode = Prettify<
  & QueryRow<typeof Conversing, "_getThread">
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
  & QueryRow<typeof Conversing, "_getConversations">
  & { post: PostRecord }
>;

type ThreadCreateOutput = Prettify<
  & ActionOk<typeof Posting, "create">
  & ActionOk<typeof Conversing, "start">
>;
type ThreadReplyOutput = Prettify<
  & ActionOk<typeof Posting, "create">
  & ActionOk<typeof Conversing, "reply">
>;
type ThreadGetOutput = { thread: ThreadNode[] };
type ThreadListOutput = { conversations: ConversationSummary[] };
type PostGetOutput = { post: PostView };
type PostEditOutput = ActionOk<typeof Posting, "edit">;
type PostDeleteOutput = ActionOk<typeof Posting, "delete">;
type PostsByAuthorOutput = {
  posts: QueryRow<typeof Posting, "_getByAuthor">[];
};

/** Parses `[[<id>]]` references out of post markdown into an array of ids. */
function parseLinkTargets(content: string): string[] {
  return [...content.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1]);
}

// --- threads/create ---

export const ThreadCreateRequest = threadCreate.sync((
  { request, session, content, user },
) => ({
  when: threadCreate.actions(
    threadCreate.request({ session, content }, { request }),
  ),
  where: async (frames) =>
    await frames.query(Sessioning._getUser, { session }, { user }),
  then: threadCreate.actions([Posting.create, { author: user, content }]),
}));

export const ThreadCreateStartsConversation = threadCreate.sync(({ request, post }) => ({
  when: threadCreate.actions(
    threadCreate.request({}, { request }),
    [Posting.create, {}, { post }],
  ),
  then: threadCreate.actions([Conversing.start, { item: post }]),
}));

export const ThreadCreateSetsSource = threadCreate.sync(({ request, content, post }) => ({
  when: threadCreate.actions(
    threadCreate.request({ content }, { request }),
    [Posting.create, {}, { post }],
  ),
  then: threadCreate.actions([
    Formatting.setSource,
    { target: post, source: content },
  ]),
}));

export const ThreadCreateRegistersUnread = threadCreate.sync((
  { request, post, conversation },
) => ({
  when: threadCreate.actions(
    threadCreate.request({}, { request }),
    [Posting.create, {}, { post }],
    [Conversing.start, {}, { conversation }],
  ),
  then: threadCreate.actions([
    Tracking.register,
    { item: post, scope: conversation },
  ]),
}));

export const ThreadCreateResponse = threadCreate.sync((
  { request, post, conversation, node },
) => ({
  when: threadCreate.actions(
    threadCreate.request({}, { request }),
    [Posting.create, {}, { post }],
    [Conversing.start, {}, { conversation, node }],
  ),
  then: threadCreate.actions(
    threadCreate.respond<ThreadCreateOutput>({
      request,
      post,
      conversation,
      node,
    }),
  ),
}));

export const ThreadCreateInvalidSession = threadCreate.sync((
  { request, session, active },
) => ({
  when: threadCreate.actions(threadCreate.request({ session }, { request })),
  where: async (frames) => {
    frames = await frames.query(Sessioning._isActive, { session }, { active });
    return frames.filter(($) => $[active] === false);
  },
  then: threadCreate.actions(
    threadCreate.error({ request, error: "Invalid or expired session." }),
  ),
}));

// --- threads/reply ---

export const ThreadReplyRequest = threadReply.sync((
  { request, session, content, user },
) => ({
  when: threadReply.actions(
    threadReply.request({ session, content }, { request }),
  ),
  where: async (frames) =>
    await frames.query(Sessioning._getUser, { session }, { user }),
  then: threadReply.actions([Posting.create, { author: user, content }]),
}));

export const ThreadReplyAttaches = threadReply.sync(({ request, parent, post }) => ({
  when: threadReply.actions(
    threadReply.request({ parent }, { request }),
    [Posting.create, {}, { post }],
  ),
  then: threadReply.actions([Conversing.reply, { item: post, parent }]),
}));

export const ThreadReplySetsSource = threadReply.sync(({ request, content, post }) => ({
  when: threadReply.actions(
    threadReply.request({ content }, { request }),
    [Posting.create, {}, { post }],
  ),
  then: threadReply.actions([
    Formatting.setSource,
    { target: post, source: content },
  ]),
}));

export const ThreadReplyRegistersUnread = threadReply.sync((
  { request, parent, post, conversation },
) => ({
  when: threadReply.actions(
    threadReply.request({ parent }, { request }),
    [Posting.create, {}, { post }],
  ),
  where: async (frames) =>
    await frames.query(
      Conversing._getConversation,
      { node: parent },
      { conversation },
    ),
  then: threadReply.actions([
    Tracking.register,
    { item: post, scope: conversation },
  ]),
}));

export const ThreadReplyDerivesLinks = threadReply.sync((
  { request, content, post, targets },
) => ({
  when: threadReply.actions(
    threadReply.request({ content }, { request }),
    [Posting.create, {}, { post }],
  ),
  where: async (frames) =>
    frames.map(($) => ({
      ...$,
      [targets]: parseLinkTargets($[content] as string),
    })),
  then: threadReply.actions([Linking.setLinks, { source: post, targets }]),
}));

export const ThreadReplyResponse = threadReply.sync(({ request, post, node }) => ({
  when: threadReply.actions(
    threadReply.request({}, { request }),
    [Posting.create, {}, { post }],
    [Conversing.reply, {}, { node }],
  ),
  then: threadReply.actions(
    threadReply.respond<ThreadReplyOutput>({ request, post, node }),
  ),
}));

export const ThreadReplyInvalidSession = threadReply.sync((
  { request, session, active },
) => ({
  when: threadReply.actions(threadReply.request({ session }, { request })),
  where: async (frames) => {
    frames = await frames.query(Sessioning._isActive, { session }, { active });
    return frames.filter(($) => $[active] === false);
  },
  then: threadReply.actions(
    threadReply.error({ request, error: "Invalid or expired session." }),
  ),
}));

// --- threads/get: assemble an ordered, enriched thread view ---

export const ThreadGetResponse = threadGet.sync((
  { request, conversation, node, item, parent, depth, post, rendered, thread },
) => ({
  when: threadGet.actions(threadGet.request({ conversation }, { request })),
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
  then: threadGet.actions(
    threadGet.respond<ThreadGetOutput>({ request, thread }),
  ),
}));

// --- posts/get: combine post fields with its rendered html ---

export const PostGetResponse = postGet.sync((
  { request, post, postData, rendered, result },
) => ({
  when: postGet.actions(postGet.request({ post }, { request })),
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
  then: postGet.actions(
    postGet.respond<PostGetOutput>({ request, post: result }),
  ),
}));

export const PostGetNotFound = postGet.sync(({ request, post, exists }) => ({
  when: postGet.actions(postGet.request({ post }, { request })),
  where: async (frames) => {
    frames = await frames.query(Posting._exists, { post }, { exists });
    return frames.filter(($) => $[exists] === false);
  },
  then: postGet.actions(postGet.error({ request, error: "Post not found." })),
}));

// --- posts/edit (author-only) ---

export const PostEditRequest = postEdit.sync((
  { request, session, post, content, user, author },
) => ({
  when: postEdit.actions(
    postEdit.request({ session, post, content }, { request }),
  ),
  where: async (frames) => {
    frames = await frames.query(Sessioning._getUser, { session }, { user });
    frames = await frames.query(Posting._getAuthor, { post }, { author });
    return frames.filter(($) => $[author] === $[user]);
  },
  then: postEdit.actions([Posting.edit, { post, content }]),
}));

export const PostEditSetsSource = postEdit.sync(({ request, content, post }) => ({
  when: postEdit.actions(
    postEdit.request({ content }, { request }),
    [Posting.edit, {}, { post }],
  ),
  then: postEdit.actions([
    Formatting.setSource,
    { target: post, source: content },
  ]),
}));

export const PostEditDerivesLinks = postEdit.sync((
  { request, content, post, targets },
) => ({
  when: postEdit.actions(
    postEdit.request({ content }, { request }),
    [Posting.edit, {}, { post }],
  ),
  where: async (frames) =>
    frames.map(($) => ({
      ...$,
      [targets]: parseLinkTargets($[content] as string),
    })),
  then: postEdit.actions([Linking.setLinks, { source: post, targets }]),
}));

export const PostEditResponse = postEdit.sync(({ request, post }) => ({
  when: postEdit.actions(
    postEdit.request({}, { request }),
    [Posting.edit, {}, { post }],
  ),
  then: postEdit.actions(postEdit.respond<PostEditOutput>({ request, post })),
}));

export const PostEditNotAuthor = postEdit.sync((
  { request, session, post, user, author },
) => ({
  when: postEdit.actions(postEdit.request({ session, post }, { request })),
  where: async (frames) => {
    frames = await frames.query(Sessioning._getUser, { session }, { user });
    frames = await frames.query(Posting._getAuthor, { post }, { author });
    return frames.filter(($) => $[author] !== $[user]);
  },
  then: postEdit.actions(
    postEdit.error({ request, error: "Not authorized to edit this post." }),
  ),
}));

export const PostEditInvalidSession = postEdit.sync((
  { request, session, active },
) => ({
  when: postEdit.actions(postEdit.request({ session }, { request })),
  where: async (frames) => {
    frames = await frames.query(Sessioning._isActive, { session }, { active });
    return frames.filter(($) => $[active] === false);
  },
  then: postEdit.actions(
    postEdit.error({ request, error: "Invalid or expired session." }),
  ),
}));

// --- posts/delete (author-only, cascades) ---

export const PostDeleteRequest = postDelete.sync((
  { request, session, post, user, author, node, reply, replies },
) => ({
  when: postDelete.actions(postDelete.request({ session, post }, { request })),
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
  then: postDelete.actions([Posting.delete, { post }]),
}));

export const PostDeleteHasReplies = postDelete.sync((
  { request, session, post, user, author, node, reply, replies },
) => ({
  when: postDelete.actions(postDelete.request({ session, post }, { request })),
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
  then: postDelete.actions(
    postDelete.error({
      request,
      error: "Cannot delete a post that has replies.",
    }),
  ),
}));

export const PostDeleteClearsFormatting = postDelete.sync(({ request, post }) => ({
  when: postDelete.actions(
    postDelete.request({}, { request }),
    [Posting.delete, {}, { post }],
  ),
  then: postDelete.actions([Formatting.clear, { target: post }]),
}));

export const PostDeleteClearsReactions = postDelete.sync(({ request, post }) => ({
  when: postDelete.actions(
    postDelete.request({}, { request }),
    [Posting.delete, {}, { post }],
  ),
  then: postDelete.actions([Reacting.clearTarget, { target: post }]),
}));

export const PostDeleteClearsTags = postDelete.sync(({ request, post }) => ({
  when: postDelete.actions(
    postDelete.request({}, { request }),
    [Posting.delete, {}, { post }],
  ),
  then: postDelete.actions([Tagging.clearTarget, { target: post }]),
}));

export const PostDeleteUnregisters = postDelete.sync(({ request, post }) => ({
  when: postDelete.actions(
    postDelete.request({}, { request }),
    [Posting.delete, {}, { post }],
  ),
  then: postDelete.actions([Tracking.unregister, { item: post }]),
}));

export const PostDeleteClearsLinks = postDelete.sync(({ request, post }) => ({
  when: postDelete.actions(
    postDelete.request({}, { request }),
    [Posting.delete, {}, { post }],
  ),
  then: postDelete.actions([Linking.clearLinks, { source: post }]),
}));

export const PostDeleteRemovesNode = postDelete.sync(({ request, post, node }) => ({
  when: postDelete.actions(
    postDelete.request({}, { request }),
    [Posting.delete, {}, { post }],
  ),
  where: async (frames) =>
    await frames.query(Conversing._getNodeByItem, { item: post }, { node }),
  then: postDelete.actions([Conversing.remove, { node }]),
}));

export const PostDeleteResponse = postDelete.sync(({ request, post }) => ({
  when: postDelete.actions(
    postDelete.request({}, { request }),
    [Posting.delete, {}, { post }],
  ),
  then: postDelete.actions(
    postDelete.respond<PostDeleteOutput>({ request, post }),
  ),
}));

export const PostDeleteNotAuthor = postDelete.sync((
  { request, session, post, user, author },
) => ({
  when: postDelete.actions(postDelete.request({ session, post }, { request })),
  where: async (frames) => {
    frames = await frames.query(Sessioning._getUser, { session }, { user });
    frames = await frames.query(Posting._getAuthor, { post }, { author });
    return frames.filter(($) => $[author] !== $[user]);
  },
  then: postDelete.actions(
    postDelete.error({ request, error: "Not authorized to delete this post." }),
  ),
}));

export const PostDeleteInvalidSession = postDelete.sync((
  { request, session, active },
) => ({
  when: postDelete.actions(postDelete.request({ session }, { request })),
  where: async (frames) => {
    frames = await frames.query(Sessioning._isActive, { session }, { active });
    return frames.filter(($) => $[active] === false);
  },
  then: postDelete.actions(
    postDelete.error({ request, error: "Invalid or expired session." }),
  ),
}));

// --- threads/list: a newest-first feed of conversation roots ---

export const ThreadListResponse = threadList.sync((
  { request, conversation, root, item, createdAt, post, conversations },
) => ({
  when: threadList.actions(threadList.request({}, { request })),
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
  then: threadList.actions(
    threadList.respond<ThreadListOutput>({ request, conversations }),
  ),
}));

export const PostsByAuthorResponse = postsByAuthor.sync((
  { request, author, post, posts },
) => ({
  when: postsByAuthor.actions(postsByAuthor.request({ author }, { request })),
  where: async (frames) => {
    const [base] = frames;
    frames = await frames.query(Posting._getByAuthor, { author }, { post });
    return frames.aggregate(base, [post], posts);
  },
  then: postsByAuthor.actions(
    postsByAuthor.respond<PostsByAuthorOutput>({ request, posts }),
  ),
}));

export const threadsApi = defineFeature({
  create: threadCreate.define({
    ThreadCreateRequest,
    ThreadCreateStartsConversation,
    ThreadCreateSetsSource,
    ThreadCreateRegistersUnread,
    ThreadCreateResponse,
    ThreadCreateInvalidSession,
  }),
  reply: threadReply.define({
    ThreadReplyRequest,
    ThreadReplyAttaches,
    ThreadReplySetsSource,
    ThreadReplyRegistersUnread,
    ThreadReplyDerivesLinks,
    ThreadReplyResponse,
    ThreadReplyInvalidSession,
  }),
  get: threadGet.define({ ThreadGetResponse }),
  list: threadList.define({ ThreadListResponse }),
});

export const postsApi = defineFeature({
  get: postGet.define({
    PostGetResponse,
    PostGetNotFound,
  }),
  edit: postEdit.define({
    PostEditRequest,
    PostEditSetsSource,
    PostEditDerivesLinks,
    PostEditResponse,
    PostEditNotAuthor,
    PostEditInvalidSession,
  }),
  delete: postDelete.define({
    PostDeleteRequest,
    PostDeleteHasReplies,
    PostDeleteClearsFormatting,
    PostDeleteClearsReactions,
    PostDeleteClearsTags,
    PostDeleteUnregisters,
    PostDeleteClearsLinks,
    PostDeleteRemovesNode,
    PostDeleteResponse,
    PostDeleteNotAuthor,
    PostDeleteInvalidSession,
  }),
  byAuthor: postsByAuthor.define({ PostsByAuthorResponse }),
});
