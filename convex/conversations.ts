import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUser } from "./lib/auth";

export const createConversation = mutation({
  args: {
    type: v.union(v.literal("dm"), v.literal("group")),
    participantIds: v.array(v.id("users")),
    title: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const currentUser = await getCurrentUser(ctx);
    const now = Date.now();

    if (args.type === "dm") {
      const otherUserId = args.participantIds[0];
      const existing = await ctx.db
        .query("participants")
        .withIndex("by_user", (q) => q.eq("userId", currentUser._id))
        .collect();

      for (const p of existing) {
        const conversation = await ctx.db.get(p.conversationId);
        if (conversation?.type !== "dm") continue;

        const otherParticipant = await ctx.db
          .query("participants")
          .withIndex("by_conversation_user", (q) =>
            q.eq("conversationId", p.conversationId).eq("userId", otherUserId),
          )
          .unique();

        if (otherParticipant) return p.conversationId;
      }
    }

    const conversationId = await ctx.db.insert("conversations", {
      type: args.type,
      title: args.title,
      createdBy: currentUser._id,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("participants", {
      conversationId,
      userId: currentUser._id,
      role: "owner",
      joinedAt: now,
    });

    await Promise.all(
      args.participantIds.map((userId) =>
        ctx.db.insert("participants", {
          conversationId,
          userId,
          role: "member",
          joinedAt: now,
        }),
      ),
    );

    return conversationId;
  },
});

export const listConversations = query({
  args: {},
  handler: async (ctx) => {
    const currentUser = await getCurrentUser(ctx);

    const participations = await ctx.db
      .query("participants")
      .withIndex("by_user", (q) => q.eq("userId", currentUser._id))
      .collect();

    const conversations = await Promise.all(
      participations.map(async (participation) => {
        const conversation = await ctx.db.get(participation.conversationId);
        if (!conversation) return null;

        // For DMs, get the other participant's info
        let otherUser = null;
        if (conversation.type === "dm") {
          const otherParticipation = await ctx.db
            .query("participants")
            .withIndex("by_conversation", (q) =>
              q.eq("conversationId", conversation._id),
            )
            .filter((q) => q.neq(q.field("userId"), currentUser._id))
            .unique();

          if (otherParticipation) {
            otherUser = await ctx.db.get(otherParticipation.userId);
          }
        }

        return {
          ...conversation,
          otherUser,
          role: participation.role,
          lastReadAt: participation.lastReadAt,
        };
      }),
    );

    return conversations
      .filter(Boolean)
      .sort(
        (a, b) =>
          (b!.lastMessageAt ?? b!.updatedAt) -
          (a!.lastMessageAt ?? a!.updatedAt),
      );
  },
});
