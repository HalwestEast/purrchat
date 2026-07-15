import { query } from "./_generated/server";
import { getCurrentUser } from "./lib/auth";

export const getUsers = query({
  args: {},
  handler: async (ctx) => {
    const currentUser = await getCurrentUser(ctx);

    const users = await ctx.db
      .query("users")
      .filter((q) => q.neq(q.field("_id"), currentUser._id))
      .collect();

    return users;
  },
});

export const currentUser = query({
  args: {},
  handler: (ctx) => getCurrentUser(ctx),
});
