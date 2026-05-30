# concept: Authenticating

**purpose** let a person establish and later prove a persistent identity within the system

**principle** if you register with a username and a password, and later present that same username and password, you are recognized as the same user that registered; if you present a username with the wrong password, or a username that was never registered, you are not recognized.

**state**

	a set of Users with
	  a username String
	  a password String

Invariant: usernames are unique across the set of Users.

**actions**

	register (username: String, password: String): (user: User)
	  **requires** no User with the given `username` exists
	  **effects** creates a fresh User `u`; sets the username of `u` to `username` and the password of `u` to `password`; returns `u` as `user`

	register (username: String, password: String): (error: String)
	  **requires** a User with the given `username` already exists
	  **effects** returns an explanatory `error`; state is unchanged

	authenticate (username: String, password: String): (user: User)
	  **requires** a User with the given `username` exists and its password equals `password`
	  **effects** none; returns the matching User as `user`

	authenticate (username: String, password: String): (error: String)
	  **requires** no User with the given `username` exists, or the stored password does not equal `password`
	  **effects** returns an explanatory `error`; state is unchanged

	changePassword (user: User, oldPassword: String, newPassword: String): (user: User)
	  **requires** the given `user` exists and its password equals `oldPassword`
	  **effects** sets the password of `user` to `newPassword`; returns `user`

	changePassword (user: User, oldPassword: String, newPassword: String): (error: String)
	  **requires** the given `user` does not exist or its password does not equal `oldPassword`
	  **effects** returns an explanatory `error`; state is unchanged

	changeUsername (user: User, username: String): (user: User)
	  **requires** the given `user` exists and no other User has the given `username`
	  **effects** sets the username of `user` to `username`; returns `user`

	changeUsername (user: User, username: String): (error: String)
	  **requires** the given `user` does not exist, or another User already has the given `username`
	  **effects** returns an explanatory `error`; state is unchanged

	unregister (user: User): (user: User)
	  **requires** the given `user` exists
	  **effects** removes `user` and its username and password from the state; returns `user`

	unregister (user: User): (error: String)
	  **requires** the given `user` does not exist
	  **effects** returns an explanatory `error`; state is unchanged

**queries**

	_getById (user: User): (username: String)
	  **requires** the given `user` exists
	  **effects** returns the username of `user`

	_getByUsername (username: String): (user: User)
	  **requires** true
	  **effects** returns the User (zero or one) whose username equals `username`

	_existsByUsername (username: String): (exists: Flag)
	  **requires** true
	  **effects** returns a single result whose `exists` is true iff some User has the given `username`
