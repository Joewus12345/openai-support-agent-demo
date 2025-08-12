import prisma from "@/lib/prisma";
import redis from "@/lib/redis";
import { MAX_SESSION_MESSAGES } from "@/config/constants";

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
    let session = await prisma.chatSession.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });
    if (!session) {
      session = await prisma.chatSession.create({
        data: { userId: user.id, messages: [] },
      });
    }
    const summary = await redis.get(identifier);
    const trimmedSession = session
      ? { ...session, messages: (session.messages as any[]).slice(-MAX_SESSION_MESSAGES) }
      : session;
    return new Response(
      JSON.stringify({ user, session: trimmedSession, summary }),
      { status: 200 }
    );
  } catch (error) {
    console.error("Error starting session:", error);
    return new Response("Error starting session", { status: 500 });
  }
}
