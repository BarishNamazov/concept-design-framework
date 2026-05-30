# concept: Reacting [User, Target]

**purpose** let users register a lightweight, named response (such as a like or an emoji) to a target so that crowd sentiment toward that target can be gauged

**principle** when a user reacts to a target with a given kind, that reaction is recorded once; reacting again with the same kind has no further effect, so each user counts at most once per kind; when the user removes the reaction, it is no longer counted; counts of each kind on a target reflect exactly the users currently reacting with that kind.

**state**

	a set of Reactions with
	  a user User
	  a target Target
	  a kind String
	  a createdAt DateTime

Invariant: at most one Reaction exists for a given (`user`, `target`, `kind`) triple.

**actions**

	react (user: User, target: Target, kind: String): (reaction: Reaction)
	  **requires** no Reaction exists with the given `user`, `target` and `kind`
	  **effects** creates a fresh Reaction `r` with the given `user`, `target` and `kind`, and `createdAt` the current time; returns `r` as `reaction`

	react (user: User, target: Target, kind: String): (error: String)
	  **requires** a Reaction already exists with the given `user`, `target` and `kind`
	  **effects** returns an explanatory `error`; state is unchanged

	unreact (user: User, target: Target, kind: String): (reaction: Reaction)
	  **requires** a Reaction exists with the given `user`, `target` and `kind`
	  **effects** removes that Reaction from the state; returns the removed `reaction`

	unreact (user: User, target: Target, kind: String): (error: String)
	  **requires** no Reaction exists with the given `user`, `target` and `kind`
	  **effects** returns an explanatory `error`; state is unchanged

**queries**

	_getReactionsForTarget (target: Target): (reaction: {reaction: Reaction, user: User, kind: String})
	  **requires** true
	  **effects** returns every Reaction on the given `target`, each with its reaction id, user and kind

	_getReactionsByUser (user: User): (reaction: {reaction: Reaction, target: Target, kind: String})
	  **requires** true
	  **effects** returns every Reaction by the given `user`, each with its reaction id, target and kind

	_countByKind (target: Target): (kind: String, count: Number)
	  **requires** true
	  **effects** returns, for each `kind` present on the given `target`, the number of Reactions of that kind

	_hasReacted (user: User, target: Target, kind: String): (hasReacted: Flag)
	  **requires** true
	  **effects** returns a single result whose `hasReacted` is true iff a Reaction exists with the given `user`, `target` and `kind`
