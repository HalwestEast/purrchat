import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

const schema = defineSchema({
  ...authTables,
  conversations: defineTable({
    type: v.union(v.literal("dm"), v.literal("group")),
    title: v.optional(v.string()),
    image: v.optional(v.string()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
    lastMessageAt: v.optional(v.number()),
    lastMessagePreview: v.optional(v.string()),
    lastMessageId: v.optional(v.id("messages")),
  }),

  participants: defineTable({
    conversationId: v.id("conversations"),
    userId: v.id("users"),
    role: v.union(v.literal("member"), v.literal("admin"), v.literal("owner")),
    joinedAt: v.number(),
    lastReadAt: v.optional(v.number()),
  })
    .index("by_conversation", ["conversationId"])
    .index("by_user", ["userId"])
    .index("by_conversation_user", ["conversationId", "userId"]),

  messages: defineTable({
    conversationId: v.id("conversations"),
    senderId: v.id("users"),
    content: v.string(),
    createdAt: v.number(),
    editedAt: v.optional(v.number()),
    isEdited: v.optional(v.boolean()),
    type: v.union(v.literal("text"), v.literal("image"), v.literal("system")),
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

    isDeleted: v.optional(v.boolean()),
    deletedAt: v.optional(v.number()),
  }).index("by_conversation_createdAt", ["conversationId", "createdAt"]),

  reactions: defineTable({
    messageId: v.id("messages"),
    userId: v.id("users"),
    emoji: v.string(),
    createdAt: v.number(),
  })
    .index("by_message", ["messageId"])
    .index("by_message_user_emoji", ["messageId", "userId", "emoji"]),

  typingIndicators: defineTable({
    conversationId: v.id("conversations"),
    userId: v.id("users"),
    updatedAt: v.number(),
  })
    .index("by_conversation", ["conversationId"])
    .index("by_conversation_user", ["conversationId", "userId"]),
});

export default schema;
