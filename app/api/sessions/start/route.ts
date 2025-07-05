import prisma from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const { email, name, phone, address } = await request.json();
    if (!email) {
      return new Response(JSON.stringify({ error: "Email is required" }), {
        status: 400,
      });
    }
    const user = await prisma.user.upsert({
      where: { email },
      update: { name, phone, address },
      create: { email, name, phone, address },
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
    return new Response(JSON.stringify({ user, session }), { status: 200 });
  } catch (error) {
    console.error("Error starting session:", error);
    return new Response("Error starting session", { status: 500 });
  }
}
