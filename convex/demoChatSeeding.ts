import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

interface DemoUser {
  name: string;
  email: string;
  image: string;
}

/**
 * Get fresh demo users with unique timestamps.
 */
function getDemoUsers(): DemoUser[] {
  const timestamp = Date.now();
  return [
    {
      name: "Arya",
      email: `demo-arya-${timestamp}-1@demo.local`,
      image: "https://api.dicebear.com/7.x/avataaars/svg?seed=Arya",
    },
  ];
}

/**
 * Create or get demo users (these are real users in the DB but with demo emails).
 */
async function getOrCreateDemoUsers(ctx: MutationCtx): Promise<Id<"users">[]> {
  const DEMO_USERS = getDemoUsers();
  const demoUserIds: Id<"users">[] = [];

  for (const demoUser of DEMO_USERS) {
    try {
      const existing = await ctx.db
        .query("users")
        .filter((q) => q.eq(q.field("email"), demoUser.email))
        .first();

      if (existing) {
        console.log(`✅ Demo user ${demoUser.name} already exists`);
        demoUserIds.push(existing._id);
      } else {
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
 * Seed a single demo conversation about the app for a new user.
 */
export async function seedDemoChatForNewUser(
  ctx: MutationCtx,
  userId: Id<"users">,
) {
  try {
    console.log(`🌱 Starting demo chat seeding for user: ${userId}`);

    console.log("👥 Getting or creating demo users...");
    const demoUserIds = await getOrCreateDemoUsers(ctx);
    console.log(`✅ Demo users ready: ${demoUserIds.length} user(s)`);

    // ── Single Conversation: Welcome to the App ──
    console.log("💬 Creating app welcome conversation...");

    const conversationId = await ctx.db.insert("conversations", {
      type: "dm",
      createdBy: userId,
      createdAt: Date.now() - 86400000,
      updatedAt: Date.now() - 300000,
      lastMessageAt: Date.now() - 300000,
      lastMessagePreview: "Feel free to explore all the features! 🚀",
    });

    // Add the current user.
    await ctx.db.insert("participants", {
      conversationId,
      userId,
      role: "member",
      joinedAt: Date.now() - 86400000,
    });

    // Add Arya.
    await ctx.db.insert("participants", {
      conversationId,
      userId: demoUserIds[0],
      role: "member",
      joinedAt: Date.now() - 86400000,
    });

    // Welcome messages about the app.
    const messages = [
      {
        conversationId,
        senderId: demoUserIds[0],
        content: "Welcome! I'm Arya, and I'll help you explore the app.",
        createdAt: Date.now() - 3600000 * 6,
        type: "text" as const,
      },
      {
        conversationId,
        senderId: demoUserIds[0],
        content:
          "This demo chat showcases messaging, reactions, and conversation features.",
        createdAt: Date.now() - 3600000 * 5,
        type: "text" as const,
      },
      {
        conversationId,
        senderId: userId,
        content: "Awesome! What can I try first?",
        createdAt: Date.now() - 3600000 * 4,
        type: "text" as const,
      },
      {
        conversationId,
        senderId: demoUserIds[0],
        content:
          "Try sending messages, adding reactions, and exploring the conversation view.",
        createdAt: Date.now() - 3600000 * 3,
        type: "text" as const,
      },
      {
        conversationId,
        senderId: demoUserIds[0],
        content:
          "Everything you see here is seeded automatically so you can experience the app immediately.",
        createdAt: Date.now() - 3600000 * 2,
        type: "text" as const,
      },
      {
        conversationId,
        senderId: demoUserIds[0],
        content: "Feel free to explore all the features! 🚀",
        createdAt: Date.now() - 300000,
        type: "text" as const,
      },
    ];

    const messageIds: Map<number, Id<"messages">> = new Map();

    console.log(`📨 Creating ${messages.length} welcome messages...`);
    for (let i = 0; i < messages.length; i++) {
      const messageId = await ctx.db.insert("messages", messages[i]);
      messageIds.set(i, messageId);
    }

    // Add a few reactions for the demo.
    await ctx.db.insert("reactions", {
      messageId: messageIds.get(2)!,
      userId: demoUserIds[0],
      emoji: "👍",
      createdAt: Date.now() - 3600000 * 3.9,
    });

    await ctx.db.insert("reactions", {
      messageId: messageIds.get(5)!,
      userId,
      emoji: "❤️",
      createdAt: Date.now() - 240000,
    });

    console.log(
      `🎉 Demo chat seeding completed successfully for user: ${userId}`,
    );
  } catch (error) {
    console.error(`❌ Error seeding demo chat for user ${userId}:`, error);
    throw error;
  }
}
