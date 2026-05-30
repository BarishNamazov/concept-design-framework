# concept: Conversing [Item]

**purpose** organize related items into threaded conversations so a reader can follow who replied to what

**principle** when one item starts a conversation, it becomes the root of a new thread; when another item is added as a reply to an existing item in that thread, it becomes a child of that item; reading the conversation then yields all of its items in order, and from any item one can find its direct replies and the chain of ancestors back to the root.

**state**

	a set of Conversations with
	  a root Node
	  a createdAt DateTime

	a set of Nodes with
	  a conversation Conversation
	  an item Item
	  an optional parent Node
	  a depth Number
	  a createdAt DateTime

A Node is the placement of an `item` within a conversation tree. The root Node has no `parent` and `depth` 0; every other Node's `depth` is one greater than its parent's. Each Item is placed in at most one Node (an item belongs to a single conversation).

**actions**

	start (item: Item): (conversation: Conversation, node: Node)
	  **requires** the given `item` is not already placed in any Node
	  **effects** creates a fresh Conversation `c` with `createdAt` set to the current time; creates a fresh root Node `n` with conversation `c`, the given `item`, no parent, depth 0, and `createdAt` the current time; sets the root of `c` to `n`; returns `c` as `conversation` and `n` as `node`

	start (item: Item): (error: String)
	  **requires** the given `item` is already placed in some Node
	  **effects** returns an explanatory `error`; state is unchanged

	reply (item: Item, parent: Node): (node: Node)
	  **requires** the `parent` Node exists and the given `item` is not already placed in any Node
	  **effects** creates a fresh Node `n` with the same conversation as `parent`, the given `item`, parent set to `parent`, depth one greater than `parent`'s depth, and `createdAt` the current time; returns `n` as `node`

	reply (item: Item, parent: Node): (error: String)
	  **requires** the `parent` Node does not exist, or the given `item` is already placed in some Node
	  **effects** returns an explanatory `error`; state is unchanged

	remove (node: Node): (node: Node)
	  **requires** the `node` exists and has no child Nodes (no other Node has it as parent)
	  **effects** removes `node` from the state; if `node` was the root of its Conversation and the Conversation now has no Nodes, removes the Conversation as well; returns the removed `node`

	remove (node: Node): (error: String)
	  **requires** the `node` does not exist, or some other Node has it as parent
	  **effects** returns an explanatory `error`; state is unchanged

**queries**

	_getNodeByItem (item: Item): (node: Node)
	  **requires** true
	  **effects** returns the Node (zero or one) that places the given `item`

	_getItem (node: Node): (item: Item)
	  **requires** the `node` exists
	  **effects** returns the item placed by `node`

	_getConversation (node: Node): (conversation: Conversation)
	  **requires** the `node` exists
	  **effects** returns the conversation of `node`

	_getRoot (conversation: Conversation): (node: Node)
	  **requires** the `conversation` exists
	  **effects** returns the root Node of the given conversation

	_getThread (conversation: Conversation): (node: {node: Node, item: Item, parent: Node, depth: Number})
	  **requires** the `conversation` exists
	  **effects** returns every Node in the conversation, each with its node id, item, parent and depth, ordered by `createdAt` ascending

	_getReplies (node: Node): (reply: Node)
	  **requires** the `node` exists
	  **effects** returns every Node whose parent is `node`, ordered by `createdAt` ascending

	_getParent (node: Node): (parent: Node)
	  **requires** the `node` exists
	  **effects** returns the parent of `node` (zero results for the root)

	_getAncestors (node: Node): (ancestor: Node)
	  **requires** the `node` exists
	  **effects** returns the chain of ancestor Nodes from `node`'s parent up to and including the root, ordered nearest-ancestor first
