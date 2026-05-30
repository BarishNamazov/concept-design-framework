# concept: Sessioning [User]

**purpose** keep a user signed in across many requests so they need not present their credentials each time

**principle** when a user starts a session they receive a session handle; while the session is active, presenting that handle identifies them as the same user that started it; once the session is ended (or expires), presenting the handle no longer identifies anyone.

**state**

	a set of Sessions with
	  a user User
	  a createdAt DateTime
	  an optional expiresAt DateTime

A Session is active when it exists and, if it has an `expiresAt`, the current time is before `expiresAt`.

**actions**

	start (user: User): (session: Session)
	  **requires** true
	  **effects** creates a fresh Session `s`; sets the user of `s` to `user`, its `createdAt` to the current time, and leaves `expiresAt` unset; returns `s` as `session`

	startWithExpiry (user: User, expiresAt: DateTime): (session: Session)
	  **requires** `expiresAt` is after the current time
	  **effects** creates a fresh Session `s`; sets the user of `s` to `user`, its `createdAt` to the current time, and its `expiresAt` to `expiresAt`; returns `s` as `session`

	end (session: Session): (session: Session)
	  **requires** a Session with the given id exists
	  **effects** removes the Session from the state; returns the ended `session`

	end (session: Session): (error: String)
	  **requires** no Session with the given id exists
	  **effects** returns an explanatory `error`; state is unchanged

	endAllForUser (user: User): (user: User)
	  **requires** true
	  **effects** removes every Session whose user is `user`; returns `user`

	system expire (session: Session): (session: Session)
	  **requires** the Session exists, has an `expiresAt`, and the current time is at or after `expiresAt`
	  **effects** removes the Session from the state; returns the expired `session`

**queries**

	_getUser (session: Session): (user: User)
	  **requires** the Session exists and is active
	  **effects** returns the user of the given active Session (zero results if it does not exist or is not active)

	_getSessionsForUser (user: User): (session: Session)
	  **requires** true
	  **effects** returns every active Session whose user is `user`

	_isActive (session: Session): (active: Flag)
	  **requires** true
	  **effects** returns a single result whose `active` is true iff a Session with the given id exists and is active
