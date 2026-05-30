# concept: Posting [Author]

**purpose** let an author publish a piece of textual content that persists and can be read back, revised, or withdrawn

**principle** when an author creates a post with some content, that post can be read back with the same content and attributed to that author; if the author edits the post, reads return the new content; if the author deletes the post, it can no longer be read.

**state**

	a set of Posts with
	  an author Author
	  a content String
	  a createdAt DateTime
	  an optional editedAt DateTime

**actions**

	create (author: Author, content: String): (post: Post)
	  **requires** true
	  **effects** creates a fresh Post `p`; sets the author of `p` to `author`, its content to `content`, its `createdAt` to the current time, and leaves `editedAt` unset; returns `p` as `post`

	edit (post: Post, content: String): (post: Post)
	  **requires** a Post with the given id exists
	  **effects** sets the content of `post` to `content` and its `editedAt` to the current time; returns `post`

	edit (post: Post, content: String): (error: String)
	  **requires** no Post with the given id exists
	  **effects** returns an explanatory `error`; state is unchanged

	delete (post: Post): (post: Post)
	  **requires** a Post with the given id exists
	  **effects** removes the Post and its fields from the state; returns the deleted `post`

	delete (post: Post): (error: String)
	  **requires** no Post with the given id exists
	  **effects** returns an explanatory `error`; state is unchanged

**queries**

	_getPost (post: Post): (post: {author: Author, content: String, createdAt: DateTime, editedAt: DateTime})
	  **requires** a Post with the given id exists
	  **effects** returns the author, content, createdAt and editedAt of the given Post as a single record

	_getContent (post: Post): (content: String)
	  **requires** a Post with the given id exists
	  **effects** returns the content of the given Post

	_getByAuthor (author: Author): (post: Post)
	  **requires** true
	  **effects** returns every Post whose author is `author`

	_getAuthor (post: Post): (author: Author)
	  **requires** a Post with the given id exists
	  **effects** returns the author of the given Post

	_exists (post: Post): (exists: Flag)
	  **requires** true
	  **effects** returns a single result whose `exists` is true iff a Post with the given id exists
