import { QueryCtx, MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { getCurrentUser } from "./auth";

export async function ensureParticipant(
  ctx: QueryCtx | MutationCtx,
  conversationId: Id<"conversations">,
) {
  const user = await getCurrentUser(ctx);

  const participant = await ctx.db
    .query("participants")
    .withIndex("by_conversation_user", (q) =>
      q.eq("conversationId", conversationId).eq("userId", user._id),
    )
    .unique();

  if (!participant) {
    throw new Error("Unauthorized");
  }

  return user;
}
