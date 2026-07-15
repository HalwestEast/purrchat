import { type QueryCtx, type MutationCtx } from "../_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

export async function getCurrentUser(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Unauthorized");

  const user = await ctx.db.get(userId);
  if (!user) throw new Error("User not found");

  return user;
}
