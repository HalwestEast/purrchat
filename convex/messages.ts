import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { ensureParticipant } from "./lib/conversations";
import { getCurrentUser } from "./lib/auth";

export const sendMessage = mutation({
  args: {
    conversationId: v.id("conversations"),
    content: v.string(),
    createdAt: v.number(),
    replyToId: v.optional(v.id("messages")),
    replyToPreview: v.optional(
      v.object({
        content: v.string(),
        senderId: v.id("users"),
        type: v.union(
          v.literal("text"),
          v.literal("image"),
          v.literal("system"),
        ),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const user = await ensureParticipant(ctx, args.conversationId);
    const now = Date.now();

    const messageId = await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      senderId: user._id,
      content: args.content,
      type: "text",
      createdAt: args.createdAt,
      ...(args.replyToId ? { replyToId: args.replyToId } : {}),
      ...(args.replyToPreview ? { replyToPreview: args.replyToPreview } : {}),
    });

    await ctx.db.patch(args.conversationId, {
      lastMessageAt: now,
      lastMessagePreview: args.content.slice(0, 100),
      lastMessageId: messageId,
      updatedAt: now,
    });

    return messageId;
  },
});

export const listMessages = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const user = await ensureParticipant(ctx, args.conversationId);

    // "Delete for me" watermark for this user.
    const participant = await ctx.db
      .query("participants")
      .withIndex("by_conversation_user", (q) =>
        q.eq("conversationId", args.conversationId).eq("userId", user._id),
      )
      .unique();
    const clearedAt = participant?.clearedAt ?? 0;

    // All messages this user has individually hidden in this conversation.
    const myDeletions = await ctx.db
      .query("messageDeletions")
      .withIndex("by_user_conversation", (q) =>
        q.eq("userId", user._id).eq("conversationId", args.conversationId),
      )
      .collect();
    const hiddenIds = new Set(myDeletions.map((d) => d.messageId));

    // The .gt() rides the index, so cleared history is never even read.
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation_createdAt", (q) =>
        q.eq("conversationId", args.conversationId).gt("createdAt", clearedAt),
      )
      .collect();

    // Messages you deleted-for-me are kept in the list but flagged, so the
    // UI can render the "Message removed" placeholder in their place.
    // Content is blanked so nothing you deleted is sent to your client.
    const withDeletions = messages.map((m) =>
      hiddenIds.has(m._id)
        ? { ...m, content: "", isDeleted: true, replyToPreview: undefined }
        : m,
    );

    return Promise.all(
      withDeletions.map(async (msg) => {
        const sender = await ctx.db.get(msg.senderId);

        // Resolve reply sender name for display
        let replyToSenderName: string | undefined;
        if (msg.replyToPreview?.senderId) {
          const replySender = await ctx.db.get(msg.replyToPreview.senderId);
          replyToSenderName = replySender?.name ?? "Unknown";
        }

        return {
          ...msg,
          senderName: sender?.name ?? "Unknown",
          senderImage: sender?.image,
          replyToSenderName,
        };
      }),
    );
  },
});

export const editMessage = mutation({
  args: {
    messageId: v.id("messages"),
    content: v.string(),
  },

  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);

    const message = await ctx.db.get(args.messageId);

    if (!message) {
      throw new Error("Message not found");
    }

    if (message.senderId !== user._id) {
      throw new Error("Unauthorized");
    }

    await ctx.db.patch(args.messageId, {
      content: args.content,
      editedAt: Date.now(),
      isEdited: true,
    });
  },
});

/**
 * "Delete for me": hides the message for the current user only.
 * The other side of the conversation is not affected.
 * Works on any message in the conversation, not just your own.
 */
export const deleteMessageForMe = mutation({
  args: { messageId: v.id("messages") },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);
    if (!message) throw new Error("Message not found");

    const user = await ensureParticipant(ctx, message.conversationId);

    const existing = await ctx.db
      .query("messageDeletions")
      .withIndex("by_user_message", (q) =>
        q.eq("userId", user._id).eq("messageId", args.messageId),
      )
      .unique();
    if (existing) return; // already hidden — idempotent

    await ctx.db.insert("messageDeletions", {
      messageId: args.messageId,
      conversationId: message.conversationId,
      userId: user._id,
      deletedAt: Date.now(),
    });
  },
});

/**
 * "Delete for everyone": sender-only. Kept for future use — shows the
 * "Message removed" placeholder on both sides. Not wired to the UI right now.
 */
export const deleteMessage = mutation({
  args: {
    messageId: v.id("messages"),
  },

  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);

    const message = await ctx.db.get(args.messageId);

    if (!message) {
      throw new Error("Message not found");
    }

    if (message.senderId !== user._id) {
      throw new Error("Unauthorized");
    }

    await ctx.db.patch(args.messageId, {
      content: "",
      isDeleted: true,
      deletedAt: Date.now(),
    });

    // Clean up reactions on the removed message.
    const reactions = await ctx.db
      .query("reactions")
      .withIndex("by_message", (q) => q.eq("messageId", args.messageId))
      .collect();
    await Promise.all(reactions.map((r) => ctx.db.delete(r._id)));

    const conversation = await ctx.db.get(message.conversationId);

    if (conversation?.lastMessageId === args.messageId) {
      await ctx.db.patch(message.conversationId, {
        lastMessagePreview: "Message deleted",
        updatedAt: Date.now(),
      });
    }
  },
});

export const markConversationAsRead = mutation({
  args: {
    conversationId: v.id("conversations"),
  },

  handler: async (ctx, args) => {
    const user = await ensureParticipant(ctx, args.conversationId);

    const participant = await ctx.db
      .query("participants")
      .withIndex("by_conversation_user", (q) =>
        q.eq("conversationId", args.conversationId).eq("userId", user._id),
      )
      .unique();

    if (!participant) {
      throw new Error("Participant not found");
    }

    const now = Date.now();

    // avoid unnecessary writes
    if (participant.lastReadAt && now - participant.lastReadAt < 2000) {
      return;
    }

    await ctx.db.patch(participant._id, {
      lastReadAt: now,
    });
  },
});

export const setTypingStatus = mutation({
  args: {
    conversationId: v.id("conversations"),
  },

  handler: async (ctx, args) => {
    const user = await ensureParticipant(ctx, args.conversationId);
    const now = Date.now();

    const existing = await ctx.db
      .query("typingIndicators")
      .withIndex("by_conversation_user", (q) =>
        q.eq("conversationId", args.conversationId).eq("userId", user._id),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("typingIndicators", {
      conversationId: args.conversationId,
      userId: user._id,
      updatedAt: now,
    });
  },
});

export const getTypingUsers = query({
  args: {
    conversationId: v.id("conversations"),
  },

  handler: async (ctx, args) => {
    const currentUser = await ensureParticipant(ctx, args.conversationId);

    return await ctx.db
      .query("typingIndicators")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .filter((q) => q.neq(q.field("userId"), currentUser._id))
      .collect();
  },
});

export const getReadReceipts = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const currentUser = await ensureParticipant(ctx, args.conversationId);

    const participants = await ctx.db
      .query("participants")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .filter((q) => q.neq(q.field("userId"), currentUser._id))
      .collect();

    return participants.map((p) => ({
      userId: p.userId,
      lastReadAt: p.lastReadAt ?? 0,
    }));
  },
});
