# concept: Tracking [User, Item, Scope]

**purpose** remember which items each user has already seen so that the items still new to them can be surfaced

**principle** when an item is registered in a scope it starts out unseen by every user; while a user has not marked it seen it appears among that user's unread items for the scope; once the user marks it seen it leaves the unread set; if it is marked unseen again it returns to the unread set.

**state**

	a set of Items with
	  a scope Scope
	  a createdAt DateTime

	a set of SeenMarks with
	  a user User
	  an item Item
	  a seenAt DateTime

An item is "seen" by a user iff a SeenMark exists for that (`user`, `item`) pair; otherwise it is "unread". Newly registered items have no SeenMarks and so default to unread for all users. Invariant: at most one SeenMark exists per (`user`, `item`) pair.

**actions**

	register (item: Item, scope: Scope): (item: Item)
	  **requires** the given `item` is not already registered
	  **effects** adds `item` to the set with the given `scope` and `createdAt` the current time; returns `item`

	register (item: Item, scope: Scope): (error: String)
	  **requires** the given `item` is already registered
	  **effects** returns an explanatory `error`; state is unchanged

	unregister (item: Item): (item: Item)
	  **requires** the given `item` is registered
	  **effects** removes `item` from the set and removes every SeenMark for `item`; returns `item`

	markSeen (user: User, item: Item): (item: Item)
	  **requires** the given `item` is registered and no SeenMark exists for (`user`, `item`)
	  **effects** creates a SeenMark for (`user`, `item`) with `seenAt` the current time; returns `item`

	markSeen (user: User, item: Item): (error: String)
	  **requires** the given `item` is not registered, or a SeenMark already exists for (`user`, `item`)
	  **effects** returns an explanatory `error`; state is unchanged

	markUnseen (user: User, item: Item): (item: Item)
	  **requires** a SeenMark exists for (`user`, `item`)
	  **effects** removes the SeenMark for (`user`, `item`); returns `item`

	markUnseen (user: User, item: Item): (error: String)
	  **requires** no SeenMark exists for (`user`, `item`)
	  **effects** returns an explanatory `error`; state is unchanged

	markAllSeen (user: User, scope: Scope): (user: User)
	  **requires** true
	  **effects** for every registered Item in `scope` that has no SeenMark for `user`, creates a SeenMark for (`user`, item) with `seenAt` the current time; returns `user`

**queries**

	_getUnread (user: User, scope: Scope): (item: Item)
	  **requires** true
	  **effects** returns every registered Item in `scope` for which no SeenMark exists for `user`

	_getUnreadCount (user: User, scope: Scope): (count: Number)
	  **requires** true
	  **effects** returns a single result with the number of registered Items in `scope` that have no SeenMark for `user`

	_getSeen (user: User, scope: Scope): (item: Item)
	  **requires** true
	  **effects** returns every registered Item in `scope` for which a SeenMark exists for `user`

	_isSeen (user: User, item: Item): (seen: Flag)
	  **requires** true
	  **effects** returns a single result whose `seen` is true iff a SeenMark exists for (`user`, `item`)

	_getItemsInScope (scope: Scope): (item: Item)
	  **requires** true
	  **effects** returns every registered Item whose scope is `scope`
