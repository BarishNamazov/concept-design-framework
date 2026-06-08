/**
 * User search synchronizations.
 *
 * Endpoints:
 *   POST /users/search { session, query } -> { users }
 */
import { Authenticating, Profiling } from "@concepts";
import {
  defineEndpoint,
  type Prettify,
  type QueryRow,
} from "@concepts/Requesting/api.ts";

type UserSearchRow = Prettify<
  QueryRow<typeof Authenticating, "_search"> &
    QueryRow<typeof Profiling, "_getProfile">
>;

type UserSearchOutput = { users: UserSearchRow[] };

const search = defineEndpoint(
  "/users/search",
  ({ Sync, Actions, Request, Respond }) => ({
    SearchResponse: Sync(
      ({ query, session, user, username, profile, users }) => ({
        when: Actions(Request({ query, session })),
        where: async (frames) => {
          const [base] = frames;
          frames = await frames.query(
            Authenticating._search,
            { query },
            { user, username },
          );
          frames = await frames.query(
            Profiling._getProfile,
            { user },
            { profile },
          );
          frames = frames.aggregate(base, [user, username, profile], users);
          return frames;
        },
        then: Actions(Respond<UserSearchOutput>({ users })),
      }),
    ),
  }),
);

export const usersApi = { search };
