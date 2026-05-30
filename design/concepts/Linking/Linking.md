# concept: Linking [Item]

**purpose** maintain a directed reference graph between items so that, given any item, one can find both what it points to and what points back to it

**principle** when a source item is linked to a target item, the target appears among the source's forward links and the source appears among the target's backlinks; removing the link drops it from both views; because links are directed, the graph answers "what does X reference" and "what references X" independently.

**state**

	a set of Links with
	  a source Item
	  a target Item
	  a createdAt DateTime

Invariant: at most one Link exists for a given (`source`, `target`) pair.

**actions**

	link (source: Item, target: Item): (link: Link)
	  **requires** no Link exists with the given `source` and `target`
	  **effects** creates a fresh Link `l` with the given `source` and `target`, and `createdAt` the current time; returns `l` as `link`

	link (source: Item, target: Item): (error: String)
	  **requires** a Link already exists with the given `source` and `target`
	  **effects** returns an explanatory `error`; state is unchanged

	unlink (source: Item, target: Item): (link: Link)
	  **requires** a Link exists with the given `source` and `target`
	  **effects** removes that Link from the state; returns the removed `link`

	unlink (source: Item, target: Item): (error: String)
	  **requires** no Link exists with the given `source` and `target`
	  **effects** returns an explanatory `error`; state is unchanged

	setLinks (source: Item, targets: set of Item): (source: Item)
	  **requires** true
	  **effects** replaces all Links whose source is `source` so that, afterward, there is exactly one Link from `source` to each item in `targets` and no others (links to items no longer in `targets` are removed; links to newly listed items are created with `createdAt` the current time); returns `source`

	clearLinks (source: Item): (source: Item)
	  **requires** true
	  **effects** removes every Link whose source is `source`; returns `source`

**queries**

	_getForwardLinks (source: Item): (target: Item)
	  **requires** true
	  **effects** returns the target of every Link whose source is `source`

	_getBacklinks (target: Item): (source: Item)
	  **requires** true
	  **effects** returns the source of every Link whose target is `target`

	_hasLink (source: Item, target: Item): (linked: Flag)
	  **requires** true
	  **effects** returns a single result whose `linked` is true iff a Link exists with the given `source` and `target`

	_getOutgoingCount (source: Item): (count: Number)
	  **requires** true
	  **effects** returns a single result with the number of Links whose source is `source`

	_getBacklinkCount (target: Item): (count: Number)
	  **requires** true
	  **effects** returns a single result with the number of Links whose target is `target`
