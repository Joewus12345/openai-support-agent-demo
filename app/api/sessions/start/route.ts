import prisma from "@/lib/prisma";
import redis from "@/lib/redis";
import { MAX_SESSION_MESSAGES } from "@/config/constants";

const MESSAGE_CACHE_TTL = 60 * 60; // 1 hour

export async function POST(request: Request) {
  try {
    const { email, ticket_id, name, phone, address } = await request.json();

    const identifier = email || ticket_id;

    if (!identifier) {
      return new Response(JSON.stringify({ error: "Email is required" }), {
        status: 400,
      });
    }

    const user = await prisma.user.upsert({
      where: { email: identifier },
      update: { name, phone, address },
      create: { email: identifier, name, phone, address },
      include: { orders: true },
    });

    const sessionSelect = {
      id: true,
      userId: true,
      createdAt: true,
      updatedAt: true,
      endedAt: true,
      summary: true,
    } as const;

    let session = await prisma.chatSession.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: sessionSelect,
    });

    if (!session) {
      session = await prisma.chatSession.create({
        data: { userId: user.id, messages: [] },
        select: sessionSelect,
      });
      await redis.set(
        `session:${session.id}:messages`,
        JSON.stringify([]),
        "EX",
        MESSAGE_CACHE_TTL
      );
    }

    let messages: any[] = [];
    const cachedMessages = await redis.get(`session:${session.id}:messages`);
    if (cachedMessages) {
      messages = JSON.parse(cachedMessages);
    } else {
      const sessionWithMessages = await prisma.chatSession.findUnique({
        where: { id: session.id },
        select: { messages: true },
      });
      messages = (sessionWithMessages?.messages as any[]) || [];
      await redis.set(
        `session:${session.id}:messages`,
        JSON.stringify(messages),
        "EX",
        MESSAGE_CACHE_TTL
      );
    }

    let summary = session.summary;
    if (summary) {
      await redis.set(identifier, summary);
    } else {
      summary = await redis.get(identifier);
    }

    const trimmedSession = {
      ...session,
      summary,
      messages: messages.slice(-MAX_SESSION_MESSAGES),
    };

    return new Response(
      JSON.stringify({ user, session: trimmedSession }),
      { status: 200 }
    );
  } catch (error) {
    console.error("Error starting session:", error);
    return new Response("Error starting session", { status: 500 });
  }
}
