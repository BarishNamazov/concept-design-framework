import { collectionName, freshID } from "@utils/database.ts";
import type { ID } from "@utils/types.ts";
import type { Collection, Db } from "mongodb";
import { ForumErrorCode } from "../../sdk/error-codes.ts";

// Generic types of this concept.
type Author = ID;
type Post = ID;

/**
 * a set of Posts with
 *   an author Author
 *   a content String
 *   a createdAt DateTime
 *   an optional editedAt DateTime
 */
interface PostDoc {
  _id: Post;
  author: Author;
  content: string;
  createdAt: Date;
  editedAt?: Date;
}

/**
 * concept: Posting [Author]
 *
 * purpose: let an author publish a piece of textual content that persists and
 * can be read back, revised, or withdrawn.
 */
export default class PostingConcept {
  private readonly posts: Collection<PostDoc>;

  constructor(
    private readonly db: Db,
    namespace = "Posting",
  ) {
    this.posts = this.db.collection(collectionName(namespace, "posts"));
  }

  /**
   * create (author: Author, content: String): (post: Post)
   *
   * **requires** true
   *
   * **effects** creates a fresh Post `p`; sets the author of `p` to `author`,
   * its content to `content`, its `createdAt` to the current time, and leaves
   * `editedAt` unset; returns `p` as `post`
   */
  async create({
    author,
    content,
  }: {
    author: Author;
    content: string;
  }): Promise<{ post: Post }> {
    const post = freshID() as Post;
    await this.posts.insertOne({
      _id: post,
      author,
      content,
      createdAt: new Date(),
    });
    return { post };
  }

  /**
   * edit (post: Post, content: String): (post: Post)
   *
   * **requires** a Post with the given id exists
   *
   * **effects** sets the content of `post` to `content` and its `editedAt` to
   * the current time; returns `post`
   *
   * edit (post: Post, content: String): (error: String)
   *
   * **requires** no Post with the given id exists
   *
   * **effects** returns an explanatory `error`; state is unchanged
   */
  async edit({
    post,
    content,
  }: {
    post: Post;
    content: string;
  }): Promise<{ post: Post } | { error: ForumErrorCode; detail?: string }> {
    const { matchedCount } = await this.posts.updateOne(
      { _id: post },
      { $set: { content, editedAt: new Date() } },
    );
    if (matchedCount === 0) {
      return { error: ForumErrorCode.POST_NOT_FOUND };
    }
    return { post };
  }

  /**
   * delete (post: Post): (post: Post)
   *
   * **requires** a Post with the given id exists
   *
   * **effects** removes the Post and its fields from the state; returns the
   * deleted `post`
   *
   * delete (post: Post): (error: String)
   *
   * **requires** no Post with the given id exists
   *
   * **effects** returns an explanatory `error`; state is unchanged
   */
  async delete({
    post,
  }: {
    post: Post;
  }): Promise<{ post: Post } | { error: ForumErrorCode; detail?: string }> {
    const { deletedCount } = await this.posts.deleteOne({ _id: post });
    if (deletedCount === 0) {
      return { error: ForumErrorCode.POST_NOT_FOUND };
    }
    return { post };
  }

  /**
   * _getPost (post: Post): (post: {author: Author, content: String, createdAt: DateTime, editedAt: DateTime})
   *
   * **requires** a Post with the given id exists
   *
   * **effects** returns the author, content, createdAt and editedAt of the given
   * Post as a single record
   */
  async _getPost({ post }: { post: Post }): Promise<
    {
      post: {
        author: Author;
        content: string;
        createdAt: Date;
        editedAt: Date | null;
      };
    }[]
  > {
    const doc = await this.posts.findOne({ _id: post });
    return doc === null
      ? []
      : [
          {
            post: {
              author: doc.author,
              content: doc.content,
              createdAt: doc.createdAt,
              editedAt: doc.editedAt ?? null,
            },
          },
        ];
  }

  /**
   * _getContent (post: Post): (content: String)
   *
   * **requires** a Post with the given id exists
   *
   * **effects** returns the content of the given Post
   */
  async _getContent({ post }: { post: Post }): Promise<{ content: string }[]> {
    const doc = await this.posts.findOne({ _id: post });
    return doc === null ? [] : [{ content: doc.content }];
  }

  /**
   * _getByAuthor (author: Author): (post: Post)
   *
   * **requires** true
   *
   * **effects** returns every Post whose author is `author`, newest first
   */
  async _getByAuthor({
    author,
  }: {
    author: Author;
  }): Promise<{ post: Post }[]> {
    const docs = await this.posts
      .find({ author })
      .sort({ createdAt: -1, _id: -1 })
      .toArray();
    return docs.map((doc) => ({ post: doc._id }));
  }

  /**
   * _getAuthor (post: Post): (author: Author)
   *
   * **requires** a Post with the given id exists
   *
   * **effects** returns the author of the given Post
   */
  async _getAuthor({ post }: { post: Post }): Promise<{ author: Author }[]> {
    const doc = await this.posts.findOne({ _id: post });
    return doc === null ? [] : [{ author: doc.author }];
  }

  /**
   * _exists (post: Post): (exists: Flag)
   *
   * **requires** true
   *
   * **effects** returns a single result whose `exists` is true iff a Post with
   * the given id exists
   */
  async _exists({ post }: { post: Post }): Promise<{ exists: boolean }[]> {
    const doc = await this.posts.findOne({ _id: post });
    return [{ exists: doc !== null }];
  }
}
