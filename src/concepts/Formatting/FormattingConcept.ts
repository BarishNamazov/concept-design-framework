import { collectionName } from "@utils/database.ts";
import type { ID } from "@utils/types.ts";
import { marked } from "marked";
import type { Collection, Db } from "mongodb";
import sanitizeHtml from "sanitize-html";

// Generic types of this concept.
type Target = ID;

/**
 * a set of Targets with
 *   a source String
 *   a rendered String
 *   an updatedAt DateTime
 *
 * `source` is the raw markdown; `rendered` is its sanitized HTML rendering.
 */
interface TargetDoc {
  _id: Target;
  source: string;
  rendered: string;
  updatedAt: Date;
}

/**
 * Replaces `@username` with `[@username](/u/username)` so marked renders them
 * as clickable links. Mentions inside fenced or inline code blocks are left
 * untouched.
 */
function linkMentions(source: string): string {
  const segments = source.split(/(```[\s\S]*?```|`[^`\n]+`)/g);
  return segments
    .map((seg, i) => {
      if (i % 2 === 1) return seg;
      return seg.replace(
        /(?<![a-zA-Z0-9_])@([a-zA-Z0-9_]+)\b/g,
        "[@$1](/u/$1)",
      );
    })
    .join("");
}

/** Renders raw markdown to sanitized HTML, synchronously and deterministically. */
function render(source: string): string {
  const processed = linkMentions(source);
  const html = marked.parse(processed, { async: false }) as string;
  return sanitizeHtml(html);
}

/**
 * concept: Formatting [Target]
 *
 * purpose: keep a rendered, safe-to-display version of each target's markup in
 * sync with its raw source so consumers can show formatted output without
 * re-rendering or risking unsafe content.
 */
export default class FormattingConcept {
  private readonly targets: Collection<TargetDoc>;

  constructor(
    private readonly db: Db,
    namespace = "Formatting",
  ) {
    this.targets = this.db.collection(collectionName(namespace, "targets"));
  }

  /**
   * setSource (target: Target, source: String): (target: Target, rendered: String)
   *
   * **requires** true
   *
   * **effects** renders `source` from markdown to sanitized HTML as `html`; if
   * `target` is absent, adds it; sets the source of `target` to `source`, its
   * rendered to `html`, and its `updatedAt` to the current time; returns
   * `target` and `html` as `rendered`
   */
  async setSource({
    target,
    source,
  }: {
    target: Target;
    source: string;
  }): Promise<{ target: Target; rendered: string }> {
    const rendered = render(source);
    await this.targets.updateOne(
      { _id: target },
      { $set: { source, rendered, updatedAt: new Date() } },
      { upsert: true },
    );
    return { target, rendered };
  }

  /**
   * clear (target: Target): (target: Target)
   *
   * **requires** a Target with the given id exists
   *
   * **effects** removes `target` and its source, rendered and updatedAt from
   * the state; returns `target`
   */
  async clear({
    target,
  }: {
    target: Target;
  }): Promise<{ target: Target } | { error: string }> {
    const { deletedCount } = await this.targets.deleteOne({ _id: target });
    if (deletedCount === 0) {
      return { error: "Target does not exist." };
    }
    return { target };
  }

  /**
   * _getRendered (target: Target): (rendered: String)
   *
   * **requires** a Target with the given id exists
   *
   * **effects** returns the sanitized rendered HTML of the given `target`
   */
  async _getRendered({
    target,
  }: {
    target: Target;
  }): Promise<{ rendered: string }[]> {
    const doc = await this.targets.findOne({ _id: target });
    return doc === null ? [] : [{ rendered: doc.rendered }];
  }

  /**
   * _getSource (target: Target): (source: String)
   *
   * **requires** a Target with the given id exists
   *
   * **effects** returns the raw markdown source of the given `target`
   */
  async _getSource({
    target,
  }: {
    target: Target;
  }): Promise<{ source: string }[]> {
    const doc = await this.targets.findOne({ _id: target });
    return doc === null ? [] : [{ source: doc.source }];
  }

  /**
   * _getDocument (target: Target): (document: {source: String, rendered: String, updatedAt: DateTime})
   *
   * **requires** a Target with the given id exists
   *
   * **effects** returns the source, rendered HTML and updatedAt of the given
   * `target` as a single record
   */
  async _getDocument({
    target,
  }: {
    target: Target;
  }): Promise<
    { document: { source: string; rendered: string; updatedAt: Date } }[]
  > {
    const doc = await this.targets.findOne({ _id: target });
    return doc === null
      ? []
      : [
          {
            document: {
              source: doc.source,
              rendered: doc.rendered,
              updatedAt: doc.updatedAt,
            },
          },
        ];
  }
}
