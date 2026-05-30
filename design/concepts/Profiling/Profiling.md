# concept: Profiling [User]

**purpose** give each user a human-facing presence — a display name, a short biography, and an avatar — that others can read and recognize

**principle** when a user sets up a profile with a display name, bio and avatar, anyone viewing that user thereafter sees the chosen display name, bio and avatar; if the user later edits any of these, viewers see the updated values.

**state**

	a set of Users with
	  a displayName String
	  a bio String
	  an avatar String

`bio` and `avatar` may hold the empty string to indicate "not provided". Each User in this set is a user that has a profile.

**actions**

	createProfile (user: User, displayName: String): (user: User)
	  **requires** no profile exists for the given `user`
	  **effects** adds `user` to the set with the given `displayName`, an empty `bio`, and an empty `avatar`; returns `user`

	createProfile (user: User, displayName: String): (error: String)
	  **requires** a profile already exists for the given `user`
	  **effects** returns an explanatory `error`; state is unchanged

	setDisplayName (user: User, displayName: String): (user: User)
	  **requires** a profile exists for the given `user`
	  **effects** sets the displayName of `user` to `displayName`; returns `user`

	setBio (user: User, bio: String): (user: User)
	  **requires** a profile exists for the given `user`
	  **effects** sets the bio of `user` to `bio`; returns `user`

	setAvatar (user: User, avatar: String): (user: User)
	  **requires** a profile exists for the given `user`
	  **effects** sets the avatar of `user` to `avatar`; returns `user`

	deleteProfile (user: User): (user: User)
	  **requires** a profile exists for the given `user`
	  **effects** removes `user` and its displayName, bio and avatar from the state; returns `user`

	deleteProfile (user: User): (error: String)
	  **requires** no profile exists for the given `user`
	  **effects** returns an explanatory `error`; state is unchanged

**queries**

	_getProfile (user: User): (profile: {displayName: String, bio: String, avatar: String})
	  **requires** a profile exists for the given `user`
	  **effects** returns the displayName, bio and avatar of `user` as a single `profile` record

	_getDisplayName (user: User): (displayName: String)
	  **requires** a profile exists for the given `user`
	  **effects** returns the displayName of `user`

	_getByDisplayName (displayName: String): (user: User)
	  **requires** true
	  **effects** returns every User whose displayName equals `displayName`
