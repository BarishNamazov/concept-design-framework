import { collectionName, freshID } from "@utils/database.ts";
import type { ID } from "@utils/types.ts";
import type { Collection, Db } from "mongodb";

// Generic types of this concept.
type Item = ID;
type Conversation = ID;
type Node = ID;

/**
 * a set of Conversations with
 *   a root Node
 *   a createdAt DateTime
 *   a lastActivityAt DateTime
 */
interface ConversationDoc {
  _id: Conversation;
  root: Node;
  createdAt: Date;
  lastActivityAt: Date;
}

/**
 * a set of Nodes with
 *   a conversation Conversation
 *   an item Item
 *   an optional parent Node
 *   a depth Number
 *   a createdAt DateTime
 *
 * The root Node has no `parent` and `depth` 0; every other Node's `depth` is
 * one greater than its parent's. Each Item is placed in at most one Node.
 */
interface NodeDoc {
  _id: Node;
  conversation: Conversation;
  item: Item;
  parent: Node | null;
  depth: number;
  createdAt: Date;
}

/**
 * concept: Conversing [Item]
 *
 * purpose: organize related items into threaded conversations so a reader can
 * follow who replied to what.
 */
export default class ConversingConcept {
  private readonly conversations: Collection<ConversationDoc>;
  private readonly nodes: Collection<NodeDoc>;

  constructor(
    private readonly db: Db,
    namespace = "Conversing",
  ) {
    this.conversations = this.db.collection(
      collectionName(namespace, "conversations"),
    );
    this.nodes = this.db.collection(collectionName(namespace, "nodes"));
  }

  /**
   * start (item: Item): (conversation: Conversation, node: Node)
   *
   * **requires** the given `item` is not already placed in any Node
   *
   * **effects** creates a fresh Conversation `c` with `createdAt` set to the
   * current time; creates a fresh root Node `n` with conversation `c`, the
   * given `item`, no parent, depth 0, and `createdAt` the current time; sets
   * the root of `c` to `n`; returns `c` as `conversation` and `n` as `node`
   */
  async start({
    item,
  }: {
    item: Item;
  }): Promise<{ conversation: Conversation; node: Node } | { error: string }> {
    const existing = await this.nodes.findOne({ item });
    if (existing !== null) {
      return { error: "Item is already placed in a conversation." };
    }
    const now = new Date();
    const conversation = freshID() as Conversation;
    const node = freshID() as Node;
    await this.nodes.insertOne({
      _id: node,
      conversation,
      item,
      parent: null,
      depth: 0,
      createdAt: now,
    });
    await this.conversations.insertOne({
      _id: conversation,
      root: node,
      createdAt: now,
      lastActivityAt: now,
    });
    return { conversation, node };
  }

  /**
   * reply (item: Item, parent: Node): (node: Node)
   *
   * **requires** the `parent` Node exists and the given `item` is not already
   * placed in any Node
   *
   * **effects** creates a fresh Node `n` with the same conversation as
   * `parent`, the given `item`, parent set to `parent`, depth one greater than
   * `parent`'s depth, and `createdAt` the current time; returns `n` as `node`
   */
  async reply({
    item,
    parent,
  }: {
    item: Item;
    parent: Node;
  }): Promise<{ node: Node } | { error: string }> {
    const parentDoc = await this.nodes.findOne({ _id: parent });
    if (parentDoc === null) {
      return { error: "Parent node does not exist." };
    }
    const existing = await this.nodes.findOne({ item });
    if (existing !== null) {
      return { error: "Item is already placed in a conversation." };
    }
    const node = freshID() as Node;
    const now = new Date();
    await this.nodes.insertOne({
      _id: node,
      conversation: parentDoc.conversation,
      item,
      parent,
      depth: parentDoc.depth + 1,
      createdAt: now,
    });
    await this.conversations.updateOne(
      { _id: parentDoc.conversation },
      { $set: { lastActivityAt: now } },
    );
    return { node };
  }

  /**
   * remove (node: Node): (node: Node)
   *
   * **requires** the `node` exists and has no child Nodes (no other Node has it
   * as parent)
   *
   * **effects** removes `node` from the state; if `node` was the root of its
   * Conversation and the Conversation now has no Nodes, removes the
   * Conversation as well; returns the removed `node`
   */
  async remove({
    node,
  }: {
    node: Node;
  }): Promise<{ node: Node } | { error: string }> {
    const doc = await this.nodes.findOne({ _id: node });
    if (doc === null) {
      return { error: "Node does not exist." };
    }
    const child = await this.nodes.findOne({ parent: node });
    if (child !== null) {
      return { error: "Cannot remove a node that has children." };
    }
    await this.nodes.deleteOne({ _id: node });
    const remaining = await this.nodes.findOne({
      conversation: doc.conversation,
    });
    if (remaining === null) {
      await this.conversations.deleteOne({ _id: doc.conversation });
    }
    return { node };
  }

  /**
   * _getConversations (): (conversation: {conversation: Conversation, root: Node, item: Item, createdAt: DateTime, lastActivityAt: DateTime})
   *
   * **requires** true
   *
   * **effects** returns every Conversation with its id, its root Node, the Item
   * placed at the root, its `createdAt`, and its `lastActivityAt` (defaulting to
   * `createdAt` when absent), ordered by `createdAt` descending (newest first)
   */
  async _getConversations(): Promise<
    {
      conversation: Conversation;
      root: Node;
      item: Item;
      createdAt: Date;
      lastActivityAt: Date;
    }[]
  > {
    const convos = await this.conversations
      .find({})
      .sort({ createdAt: -1, _id: -1 })
      .toArray();
    const roots = await this.nodes
      .find({
        _id: { $in: convos.map((c) => c.root) },
      })
      .toArray();
    const itemByNode = new Map(roots.map((n) => [n._id, n.item]));
    return convos.map((c) => ({
      conversation: c._id,
      root: c.root,
      item: itemByNode.get(c.root) as Item,
      createdAt: c.createdAt,
      lastActivityAt: c.lastActivityAt ?? c.createdAt,
    }));
  }

  /**
   * _getConversationsByLastActivity (): (conversation: {conversation: Conversation, root: Node, item: Item, createdAt: DateTime, lastActivityAt: DateTime})
   *
   * **requires** true
   *
   * **effects** returns every Conversation with its id, its root Node, the Item
   * placed at the root, its `createdAt`, and its `lastActivityAt` (defaulting to
   * `createdAt` when absent), ordered by `lastActivityAt` descending (most
   * recently active first)
   */
  async _getConversationsByLastActivity(): Promise<
    {
      conversation: Conversation;
      root: Node;
      item: Item;
      createdAt: Date;
      lastActivityAt: Date;
    }[]
  > {
    const convos = await this.conversations
      .find({})
      .sort({ lastActivityAt: -1, _id: -1 })
      .toArray();
    const roots = await this.nodes
      .find({
        _id: { $in: convos.map((c) => c.root) },
      })
      .toArray();
    const itemByNode = new Map(roots.map((n) => [n._id, n.item]));
    return convos.map((c) => ({
      conversation: c._id,
      root: c.root,
      item: itemByNode.get(c.root) as Item,
      createdAt: c.createdAt,
      lastActivityAt: c.lastActivityAt ?? c.createdAt,
    }));
  }

  /**
   * _getNodeByItem (item: Item): (node: Node)
   *
   * **requires** true
   *
   * **effects** returns the Node (zero or one) that places the given `item`
   */
  async _getNodeByItem({ item }: { item: Item }): Promise<{ node: Node }[]> {
    const doc = await this.nodes.findOne({ item });
    return doc === null ? [] : [{ node: doc._id }];
  }

  /**
   * _getItem (node: Node): (item: Item)
   *
   * **requires** the `node` exists
   *
   * **effects** returns the item placed by `node`
   */
  async _getItem({ node }: { node: Node }): Promise<{ item: Item }[]> {
    const doc = await this.nodes.findOne({ _id: node });
    return doc === null ? [] : [{ item: doc.item }];
  }

  /**
   * _getConversation (node: Node): (conversation: Conversation)
   *
   * **requires** the `node` exists
   *
   * **effects** returns the conversation of `node`
   */
  async _getConversation({
    node,
  }: {
    node: Node;
  }): Promise<{ conversation: Conversation }[]> {
    const doc = await this.nodes.findOne({ _id: node });
    return doc === null ? [] : [{ conversation: doc.conversation }];
  }

  /**
   * _getRoot (conversation: Conversation): (node: Node)
   *
   * **requires** the `conversation` exists
   *
   * **effects** returns the root Node of the given conversation
   */
  async _getRoot({
    conversation,
  }: {
    conversation: Conversation;
  }): Promise<{ node: Node }[]> {
    const doc = await this.conversations.findOne({ _id: conversation });
    return doc === null ? [] : [{ node: doc.root }];
  }

  /**
   * _getThread (conversation: Conversation): (node: {node: Node, item: Item, parent: Node, depth: Number})
   *
   * **requires** the `conversation` exists
   *
   * **effects** returns every Node in the conversation, each with its node id,
   * item, parent and depth, ordered by `createdAt` ascending
   */
  async _getThread({
    conversation,
  }: {
    conversation: Conversation;
  }): Promise<
    { node: Node; item: Item; parent: Node | null; depth: number }[]
  > {
    const docs = await this.nodes
      .find({ conversation })
      .sort({ createdAt: 1, _id: 1 })
      .toArray();
    return docs.map((d) => ({
      node: d._id,
      item: d.item,
      parent: d.parent,
      depth: d.depth,
    }));
  }

  /**
   * _getReplies (node: Node): (reply: Node)
   *
   * **requires** the `node` exists
   *
   * **effects** returns every Node whose parent is `node`, ordered by
   * `createdAt` ascending
   */
  async _getReplies({ node }: { node: Node }): Promise<{ reply: Node }[]> {
    const docs = await this.nodes
      .find({ parent: node })
      .sort({ createdAt: 1, _id: 1 })
      .toArray();
    return docs.map((d) => ({ reply: d._id }));
  }

  /**
   * _getParent (node: Node): (parent: Node)
   *
   * **requires** the `node` exists
   *
   * **effects** returns the parent of `node` (zero results for the root)
   */
  async _getParent({ node }: { node: Node }): Promise<{ parent: Node }[]> {
    const doc = await this.nodes.findOne({ _id: node });
    return doc === null || doc.parent === null ? [] : [{ parent: doc.parent }];
  }

  /**
   * _getAncestors (node: Node): (ancestor: Node)
   *
   * **requires** the `node` exists
   *
   * **effects** returns the chain of ancestor Nodes from `node`'s parent up to
   * and including the root, ordered nearest-ancestor first
   */
  async _getAncestors({ node }: { node: Node }): Promise<{ ancestor: Node }[]> {
    const ancestors: { ancestor: Node }[] = [];
    let current = await this.nodes.findOne({ _id: node });
    while (current !== null && current.parent !== null) {
      const parent: Node = current.parent;
      ancestors.push({ ancestor: parent });
      current = await this.nodes.findOne({ _id: parent });
    }
    return ancestors;
  }
}
