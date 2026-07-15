import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

interface DemoUser {
  name: string;
  email: string;
  image: string;
}

/**
 * Get fresh demo users with unique timestamps
 * Called each time to ensure different emails for each invocation
 */
function getDemoUsers(): DemoUser[] {
  const timestamp = Date.now();
  return [
    {
      name: "Sarah Chen",
      email: `demo-sarah-${timestamp}-1@demo.local`,
      image: "https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah",
    },
    {
      name: "Alex Rivera",
      email: `demo-alex-${timestamp}-2@demo.local`,
      image: "https://api.dicebear.com/7.x/avataaars/svg?seed=Alex",
    },
    {
      name: "Jamie Kim",
      email: `demo-jamie-${timestamp}-3@demo.local`,
      image: "https://api.dicebear.com/7.x/avataaars/svg?seed=Jamie",
    },
  ];
}

/**
 * Create or get demo users (these are real users in the DB but with demo emails)
 */
async function getOrCreateDemoUsers(ctx: MutationCtx): Promise<Id<"users">[]> {
  const DEMO_USERS = getDemoUsers();
  const demoUserIds: Id<"users">[] = [];

  for (const demoUser of DEMO_USERS) {
    try {
      // Check if this demo user already exists (by email pattern)
      const existing = await ctx.db
        .query("users")
        .filter((q) => q.eq(q.field("email"), demoUser.email))
        .first();

      if (existing) {
        console.log(`✅ Demo user ${demoUser.name} already exists`);
        demoUserIds.push(existing._id);
      } else {
        // Create new demo user
        console.log(`➕ Creating demo user: ${demoUser.name}`);
        const userId = await ctx.db.insert("users", {
          email: demoUser.email,
          name: demoUser.name,
          image: demoUser.image,
        });
        demoUserIds.push(userId);
        console.log(`✅ Created demo user: ${demoUser.name} (${userId})`);
      }
    } catch (error) {
      console.error(`❌ Error creating demo user ${demoUser.name}:`, error);
      throw error;
    }
  }

  return demoUserIds;
}

/**
 * Seed demo conversations and messages for a new user
 */
export async function seedDemoChatForNewUser(
  ctx: MutationCtx,
  userId: Id<"users">,
) {
  try {
    console.log(`🌱 Starting demo chat seeding for user: ${userId}`);

    // Get or create demo users
    console.log("👥 Getting or creating demo users...");
    const demoUserIds = await getOrCreateDemoUsers(ctx);
    console.log(`✅ Demo users ready: ${demoUserIds.length} users`);

    // ── Conversation 1: Group chat ──
    console.log("💬 Creating conversation 1: Project Planning...");
    const conv1Id = await ctx.db.insert("conversations", {
      type: "group",
      title: "Project Planning",
      image: "https://api.dicebear.com/7.x/shapes/svg?seed=project",
      createdBy: userId,
      createdAt: Date.now() - 86400000 * 2, // 2 days ago
      updatedAt: Date.now() - 3600000, // 1 hour ago
      lastMessageAt: Date.now() - 3600000,
      lastMessagePreview: "That sounds great!",
    });

    // Add current user and demo users as participants
    await ctx.db.insert("participants", {
      conversationId: conv1Id,
      userId,
      role: "member",
      joinedAt: Date.now() - 86400000 * 2,
    });

    for (const demoUserId of demoUserIds) {
      await ctx.db.insert("participants", {
        conversationId: conv1Id,
        userId: demoUserId,
        role: "member",
        joinedAt: Date.now() - 86400000 * 2,
      });
    }

    // Create messages for conversation 1
    const messages1 = [
      {
        conversationId: conv1Id,
        senderId: demoUserIds[0], // Sarah
        content: "Hey team! I've started working on the roadmap for Q3 🚀",
        createdAt: Date.now() - 3600000 * 4,
        type: "text" as const,
      },
      {
        conversationId: conv1Id,
        senderId: userId, // Current user
        content: "Awesome! Can you share the draft with us?",
        createdAt: Date.now() - 3600000 * 3.5,
        type: "text" as const,
      },
      {
        conversationId: conv1Id,
        senderId: demoUserIds[1], // Alex
        content: "I'd love to review it too",
        createdAt: Date.now() - 3600000 * 3,
        type: "text" as const,
      },
      {
        conversationId: conv1Id,
        senderId: demoUserIds[0], // Sarah
        content: "Just uploaded it to the shared folder. Check it out!",
        createdAt: Date.now() - 3600000 * 2.5,
        type: "text" as const,
      },
      {
        conversationId: conv1Id,
        senderId: userId, // Current user
        content: "Looks great! Love the new feature ideas 💡",
        createdAt: Date.now() - 3600000 * 2,
        type: "text" as const,
      },
      {
        conversationId: conv1Id,
        senderId: demoUserIds[2], // Jamie
        content: "That sounds great!",
        createdAt: Date.now() - 3600000 * 1,
        type: "text" as const,
      },
    ];

    const messageIds: Map<number, Id<"messages">> = new Map();

    console.log(
      `📨 Creating ${messages1.length} messages for conversation 1...`,
    );
    for (let i = 0; i < messages1.length; i++) {
      const msgId = await ctx.db.insert("messages", messages1[i]);
      messageIds.set(i, msgId);
    }
    console.log(`✅ Created ${messages1.length} messages`);

    // Add reactions to some messages
    console.log("👍 Adding reactions to messages...");
    await ctx.db.insert("reactions", {
      messageId: messageIds.get(2)!,
      userId: userId,
      emoji: "👍",
      createdAt: Date.now() - 3600000 * 2.8,
    });

    await ctx.db.insert("reactions", {
      messageId: messageIds.get(2)!,
      userId: demoUserIds[0],
      emoji: "👍",
      createdAt: Date.now() - 3600000 * 2.7,
    });

    await ctx.db.insert("reactions", {
      messageId: messageIds.get(4)!,
      userId: demoUserIds[0],
      emoji: "❤️",
      createdAt: Date.now() - 3600000 * 1.9,
    });

    await ctx.db.insert("reactions", {
      messageId: messageIds.get(4)!,
      userId: demoUserIds[1],
      emoji: "🎉",
      createdAt: Date.now() - 3600000 * 1.8,
    });

    // ── Conversation 2: DM with one demo user ──
    console.log("💬 Creating conversation 2: Direct message with Alex...");
    const conv2Id = await ctx.db.insert("conversations", {
      type: "dm",
      createdBy: userId,
      createdAt: Date.now() - 86400000 * 5,
      updatedAt: Date.now() - 3600000 * 6,
      lastMessageAt: Date.now() - 3600000 * 6,
      lastMessagePreview: "See you then!",
    });
    console.log(`✅ Created conversation 2: ${conv2Id}`);

    // Add current user and one demo user
    console.log("👥 Adding participants to conversation 2...");
    await ctx.db.insert("participants", {
      conversationId: conv2Id,
      userId,
      role: "member",
      joinedAt: Date.now() - 86400000 * 5,
    });

    await ctx.db.insert("participants", {
      conversationId: conv2Id,
      userId: demoUserIds[1], // Alex
      role: "member",
      joinedAt: Date.now() - 86400000 * 5,
    });

    // Messages for conversation 2
    const messages2 = [
      {
        conversationId: conv2Id,
        senderId: demoUserIds[1], // Alex
        content: "Hey! Are you free for a quick sync tomorrow?",
        createdAt: Date.now() - 3600000 * 12,
        type: "text" as const,
      },
      {
        conversationId: conv2Id,
        senderId: userId,
        content: "Sure! What time works for you?",
        createdAt: Date.now() - 3600000 * 11,
        type: "text" as const,
      },
      {
        conversationId: conv2Id,
        senderId: demoUserIds[1],
        content: "How about 2pm?",
        createdAt: Date.now() - 3600000 * 10.5,
        type: "text" as const,
      },
      {
        conversationId: conv2Id,
        senderId: userId,
        content: "Perfect! See you then!",
        createdAt: Date.now() - 3600000 * 10,
        type: "text" as const,
      },
    ];

    console.log(
      `📨 Creating ${messages2.length} messages for conversation 2...`,
    );
    const messageIds2: Map<number, Id<"messages">> = new Map();
    for (let i = 0; i < messages2.length; i++) {
      const msgId = await ctx.db.insert("messages", messages2[i]);
      messageIds2.set(i, msgId);
    }
    console.log(`✅ Created ${messages2.length} messages for conversation 2`);

    // Add reaction to last message
    await ctx.db.insert("reactions", {
      messageId: messageIds2.get(3)!,
      userId: demoUserIds[1],
      emoji: "✨",
      createdAt: Date.now() - 3600000 * 9.9,
    });

    // ── Conversation 3: Another group chat (inactive) ──
    console.log("💬 Creating conversation 3: Design System...");
    const conv3Id = await ctx.db.insert("conversations", {
      type: "group",
      title: "Design System",
      image: "https://api.dicebear.com/7.x/shapes/svg?seed=design",
      createdBy: userId,
      createdAt: Date.now() - 86400000 * 10,
      updatedAt: Date.now() - 86400000 * 8,
    });
    console.log(`✅ Created conversation 3: ${conv3Id}`);

    console.log("👥 Adding participants to conversation 3...");
    await ctx.db.insert("participants", {
      conversationId: conv3Id,
      userId,
      role: "member",
      joinedAt: Date.now() - 86400000 * 10,
    });

    for (const demoUserId of demoUserIds.slice(0, 2)) {
      await ctx.db.insert("participants", {
        conversationId: conv3Id,
        userId: demoUserId,
        role: "member",
        joinedAt: Date.now() - 86400000 * 10,
      });
    }

    // A few messages in this one
    const messages3 = [
      {
        conversationId: conv3Id,
        senderId: userId,
        content: "Let's discuss the new color palette for the design system",
        createdAt: Date.now() - 86400000 * 8.5,
        type: "text" as const,
      },
      {
        conversationId: conv3Id,
        senderId: demoUserIds[0],
        content: "I love the direction you're going! 🎨",
        createdAt: Date.now() - 86400000 * 8,
        type: "text" as const,
      },
    ];

    console.log(
      `📨 Creating ${messages3.length} messages for conversation 3...`,
    );
    for (const msg of messages3) {
      await ctx.db.insert("messages", msg);
    }
    console.log(`✅ Created ${messages3.length} messages for conversation 3`);

    console.log(
      `🎉 Demo chat seeding completed successfully for user: ${userId}`,
    );
  } catch (error) {
    console.error(`❌ Error seeding demo chat for user ${userId}:`, error);
    throw error;
  }
}
