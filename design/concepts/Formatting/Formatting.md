# concept: Formatting [Target]

**purpose** keep a rendered, safe-to-display version of each target's markup in sync with its raw source so consumers can show formatted output without re-rendering or risking unsafe content

**principle** when a target's raw markdown source is set, a sanitized HTML rendering of it is computed and stored alongside; querying the target returns that rendering; when the source is updated, the rendering is recomputed so it always reflects the current source.

**state**

	a set of Targets with
	  a source String
	  a rendered String
	  an updatedAt DateTime

`source` is the raw markdown; `rendered` is its sanitized HTML rendering. A Target appears in this set once its source has been set at least once.

**actions**

	setSource (target: Target, source: String): (target: Target, rendered: String)
	  **requires** true
	  **effects** renders `source` from markdown to sanitized HTML as `html`; if `target` is absent, adds it; sets the source of `target` to `source`, its rendered to `html`, and its `updatedAt` to the current time; returns `target` and `html` as `rendered`

	clear (target: Target): (target: Target)
	  **requires** a Target with the given id exists
	  **effects** removes `target` and its source, rendered and updatedAt from the state; returns `target`

	clear (target: Target): (error: String)
	  **requires** no Target with the given id exists
	  **effects** returns an explanatory `error`; state is unchanged

**queries**

	_getRendered (target: Target): (rendered: String)
	  **requires** a Target with the given id exists
	  **effects** returns the sanitized rendered HTML of the given `target`

	_getSource (target: Target): (source: String)
	  **requires** a Target with the given id exists
	  **effects** returns the raw markdown source of the given `target`

	_getDocument (target: Target): (document: {source: String, rendered: String, updatedAt: DateTime})
	  **requires** a Target with the given id exists
	  **effects** returns the source, rendered HTML and updatedAt of the given `target` as a single record
