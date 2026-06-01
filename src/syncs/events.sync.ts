/**
 * Cross-concept event synchronizations.
 *
 * Unlike the endpoint syncs, these are *not* tied to an HTTP request: they react
 * to concept actions anywhere in the journal and fan out further actions,
 * keeping each concept independent while composing rich forum behavior.
 *
 *   NotifyOnReply         reply       -> notify the parent post's author
 *   NotifyWatchersOnReply reply       -> notify everyone subscribed to the thread
 *   NotifyOnMention       new post    -> notify each @mentioned user
 *   NotifyAcceptedAnswer  accept      -> notify the accepted answer's author
 *   RecordRevisionOnCreate create     -> snapshot the post's first revision
 *   RecordRevisionOnEdit   edit       -> snapshot the post's new revision
 *   Purge*                 purge      -> hard-delete the post and clear all of
 *                                        its formatting, reactions, tags,
 *                                        tracking, links, and conversation node
 */
import {
  Authenticating,
  Conversing,
  Formatting,
  Linking,
  Notifying,
  Posting,
  Reacting,
  Resolving,
  Revisioning,
  Subscribing,
  Tagging,
  Tracking,
  Trashing,
} from "@concepts";
import { actions, type Sync } from "@engine";

/**
 * Parses unique `@username` handles out of post markdown. Usernames match the
 * Authenticating convention of word characters; duplicates are collapsed so a
 * user mentioned twice is still notified once.
 */
function parseMentions(content: string): string[] {
  const found = [...content.matchAll(/@([a-zA-Z0-9_]+)/g)].map((m) => m[1]);
  return [...new Set(found)];
}

// --- replies ---

/** Notify the author of the parent post when someone replies beneath it. */
export const NotifyOnReply: Sync = ({
  author,
  post,
  parent,
  parentItem,
  parentAuthor,
}) => ({
  when: actions(
    [Posting.create, { author }, { post }],
    [Conversing.reply, { item: post, parent }, {}],
  ),
  where: async (frames) => {
    frames = await frames.query(
      Conversing._getItem,
      { node: parent },
      { item: parentItem },
    );
    frames = await frames.query(
      Posting._getAuthor,
      { post: parentItem },
      { author: parentAuthor },
    );
    return frames.filter(($) => $[parentAuthor] !== $[author]);
  },
  then: actions([
    Notifying.notify,
    { recipient: parentAuthor, kind: "reply", subject: post, link: post },
  ]),
});

/** Notify every user subscribed to a conversation when a new reply lands. */
export const NotifyWatchersOnReply: Sync = ({
  author,
  post,
  parent,
  conversation,
  subscriber,
}) => ({
  when: actions(
    [Posting.create, { author }, { post }],
    [Conversing.reply, { item: post, parent }, {}],
  ),
  where: async (frames) => {
    frames = await frames.query(
      Conversing._getConversation,
      { node: parent },
      { conversation },
    );
    frames = await frames.query(
      Subscribing._getSubscribers,
      { target: conversation },
      { user: subscriber },
    );
    return frames.filter(($) => $[subscriber] !== $[author]);
  },
  then: actions([
    Notifying.notify,
    { recipient: subscriber, kind: "reply", subject: post, link: post },
  ]),
});

// --- mentions ---

/** Notify each `@mentioned` user (other than the author) when a post is made. */
export const NotifyOnMention: Sync = ({
  author,
  content,
  post,
  username,
  mentioned,
}) => ({
  when: actions([Posting.create, { author, content }, { post }]),
  where: async (frames) => {
    frames = frames.flatMap(($) =>
      parseMentions($[content] as string).map((name) => ({
        ...$,
        [username]: name,
      })),
    );
    frames = await frames.query(
      Authenticating._getByUsername,
      { username },
      { user: mentioned },
    );
    return frames.filter(($) => $[mentioned] !== $[author]);
  },
  then: actions([
    Notifying.notify,
    { recipient: mentioned, kind: "mention", subject: post, link: post },
  ]),
});

// --- accepted answers ---

/** Notify the author of an answer when it is accepted (unless self-accepted). */
export const NotifyAcceptedAnswer: Sync = ({ answer, by, answerAuthor }) => ({
  when: actions([Resolving.accept, { answer, by }, {}]),
  where: async (frames) => {
    frames = await frames.query(
      Posting._getAuthor,
      { post: answer },
      { author: answerAuthor },
    );
    return frames.filter(($) => $[answerAuthor] !== $[by]);
  },
  then: actions([
    Notifying.notify,
    {
      recipient: answerAuthor,
      kind: "accepted",
      subject: answer,
      link: answer,
    },
  ]),
});

// --- revision history ---

/** Snapshot a post's content as its first revision when it is created. */
export const RecordRevisionOnCreate: Sync = ({ content, post }) => ({
  when: actions([Posting.create, { content }, { post }]),
  then: actions([Revisioning.record, { item: post, content }]),
});

/** Snapshot a post's new content as a fresh revision when it is edited. */
export const RecordRevisionOnEdit: Sync = ({ content, post }) => ({
  when: actions([Posting.edit, { content }, { post }]),
  then: actions([Revisioning.record, { item: post, content }]),
});

// --- trashing cascade: purge permanently removes a post and all its traces ---

/** Hard-delete the underlying post when a trashed item is purged. */
export const PurgeCascadeDeletesPost: Sync = ({ item }) => ({
  when: actions([Trashing.purge, {}, { item }]),
  then: actions([Posting.delete, { post: item }]),
});

/** Drop the purged item's rendered/source formatting. */
export const PurgeClearsFormatting: Sync = ({ item }) => ({
  when: actions([Trashing.purge, {}, { item }]),
  then: actions([Formatting.clear, { target: item }]),
});

/** Drop every reaction on the purged item. */
export const PurgeClearsReactions: Sync = ({ item }) => ({
  when: actions([Trashing.purge, {}, { item }]),
  then: actions([Reacting.clearTarget, { target: item }]),
});

/** Drop every tag on the purged item. */
export const PurgeClearsTags: Sync = ({ item }) => ({
  when: actions([Trashing.purge, {}, { item }]),
  then: actions([Tagging.clearTarget, { target: item }]),
});

/** Forget per-user seen/unseen state for the purged item. */
export const PurgeUnregistersTracking: Sync = ({ item }) => ({
  when: actions([Trashing.purge, {}, { item }]),
  then: actions([Tracking.unregister, { item }]),
});

/** Drop the purged item's outgoing reference links. */
export const PurgeClearsLinks: Sync = ({ item }) => ({
  when: actions([Trashing.purge, {}, { item }]),
  then: actions([Linking.clearLinks, { source: item }]),
});

/** Drop every inbound reference link pointing at the purged item. */
export const PurgeClearsBacklinks: Sync = ({ item }) => ({
  when: actions([Trashing.purge, {}, { item }]),
  then: actions([Linking.clearBacklinks, { target: item }]),
});

/** Detach the purged item's conversation node, if it has one. */
export const PurgeRemovesNode: Sync = ({ item, node }) => ({
  when: actions([Trashing.purge, {}, { item }]),
  where: async (frames) =>
    await frames.query(Conversing._getNodeByItem, { item }, { node }),
  then: actions([Conversing.remove, { node }]),
});

export const eventSyncs = {
  NotifyOnReply,
  NotifyWatchersOnReply,
  NotifyOnMention,
  NotifyAcceptedAnswer,
  RecordRevisionOnCreate,
  RecordRevisionOnEdit,
  PurgeCascadeDeletesPost,
  PurgeClearsFormatting,
  PurgeClearsReactions,
  PurgeClearsTags,
  PurgeUnregistersTracking,
  PurgeClearsLinks,
  PurgeClearsBacklinks,
  PurgeRemovesNode,
};
