/**
 * Composed loaders — the seam between the flat SDK endpoints and the richer view
 * models the UI wants to render. Each function fans out to one or more typed SDK
 * calls and folds the results into a single object, throwing {@link ForumError}
 * on any error envelope so callers (and `useQuery`) get one clean happy path.
 */
import { api, ForumError, unwrap } from "@/lib/api";
import { FORUM_CONTEXT } from "@/lib/auth";
import type {
  Category,
  ConversationSummary,
  Profile,
  RoleDetail,
  Tag,
  ThreadNode,
} from "@/lib/models";

/** Aggregate activity for one conversation, derived from its full node tree. */
export interface ThreadStats {
  replyCount: number;
  lastActivityAt: string | null;
  /** Distinct author ids in posting order (root first). */
  participants: string[];
}

/** A conversation summary plus the extras a Discourse-style row shows. */
export interface FeedTopic {
  summary: ConversationSummary;
  stats: ThreadStats;
  category: Category | null;
  tags: Tag[];
  locked: boolean;
}

function statsFromNodes(nodes: ThreadNode[]): ThreadStats {
  const participants: string[] = [];
  let last: string | null = null;
  for (const node of nodes) {
    const author = String(node.post.author);
    if (!participants.includes(author)) participants.push(author);
    const created = node.post.createdAt as unknown as string;
    if (!last || new Date(created) > new Date(last)) last = created;
  }
  return {
    replyCount: Math.max(0, nodes.length - 1),
    lastActivityAt: last,
    participants,
  };
}

/** The newest-first feed of conversation roots. */
export async function loadFeed(): Promise<ConversationSummary[]> {
  const { conversations } = unwrap(await api.threads.list({}));
  return conversations;
}

/** Full enriched thread tree for one conversation. */
export async function loadThread(conversation: string): Promise<ThreadNode[]> {
  const { thread } = unwrap(await api.threads.get({ conversation }));
  return thread;
}

/** Compute reply count / last activity / participants for a conversation. */
export async function loadThreadStats(
  conversation: string,
): Promise<ThreadStats> {
  return statsFromNodes(await loadThread(conversation));
}

/** The single category assigned to an item, if any. */
export async function loadItemCategory(item: string): Promise<Category | null> {
  const { category } = unwrap(await api.categories.forItem({ item }));
  return category[0] ?? null;
}

/** Enrich a feed row with stats, category, and lock status in parallel. */
export async function enrichTopic(
  summary: ConversationSummary,
): Promise<FeedTopic> {
  const conversation = String(summary.conversation);
  const item = String(summary.item);
  const [stats, category, tagsRes, lock] = await Promise.all([
    loadThreadStats(conversation),
    loadItemCategory(item),
    api.tags.forTarget({ target: item }),
    api.locks.isLocked({ target: conversation }),
  ]);
  return {
    summary,
    stats,
    category,
    tags: unwrap(tagsRes).tags,
    locked: !("error" in lock) && lock.locked,
  };
}

/** A user's public profile plus their post ids, for profile pages. */
export async function loadUserOverview(user: string): Promise<{
  profile: Profile;
  postIds: string[];
}> {
  const [profileRes, postsRes] = await Promise.all([
    api.profiles.get({ user }),
    api.posts.byAuthor({ author: user }),
  ]);
  const { profile } = unwrap(profileRes);
  const { posts } = unwrap(postsRes);
  return { profile, postIds: posts.map((p) => String(p.post)) };
}

/** Everything the thread page needs about a conversation, fetched in parallel. */
export interface ThreadPage {
  nodes: ThreadNode[];
  root: ThreadNode;
  /** Root post id (the "question" for resolution purposes). */
  questionId: string;
  category: Category | null;
  tags: Tag[];
  locked: boolean;
  /** Accepted answer post id, if the question is resolved. */
  acceptedAnswer: string | null;
}

export async function loadThreadPage(
  conversation: string,
): Promise<ThreadPage> {
  const nodes = await loadThread(conversation);
  const root = nodes[0];
  if (!root) throw new ForumError("Conversation not found");
  const questionId = String(root.item);
  const [category, tagsRes, lock, resolution] = await Promise.all([
    loadItemCategory(questionId),
    api.tags.forTarget({ target: questionId }),
    api.locks.isLocked({ target: conversation }),
    api.resolutions.get({ question: questionId }),
  ]);
  return {
    nodes,
    root,
    questionId,
    category,
    tags: unwrap(tagsRes).tags,
    locked: !("error" in lock) && lock.locked,
    acceptedAnswer:
      "error" in resolution
        ? null
        : resolution.resolution[0]?.answer
          ? String(resolution.resolution[0].answer)
          : null,
  };
}

/**
 * Map bare post ids to their conversation ids. Many list endpoints (bookmarks,
 * category items, tag targets, a user's posts) return only post ids, but every
 * preview should link back into its thread whether the post is a root or reply.
 */
export async function loadPostConversationIndex(
  items: string[],
): Promise<Record<string, string>> {
  const uniqueItems = [...new Set(items)];
  const entries = await Promise.all(
    uniqueItems.map(async (item) => {
      const { conversation } = unwrap(await api.threads.forItem({ item }));
      return [item, conversation ? String(conversation) : null] as const;
    }),
  );

  const index: Record<string, string> = {};
  for (const [item, conversation] of entries) {
    if (conversation) index[item] = conversation;
  }
  return index;
}

/** A user's granted roles with names and capabilities, for profile display. */
export async function loadUserRoles(user: string): Promise<RoleDetail[]> {
  const { roles } = unwrap(
    await api.roles.forUser({ user, context: FORUM_CONTEXT }),
  );
  const details = await Promise.all(
    roles.map(async (r) =>
      unwrap(await api.roles.get({ role: String(r.role) })),
    ),
  );
  return details;
}
