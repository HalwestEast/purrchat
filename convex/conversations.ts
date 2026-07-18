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

        // Reuse the existing DM. If this user had cleared it, the
        // clearedAt watermark still hides the old history for them.
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

/**
 * "Delete for me": the conversation disappears from this user's list and its
 * existing history is hidden for them. Nothing is deleted from the database,
 * and the other participants are not affected. If someone sends a new
 * message afterwards, the conversation reappears for this user showing only
 * messages sent after the deletion.
 */
export const deleteConversationForMe = mutation({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);

    const participant = await ctx.db
      .query("participants")
      .withIndex("by_conversation_user", (q) =>
        q.eq("conversationId", args.conversationId).eq("userId", user._id),
      )
      .unique();
    if (!participant) throw new Error("Unauthorized");

    await ctx.db.patch(participant._id, { clearedAt: Date.now() });
  },
});

/**
 * Lightweight info for a single conversation — used by the mobile
 * chat header (name + image + back navigation).
 */
export const getConversation = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const currentUser = await getCurrentUser(ctx);

    const me = await ctx.db
      .query("participants")
      .withIndex("by_conversation_user", (q) =>
        q
          .eq("conversationId", args.conversationId)
          .eq("userId", currentUser._id),
      )
      .unique();
    if (!me) return null;

    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) return null;

    let name = conversation.title ?? "Unnamed Group";
    let image = conversation.image;

    if (conversation.type === "dm") {
      const otherParticipation = await ctx.db
        .query("participants")
        .withIndex("by_conversation", (q) =>
          q.eq("conversationId", conversation._id),
        )
        .filter((q) => q.neq(q.field("userId"), currentUser._id))
        .unique();
      const otherUser = otherParticipation
        ? await ctx.db.get(otherParticipation.userId)
        : null;
      name = otherUser?.name ?? "Unknown User";
      image = otherUser?.image;
    }

    return {
      _id: conversation._id,
      type: conversation.type,
      name,
      image,
    };
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
          clearedAt: participation.clearedAt,
        };
      }),
    );

    return conversations
      .filter(Boolean)
      .filter((c) => {
        // Hidden if the user cleared it and nothing has happened since.
        if (!c!.clearedAt) return true;
        return (c!.lastMessageAt ?? 0) > c!.clearedAt;
      })
      .sort(
        (a, b) =>
          (b!.lastMessageAt ?? b!.updatedAt) -
          (a!.lastMessageAt ?? a!.updatedAt),
      );
  },
});
