/**
 * Category synchronizations.
 *
 * Endpoints:
 *   POST /categories/create   { session, name, description } -> { category }
 *   POST /categories/delete   { session, category }          -> { category }
 *   POST /categories/assign   { session, item, category }    -> { item }
 *   POST /categories/unassign { session, item }              -> { item }
 *   POST /categories/list     {}                             -> { categories }
 *   POST /categories/items    { category }                   -> { items }
 *   POST /categories/forItem  { item }                       -> { category }
 */
import { Categorizing } from "@concepts";
import {
  type ActionOk,
  defineEndpoint,
  type QueryRow,
} from "@concepts/Requesting/api.ts";
import {
  ADMIN_CAPABILITY,
  authorizeCapable,
  MODERATE_CAPABILITY,
  rejectIncapable,
} from "./authorization.ts";

type CategoryCreateOutput = ActionOk<typeof Categorizing, "createCategory">;
type CategoryDeleteOutput = ActionOk<typeof Categorizing, "deleteCategory">;
type CategoryAssignOutput = ActionOk<typeof Categorizing, "assign">;
type CategoryUnassignOutput = ActionOk<typeof Categorizing, "unassign">;
type CategoryListOutput = {
  categories: QueryRow<typeof Categorizing, "_getAllCategories">[];
};
type CategoryItemsOutput = {
  items: QueryRow<typeof Categorizing, "_getItems">[];
};
type CategoryForItemOutput = {
  category: QueryRow<typeof Categorizing, "_getCategory">[];
};

// --- create ---

const create = defineEndpoint(
  "/categories/create",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    CategoryCreateRequest: Sync(
      ({ session, name, description, user, allowed, present }) => ({
        when: Actions(Request({ session, name, description })),
        where: (frames) =>
          authorizeCapable(frames, {
            session,
            user,
            allowed,
            present,
            capability: ADMIN_CAPABILITY,
          }),
        then: Actions([Categorizing.createCategory, { name, description }]),
      }),
    ),

    CategoryCreateResponse: Sync(({ category }) => ({
      when: Actions([Categorizing.createCategory, {}, { category }]),
      then: Actions(Respond<CategoryCreateOutput>({ category })),
    })),

    CategoryCreateError: Sync(({ error }) => ({
      when: Actions([Categorizing.createCategory, {}, { error }]),
      then: Actions(Fail(error)),
    })),

    CategoryCreateForbidden: Sync(
      ({ session, name, user, allowed, present }) => ({
        when: Actions(Request({ session, name })),
        where: (frames) =>
          rejectIncapable(frames, {
            session,
            user,
            allowed,
            present,
            capability: ADMIN_CAPABILITY,
          }),
        then: Actions(Fail("Not authorized to manage categories.")),
      }),
    ),
  }),
);

// --- delete ---

const remove = defineEndpoint(
  "/categories/delete",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    CategoryDeleteRequest: Sync(
      ({ session, category, user, allowed, present }) => ({
        when: Actions(Request({ session, category })),
        where: (frames) =>
          authorizeCapable(frames, {
            session,
            user,
            allowed,
            present,
            capability: ADMIN_CAPABILITY,
          }),
        then: Actions([Categorizing.deleteCategory, { category }]),
      }),
    ),

    CategoryDeleteResponse: Sync(({ category }) => ({
      when: Actions([Categorizing.deleteCategory, {}, { category }]),
      then: Actions(Respond<CategoryDeleteOutput>({ category })),
    })),

    CategoryDeleteError: Sync(({ error }) => ({
      when: Actions([Categorizing.deleteCategory, {}, { error }]),
      then: Actions(Fail(error)),
    })),

    CategoryDeleteForbidden: Sync(
      ({ session, category, user, allowed, present }) => ({
        when: Actions(Request({ session, category })),
        where: (frames) =>
          rejectIncapable(frames, {
            session,
            user,
            allowed,
            present,
            capability: ADMIN_CAPABILITY,
          }),
        then: Actions(Fail("Not authorized to manage categories.")),
      }),
    ),
  }),
);

// --- assign ---

const assign = defineEndpoint(
  "/categories/assign",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    CategoryAssignRequest: Sync(
      ({ session, item, category, user, allowed, present }) => ({
        when: Actions(Request({ session, item, category })),
        where: (frames) =>
          authorizeCapable(frames, {
            session,
            user,
            allowed,
            present,
            capability: MODERATE_CAPABILITY,
          }),
        then: Actions([Categorizing.assign, { item, category }]),
      }),
    ),

    CategoryAssignResponse: Sync(({ item }) => ({
      when: Actions([Categorizing.assign, {}, { item }]),
      then: Actions(Respond<CategoryAssignOutput>({ item })),
    })),

    CategoryAssignError: Sync(({ error }) => ({
      when: Actions([Categorizing.assign, {}, { error }]),
      then: Actions(Fail(error)),
    })),

    CategoryAssignForbidden: Sync(
      ({ session, item, user, allowed, present }) => ({
        when: Actions(Request({ session, item })),
        where: (frames) =>
          rejectIncapable(frames, {
            session,
            user,
            allowed,
            present,
            capability: MODERATE_CAPABILITY,
          }),
        then: Actions(Fail("Not authorized to assign categories.")),
      }),
    ),
  }),
);

// --- unassign ---

const unassign = defineEndpoint(
  "/categories/unassign",
  ({ Sync, Actions, Request, Respond, Fail }) => ({
    CategoryUnassignRequest: Sync(
      ({ session, item, user, allowed, present }) => ({
        when: Actions(Request({ session, item })),
        where: (frames) =>
          authorizeCapable(frames, {
            session,
            user,
            allowed,
            present,
            capability: MODERATE_CAPABILITY,
          }),
        then: Actions([Categorizing.unassign, { item }]),
      }),
    ),

    CategoryUnassignResponse: Sync(({ item }) => ({
      when: Actions([Categorizing.unassign, {}, { item }]),
      then: Actions(Respond<CategoryUnassignOutput>({ item })),
    })),

    CategoryUnassignError: Sync(({ error }) => ({
      when: Actions([Categorizing.unassign, {}, { error }]),
      then: Actions(Fail(error)),
    })),

    CategoryUnassignForbidden: Sync(
      ({ session, item, user, allowed, present }) => ({
        when: Actions(Request({ session, item })),
        where: (frames) =>
          rejectIncapable(frames, {
            session,
            user,
            allowed,
            present,
            capability: MODERATE_CAPABILITY,
          }),
        then: Actions(Fail("Not authorized to assign categories.")),
      }),
    ),
  }),
);

// --- list: public ---

const list = defineEndpoint(
  "/categories/list",
  ({ Sync, Actions, Request, Respond }) => ({
    CategoryListResponse: Sync(
      ({ category, name, description, categories }) => ({
        when: Actions(Request()),
        where: async (frames) => {
          const [base] = frames;
          frames = await frames.query(
            Categorizing._getAllCategories,
            {},
            { category, name, description },
          );
          return frames.aggregate(
            base,
            [category, name, description],
            categories,
          );
        },
        then: Actions(Respond<CategoryListOutput>({ categories })),
      }),
    ),
  }),
);

// --- items: public ---

const items = defineEndpoint(
  "/categories/items",
  ({ Sync, Actions, Request, Respond }) => ({
    CategoryItemsResponse: Sync(({ category, item, items }) => ({
      when: Actions(Request({ category })),
      where: async (frames) => {
        const [base] = frames;
        frames = await frames.query(
          Categorizing._getItems,
          { category },
          {
            item,
          },
        );
        return frames.aggregate(base, [item], items);
      },
      then: Actions(Respond<CategoryItemsOutput>({ items })),
    })),
  }),
);

// --- forItem: public ---

const forItem = defineEndpoint(
  "/categories/forItem",
  ({ Sync, Actions, Request, Respond }) => ({
    CategoryForItemResponse: Sync(({ item, name, description, category, categories }) => ({
      when: Actions(Request({ item })),
      where: async (frames) => {
        const [base] = frames;
        frames = await frames.query(
          Categorizing._getCategory,
          { item },
          { category, name, description },
        );
        return frames.aggregate(base, [category, name, description], categories);
      },
      then: Actions(Respond<CategoryForItemOutput>({ category: categories })),
    })),
  }),
);

export const categoriesApi = {
  create,
  delete: remove,
  assign,
  unassign,
  list,
  items,
  forItem,
};
