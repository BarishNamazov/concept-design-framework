# concept: Tagging [Target]

**purpose** classify targets with shared, reusable labels so that all targets bearing a given label can be found together

**principle** when a tag is created and applied to several targets, querying that tag yields exactly those targets; removing the tag from a target drops it from that result; the same tag can be applied across many targets, giving them a common, retrievable grouping.

**state**

	a set of Tags with
	  a name String

	a set of Targets with
	  a tags set of Tag

Invariant: tag names are unique across the set of Tags. A Target appears in the second set once it has at least one tag.

**actions**

	createTag (name: String): (tag: Tag)
	  **requires** no Tag with the given `name` exists
	  **effects** creates a fresh Tag `t` with the given `name`; returns `t` as `tag`

	createTag (name: String): (error: String)
	  **requires** a Tag with the given `name` already exists
	  **effects** returns an explanatory `error`; state is unchanged

	addTag (target: Target, tag: Tag): (target: Target)
	  **requires** the `tag` exists and is not already in the tags of `target`
	  **effects** adds `tag` to the tags of `target` (adding `target` to the set if it was absent); returns `target`

	addTag (target: Target, tag: Tag): (error: String)
	  **requires** the `tag` does not exist, or `tag` is already in the tags of `target`
	  **effects** returns an explanatory `error`; state is unchanged

	removeTag (target: Target, tag: Tag): (target: Target)
	  **requires** `tag` is in the tags of `target`
	  **effects** removes `tag` from the tags of `target` (removing `target` from the set if it now has no tags); returns `target`

	removeTag (target: Target, tag: Tag): (error: String)
	  **requires** `tag` is not in the tags of `target`
	  **effects** returns an explanatory `error`; state is unchanged

	deleteTag (tag: Tag): (tag: Tag)
	  **requires** the `tag` exists
	  **effects** removes `tag` from the tags of every Target and removes the Tag itself from the state; returns the deleted `tag`

	deleteTag (tag: Tag): (error: String)
	  **requires** the `tag` does not exist
	  **effects** returns an explanatory `error`; state is unchanged

**queries**

	_getTags (target: Target): (tag: {tag: Tag, name: String})
	  **requires** true
	  **effects** returns every Tag applied to the given `target`, each with its tag id and name

	_getTargets (tag: Tag): (target: Target)
	  **requires** true
	  **effects** returns every Target that has the given `tag`

	_getTagByName (name: String): (tag: Tag)
	  **requires** true
	  **effects** returns the Tag (zero or one) whose name equals `name`

	_getAllTags (): (tag: {tag: Tag, name: String})
	  **requires** true
	  **effects** returns every Tag with its id and name
