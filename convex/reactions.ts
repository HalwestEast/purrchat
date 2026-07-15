import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUser } from "./lib/auth";




export const getReactions = query({
  args: {
    messageId: v.id("messages"),
  },

  handler: async (ctx, args) => {
    return await ctx.db
      .query("reactions")
      .withIndex("by_message", (q) => q.eq("messageId", args.messageId))
      .collect();
  },
});

export const toggleReaction = mutation({
  args: {
    messageId: v.id("messages"),
    emoji: v.string(),
  },

  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);

    const existing = await ctx.db
      .query("reactions")
      .withIndex("by_message_user_emoji", (q) =>
        q
          .eq("messageId", args.messageId)
          .eq("userId", user._id)
          .eq("emoji", args.emoji),
      )
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);

      return { removed: true };
    }

    await ctx.db.insert("reactions", {
      messageId: args.messageId,
      userId: user._id,
      emoji: args.emoji,
      createdAt: Date.now(),
    });

    return { removed: false };
  },
});
