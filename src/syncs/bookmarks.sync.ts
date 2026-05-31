/**
 * Bookmark synchronizations.
 *
 * Endpoints:
 *   POST /bookmarks/save    { session, item } -> { bookmark }
 *   POST /bookmarks/unsave  { session, item } -> { bookmark }
 *   POST /bookmarks/list    { session }       -> { bookmarks }
 *   POST /bookmarks/isSaved { session, item } -> { saved }
 */
import { Bookmarking, Sessioning } from "@concepts";
import {
  type ActionOk,
  defineEndpoint,
  type QueryRow,
} from "@concepts/Requesting/api.ts";

type BookmarkSaveOutput = ActionOk<typeof Bookmarking, "save">;
type BookmarkUnsaveOutput = ActionOk<typeof Bookmarking, "unsave">;
type BookmarkListOutput = {
  bookmarks: QueryRow<typeof Bookmarking, "_getSaved">[];
};
type BookmarkIsSavedOutput = QueryRow<typeof Bookmarking, "_isSaved">;

// --- save ---

const save = defineEndpoint(
  "/bookmarks/save",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    BookmarkSaveRequest: Sync(({ session, item, user }) => ({
      when: Actions(Request({ session, item })),
      where: async (frames) =>
        await frames.query(Sessioning._getUser, { session }, { user }),
      then: Actions([Bookmarking.save, { user, item }]),
    })),

    BookmarkSaveResponse: Sync(({ bookmark }) => ({
      when: Actions([Bookmarking.save, {}, { bookmark }]),
      then: Actions(Respond<BookmarkSaveOutput>({ bookmark })),
    })),

    BookmarkSaveError: Sync(({ error }) => ({
      when: Actions([Bookmarking.save, {}, { error }]),
      then: Actions(Fail(error)),
    })),

    BookmarkSaveInvalidSession: Sync(({ session, active }) => ({
      when: Actions(Request({ session })),
      where: async (frames) => {
        frames = await frames.query(
          Sessioning._isActive,
          { session },
          { active },
        );
        return frames.filter(($) => $[active] === false);
      },
      then: Actions(Fail("Invalid or expired session.")),
    })),
  }),
);

// --- unsave ---

const unsave = defineEndpoint(
  "/bookmarks/unsave",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    BookmarkUnsaveRequest: Sync(({ session, item, user }) => ({
      when: Actions(Request({ session, item })),
      where: async (frames) =>
        await frames.query(Sessioning._getUser, { session }, { user }),
      then: Actions([Bookmarking.unsave, { user, item }]),
    })),

    BookmarkUnsaveResponse: Sync(({ bookmark }) => ({
      when: Actions([Bookmarking.unsave, {}, { bookmark }]),
      then: Actions(Respond<BookmarkUnsaveOutput>({ bookmark })),
    })),

    BookmarkUnsaveError: Sync(({ error }) => ({
      when: Actions([Bookmarking.unsave, {}, { error }]),
      then: Actions(Fail(error)),
    })),

    BookmarkUnsaveInvalidSession: Sync(({ session, active }) => ({
      when: Actions(Request({ session })),
      where: async (frames) => {
        frames = await frames.query(
          Sessioning._isActive,
          { session },
          { active },
        );
        return frames.filter(($) => $[active] === false);
      },
      then: Actions(Fail("Invalid or expired session.")),
    })),
  }),
);

// --- list: session-gated ---

const list = defineEndpoint(
  "/bookmarks/list",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    BookmarkListResponse: Sync(
      ({ session, user, item, savedAt, bookmarks }) => ({
        when: Actions(Request({ session })),
        where: async (frames) => {
          const [base] = frames;
          frames = await frames.query(
            Sessioning._getUser,
            { session },
            { user },
          );
          frames = await frames.query(
            Bookmarking._getSaved,
            { user },
            { item, savedAt },
          );
          return frames.aggregate(base, [item, savedAt], bookmarks);
        },
        then: Actions(Respond<BookmarkListOutput>({ bookmarks })),
      }),
    ),

    BookmarkListInvalidSession: Sync(({ session, active }) => ({
      when: Actions(Request({ session })),
      where: async (frames) => {
        frames = await frames.query(
          Sessioning._isActive,
          { session },
          { active },
        );
        return frames.filter(($) => $[active] === false);
      },
      then: Actions(Fail("Invalid or expired session.")),
    })),
  }),
);

// --- isSaved: session-gated ---

const isSaved = defineEndpoint(
  "/bookmarks/isSaved",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    BookmarkIsSavedResponse: Sync(({ session, item, user, saved }) => ({
      when: Actions(Request({ session, item })),
      where: async (frames) => {
        frames = await frames.query(Sessioning._getUser, { session }, { user });
        return await frames.query(
          Bookmarking._isSaved,
          { user, item },
          { saved },
        );
      },
      then: Actions(Respond<BookmarkIsSavedOutput>({ saved })),
    })),

    BookmarkIsSavedInvalidSession: Sync(({ session, active }) => ({
      when: Actions(Request({ session })),
      where: async (frames) => {
        frames = await frames.query(
          Sessioning._isActive,
          { session },
          { active },
        );
        return frames.filter(($) => $[active] === false);
      },
      then: Actions(Fail("Invalid or expired session.")),
    })),
  }),
);

export const bookmarksApi = {
  save,
  unsave,
  list,
  isSaved,
};
