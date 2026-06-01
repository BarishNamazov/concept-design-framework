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
  Locking,
  Posting,
  Reacting,
  Sessioning,
  Tagging,
  Tracking,
  Trashing,
} from "@concepts";
import {
  type ActionOk,
  defineEndpoint,
  type Prettify,
  type QueryRow,
} from "@concepts/Requesting/api.ts";

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
  QueryRow<typeof Conversing, "_getThread"> & { post: PostRecord } & RenderedRow
>;

/** A single post view (`/posts/get`): the post record merged with rendered html. */
type PostView = Prettify<PostRecord & RenderedRow>;

/**
 * One entry of the `/threads/list` feed: a conversation root (Conversing's
 * `_getConversations`) enriched with the root post's record.
 */
type ConversationSummary = Prettify<
  QueryRow<typeof Conversing, "_getConversations"> & { post: PostRecord }
>;

type ThreadCreateOutput = Prettify<
  ActionOk<typeof Posting, "create"> & ActionOk<typeof Conversing, "start">
>;
type ThreadReplyOutput = Prettify<
  ActionOk<typeof Posting, "create"> & ActionOk<typeof Conversing, "reply">
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

const threadCreate = defineEndpoint(
  "/threads/create",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    ThreadCreateRequest: Sync(({ session, content, user }) => ({
      when: Actions(Request({ session, content })),
      where: async (frames) =>
        await frames.query(Sessioning._getUser, { session }, { user }),
      then: Actions([Posting.create, { author: user, content }]),
    })),

    ThreadCreateStartsConversation: Sync(({ post }) => ({
      when: Actions([Posting.create, {}, { post }]),
      then: Actions([Conversing.start, { item: post }]),
    })),

    ThreadCreateSetsSource: Sync(({ content, post }) => ({
      when: Actions(Request({ content }), [Posting.create, {}, { post }]),
      then: Actions([Formatting.setSource, { target: post, source: content }]),
    })),

    ThreadCreateRegistersUnread: Sync(({ post, conversation }) => ({
      when: Actions(
        [Posting.create, {}, { post }],
        [Conversing.start, {}, { conversation }],
      ),
      then: Actions([Tracking.register, { item: post, scope: conversation }]),
    })),

    ThreadCreateResponse: Sync(({ post, conversation, node }) => ({
      when: Actions(
        [Posting.create, {}, { post }],
        [Conversing.start, {}, { conversation, node }],
      ),
      then: Actions(
        Respond<ThreadCreateOutput>({
          post,
          conversation,
          node,
        }),
      ),
    })),

    ThreadCreateInvalidSession: Sync(({ session, active }) => ({
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

// --- threads/reply ---

const threadReply = defineEndpoint(
  "/threads/reply",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    ThreadReplyRequest: Sync(
      ({ session, content, parent, user, conversation, locked }) => ({
        when: Actions(Request({ session, content, parent })),
        where: async (frames) => {
          frames = await frames.query(
            Sessioning._getUser,
            { session },
            { user },
          );
          frames = await frames.query(
            Conversing._getConversation,
            { node: parent },
            { conversation },
          );
          frames = await frames.query(
            Locking._isLocked,
            { target: conversation },
            { locked },
          );
          return frames.filter(($) => $[locked] === false);
        },
        then: Actions([Posting.create, { author: user, content }]),
      }),
    ),

    ThreadReplyAttaches: Sync(({ parent, post }) => ({
      when: Actions(Request({ parent }), [Posting.create, {}, { post }]),
      then: Actions([Conversing.reply, { item: post, parent }]),
    })),

    ThreadReplySetsSource: Sync(({ content, post }) => ({
      when: Actions(Request({ content }), [Posting.create, {}, { post }]),
      then: Actions([Formatting.setSource, { target: post, source: content }]),
    })),

    ThreadReplyRegistersUnread: Sync(({ parent, post, conversation }) => ({
      when: Actions(Request({ parent }), [Posting.create, {}, { post }]),
      where: async (frames) =>
        await frames.query(
          Conversing._getConversation,
          { node: parent },
          { conversation },
        ),
      then: Actions([Tracking.register, { item: post, scope: conversation }]),
    })),

    ThreadReplyDerivesLinks: Sync(({ content, post, targets }) => ({
      when: Actions(Request({ content }), [Posting.create, {}, { post }]),
      where: async (frames) =>
        frames.map(($) => ({
          ...$,
          [targets]: parseLinkTargets($[content] as string),
        })),
      then: Actions([Linking.setLinks, { source: post, targets }]),
    })),

    ThreadReplyResponse: Sync(({ post, node }) => ({
      when: Actions(
        [Posting.create, {}, { post }],
        [Conversing.reply, {}, { node }],
      ),
      then: Actions(Respond<ThreadReplyOutput>({ post, node })),
    })),

    ThreadReplyInvalidSession: Sync(({ session, active }) => ({
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

    ThreadReplyLocked: Sync(
      ({ session, content, parent, user, conversation, locked }) => ({
        when: Actions(Request({ session, content, parent })),
        where: async (frames) => {
          frames = await frames.query(
            Sessioning._getUser,
            { session },
            { user },
          );
          frames = await frames.query(
            Conversing._getConversation,
            { node: parent },
            { conversation },
          );
          frames = await frames.query(
            Locking._isLocked,
            { target: conversation },
            { locked },
          );
          return frames.filter(($) => $[locked] === true);
        },
        then: Actions(Fail("This thread is locked.")),
      }),
    ),
  }),
);

// --- threads/get: assemble an ordered, enriched thread view ---

const threadGet = defineEndpoint(
  "/threads/get",
  ({ Sync, Actions, Request, Respond }) => ({
    ThreadGetResponse: Sync(
      ({
        conversation,
        node,
        item,
        parent,
        depth,
        trashed,
        post,
        rendered,
        thread,
      }) => ({
        when: Actions(Request({ conversation })),
        where: async (frames) => {
          const [base] = frames;
          frames = await frames.query(
            Conversing._getThread,
            { conversation },
            { node, item, parent, depth },
          );
          // Soft-deleted posts are hidden from the thread view.
          frames = await frames.query(
            Trashing._isTrashed,
            { item },
            { trashed },
          );
          frames = frames.filter(($) => $[trashed] === false);
          frames = await frames.query(
            Posting._getPost,
            { post: item },
            { post },
          );
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
            [thread]: ($[thread] as { post: { createdAt: Date } }[])
              .slice()
              .sort(
                (a, b) =>
                  new Date(a.post.createdAt).getTime() -
                  new Date(b.post.createdAt).getTime(),
              ),
          }));
        },
        then: Actions(Respond<ThreadGetOutput>({ thread })),
      }),
    ),
  }),
);

// --- posts/get: combine post fields with its rendered html ---

const postGet = defineEndpoint(
  "/posts/get",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    PostGetResponse: Sync(({ post, postData, rendered, trashed, result }) => ({
      when: Actions(Request({ post })),
      where: async (frames) => {
        frames = await frames.query(
          Posting._getPost,
          { post },
          { post: postData },
        );
        // A soft-deleted post reads as if it no longer exists (see PostGetTrashed).
        frames = await frames.query(
          Trashing._isTrashed,
          { item: post },
          {
            trashed,
          },
        );
        frames = frames.filter(($) => $[trashed] === false);
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
      then: Actions(Respond<PostGetOutput>({ post: result })),
    })),

    PostGetTrashed: Sync(({ post, trashed }) => ({
      when: Actions(Request({ post })),
      where: async (frames) => {
        frames = await frames.query(
          Trashing._isTrashed,
          { item: post },
          {
            trashed,
          },
        );
        return frames.filter(($) => $[trashed] === true);
      },
      then: Actions(Fail("Post not found.")),
    })),

    PostGetNotFound: Sync(({ post, exists }) => ({
      when: Actions(Request({ post })),
      where: async (frames) => {
        frames = await frames.query(Posting._exists, { post }, { exists });
        return frames.filter(($) => $[exists] === false);
      },
      then: Actions(Fail("Post not found.")),
    })),
  }),
);

// --- posts/edit (author-only) ---

const postEdit = defineEndpoint(
  "/posts/edit",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    PostEditRequest: Sync(({ session, post, content, user, author }) => ({
      when: Actions(Request({ session, post, content })),
      where: async (frames) => {
        frames = await frames.query(Sessioning._getUser, { session }, { user });
        frames = await frames.query(Posting._getAuthor, { post }, { author });
        return frames.filter(($) => $[author] === $[user]);
      },
      then: Actions([Posting.edit, { post, content }]),
    })),

    PostEditSetsSource: Sync(({ content, post }) => ({
      when: Actions(Request({ content }), [Posting.edit, {}, { post }]),
      then: Actions([Formatting.setSource, { target: post, source: content }]),
    })),

    PostEditDerivesLinks: Sync(({ content, post, targets }) => ({
      when: Actions(Request({ content }), [Posting.edit, {}, { post }]),
      where: async (frames) =>
        frames.map(($) => ({
          ...$,
          [targets]: parseLinkTargets($[content] as string),
        })),
      then: Actions([Linking.setLinks, { source: post, targets }]),
    })),

    PostEditResponse: Sync(({ post }) => ({
      when: Actions([Posting.edit, {}, { post }]),
      then: Actions(Respond<PostEditOutput>({ post })),
    })),

    PostEditNotAuthor: Sync(({ session, post, user, author }) => ({
      when: Actions(Request({ session, post })),
      where: async (frames) => {
        frames = await frames.query(Sessioning._getUser, { session }, { user });
        frames = await frames.query(Posting._getAuthor, { post }, { author });
        return frames.filter(($) => $[author] !== $[user]);
      },
      then: Actions(Fail("Not authorized to edit this post.")),
    })),

    PostEditInvalidSession: Sync(({ session, active }) => ({
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

// --- posts/delete (author-only, cascades) ---

const postDelete = defineEndpoint(
  "/posts/delete",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    PostDeleteRequest: Sync(
      ({ session, post, user, author, node, reply, replies }) => ({
        when: Actions(Request({ session, post })),
        where: async (frames) => {
          frames = await frames.query(
            Sessioning._getUser,
            { session },
            { user },
          );
          frames = await frames.query(Posting._getAuthor, { post }, { author });
          frames = frames.filter(($) => $[author] === $[user]);
          const [authored] = frames;
          if (authored === undefined) return frames;
          frames = await frames.query(
            Conversing._getNodeByItem,
            { item: post },
            { node },
          );
          frames = await frames.query(
            Conversing._getReplies,
            { node },
            { reply },
          );
          frames = frames.aggregate(authored, [reply], replies);
          return frames.filter(($) => ($[replies] as unknown[]).length === 0);
        },
        then: Actions([Posting.delete, { post }]),
      }),
    ),

    PostDeleteHasReplies: Sync(
      ({ session, post, user, author, node, reply, replies }) => ({
        when: Actions(Request({ session, post })),
        where: async (frames) => {
          frames = await frames.query(
            Sessioning._getUser,
            { session },
            { user },
          );
          frames = await frames.query(Posting._getAuthor, { post }, { author });
          frames = frames.filter(($) => $[author] === $[user]);
          const [authored] = frames;
          if (authored === undefined) return frames;
          frames = await frames.query(
            Conversing._getNodeByItem,
            { item: post },
            { node },
          );
          frames = await frames.query(
            Conversing._getReplies,
            { node },
            { reply },
          );
          frames = frames.aggregate(authored, [reply], replies);
          return frames.filter(($) => ($[replies] as unknown[]).length > 0);
        },
        then: Actions(Fail("Cannot delete a post that has replies.")),
      }),
    ),

    PostDeleteClearsFormatting: Sync(({ post }) => ({
      when: Actions([Posting.delete, {}, { post }]),
      then: Actions([Formatting.clear, { target: post }]),
    })),

    PostDeleteClearsReactions: Sync(({ post }) => ({
      when: Actions([Posting.delete, {}, { post }]),
      then: Actions([Reacting.clearTarget, { target: post }]),
    })),

    PostDeleteClearsTags: Sync(({ post }) => ({
      when: Actions([Posting.delete, {}, { post }]),
      then: Actions([Tagging.clearTarget, { target: post }]),
    })),

    PostDeleteUnregisters: Sync(({ post }) => ({
      when: Actions([Posting.delete, {}, { post }]),
      then: Actions([Tracking.unregister, { item: post }]),
    })),

    PostDeleteClearsLinks: Sync(({ post }) => ({
      when: Actions([Posting.delete, {}, { post }]),
      then: Actions([Linking.clearLinks, { source: post }]),
    })),

    PostDeleteClearsBacklinks: Sync(({ post }) => ({
      when: Actions([Posting.delete, {}, { post }]),
      then: Actions([Linking.clearBacklinks, { target: post }]),
    })),

    PostDeleteRemovesNode: Sync(({ post, node }) => ({
      when: Actions([Posting.delete, {}, { post }]),
      where: async (frames) =>
        await frames.query(Conversing._getNodeByItem, { item: post }, { node }),
      then: Actions([Conversing.remove, { node }]),
    })),

    PostDeleteResponse: Sync(({ post }) => ({
      when: Actions([Posting.delete, {}, { post }]),
      then: Actions(Respond<PostDeleteOutput>({ post })),
    })),

    PostDeleteNotAuthor: Sync(({ session, post, user, author }) => ({
      when: Actions(Request({ session, post })),
      where: async (frames) => {
        frames = await frames.query(Sessioning._getUser, { session }, { user });
        frames = await frames.query(Posting._getAuthor, { post }, { author });
        return frames.filter(($) => $[author] !== $[user]);
      },
      then: Actions(Fail("Not authorized to delete this post.")),
    })),

    PostDeleteInvalidSession: Sync(({ session, active }) => ({
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

// --- threads/list: a newest-first feed of conversation roots ---

const threadList = defineEndpoint(
  "/threads/list",
  ({ Sync, Actions, Respond }) => ({
    ThreadListResponse: Sync(
      ({
        conversation,
        root,
        item,
        createdAt,
        trashed,
        post,
        conversations,
      }) => ({
        when: Actions(),
        where: async (frames) => {
          const [base] = frames;
          frames = await frames.query(
            Conversing._getConversations,
            {},
            { conversation, root, item, createdAt },
          );
          // Hide conversations whose root post has been soft-deleted.
          frames = await frames.query(
            Trashing._isTrashed,
            { item },
            { trashed },
          );
          frames = frames.filter(($) => $[trashed] === false);
          frames = await frames.query(
            Posting._getPost,
            { post: item },
            { post },
          );
          frames = frames.aggregate(
            base,
            [conversation, root, item, createdAt, post],
            conversations,
          );
          return frames.map(($) => ({
            ...$,
            [conversations]: ($[conversations] as { createdAt: Date }[])
              .slice()
              .sort(
                (a, b) =>
                  new Date(b.createdAt).getTime() -
                  new Date(a.createdAt).getTime(),
              ),
          }));
        },
        then: Actions(Respond<ThreadListOutput>({ conversations })),
      }),
    ),
  }),
);

const postsByAuthor = defineEndpoint(
  "/posts/byAuthor",
  ({ Sync, Actions, Request, Respond }) => ({
    PostsByAuthorResponse: Sync(({ author, post, trashed, posts }) => ({
      when: Actions(Request({ author })),
      where: async (frames) => {
        const [base] = frames;
        frames = await frames.query(Posting._getByAuthor, { author }, { post });
        // Omit soft-deleted posts from the author's public post list.
        frames = await frames.query(
          Trashing._isTrashed,
          { item: post },
          { trashed },
        );
        frames = frames.filter(($) => $[trashed] === false);
        return frames.aggregate(base, [post], posts);
      },
      then: Actions(Respond<PostsByAuthorOutput>({ posts })),
    })),
  }),
);

export const threadsApi = {
  create: threadCreate,
  reply: threadReply,
  get: threadGet,
  list: threadList,
};

export const postsApi = {
  get: postGet,
  edit: postEdit,
  delete: postDelete,
  byAuthor: postsByAuthor,
};
