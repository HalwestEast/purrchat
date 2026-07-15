import { mutation, query } from "./_generated/server";
import { seedDemoChatForNewUser } from "./demoChatSeeding";
import { getCurrentUser } from "./lib/auth";

/**
 * Mutation to initialize a new user with demo chat data.
 * Safe to call multiple times - only seeds once per user.
 */
export const initializeDemoChat = mutation({
  args: {},
  handler: async (ctx) => {
    const currentUser = await getCurrentUser(ctx);

    // Check if user already has demo data seeded
    const existingConversations = await ctx.db
      .query("conversations")
      .filter((q) => q.eq(q.field("createdBy"), currentUser._id))
      .collect();

    // If user already has conversations, skip seeding
    if (existingConversations.length > 0) {
      return { success: false, reason: "Demo data already exists" };
    }

    // Seed demo data for this user
    await seedDemoChatForNewUser(ctx, currentUser._id);

    return { success: true, message: "Demo data initialized" };
  },
});

/**
 * Query to check if user has demo data
 */
export const hasDemoChatData = query({
  args: {},
  handler: async (ctx) => {
    const currentUser = await getCurrentUser(ctx);

    const conversations = await ctx.db
      .query("conversations")
      .filter((q) => q.eq(q.field("createdBy"), currentUser._id))
      .collect();

    return {
      hasDemoData: conversations.length > 0,
      conversationCount: conversations.length,
    };
  },
});
