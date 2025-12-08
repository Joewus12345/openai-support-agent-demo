import crypto from "crypto";

import prisma from "@/lib/prisma";
import { unauthorized, verifySignedVerificationToken } from "@/lib/server/auth";

export async function POST(request: Request) {
  const update = (await request.json().catch(() => null)) as {
    message?: { text?: string; chat?: { id?: number | string } };
  } | null;

  const messageText = update?.message?.text ?? "";
  const chatIdValue = update?.message?.chat?.id;
  if (!chatIdValue || !messageText) {
    return new Response("ignored", { status: 200 });
  }

  const chatId = chatIdValue.toString();
  const tokenPart = messageText.split(" ")[1] ?? messageText.replace("/start", "").trim();
  const parsed = verifySignedVerificationToken(tokenPart);
  if (!parsed) {
    return unauthorized("Invalid token", 400);
  }

  const tokenHash = crypto.createHash("sha256").update(parsed.token).digest("hex");
  const loginToken = await prisma.loginToken.findUnique({ include: { agent: true }, where: { id: parsed.tokenId } });
  if (!loginToken || !loginToken.agent) {
    return unauthorized("Unknown token", 400);
  }

  if (loginToken.tokenHash !== tokenHash) {
    return unauthorized("Invalid token", 400);
  }

  if (loginToken.expiresAt.getTime() < Date.now()) {
    return unauthorized("Expired", 400);
  }

  await prisma.$transaction([
    prisma.loginToken.update({
      where: { id: loginToken.id },
      data: { consumedAt: new Date() },
    }),
    prisma.agentAccount.update({
      where: { userId: loginToken.agentId },
      data: { telegramChatId: chatId },
    }),
    prisma.loginAudit.create({
      data: {
        agentId: loginToken.agentId,
        status: "verified",
        note: `chat:${chatId}`,
      },
    }),
  ]);

  return new Response("ok", { status: 200 });
}
