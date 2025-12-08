import crypto from "crypto";

import prisma from "@/lib/prisma";
import { unauthorized, verifySignedVerificationToken } from "@/lib/server/auth";

function extractTokenFromMessage(messageText: string) {
  // Accept `/start <token>`, `/start\n<token>`, and tolerate extra whitespace.
  const trimmed = messageText.trim();
  const afterCommand = trimmed.replace(/^\/start\s*/i, "");
  const candidate = afterCommand.split(/\s+/)[0];
  return candidate || null;
}

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
  const tokenPart = extractTokenFromMessage(messageText);
  if (!tokenPart) {
    console.warn("[telegram] Missing token in message", { chatId, messageText });
    return unauthorized("Invalid token", 400);
  }

  const parsed = verifySignedVerificationToken(tokenPart);
  if (!parsed) {
    console.warn("[telegram] Token failed signature/format check", { chatId });
    return unauthorized("Invalid token", 400);
  }

  const tokenHash = crypto.createHash("sha256").update(parsed.token).digest("hex");
  const loginToken = await prisma.loginToken.findUnique({ include: { agent: true }, where: { id: parsed.tokenId } });
  if (!loginToken || !loginToken.agent) {
    console.warn("[telegram] Token not found", { chatId, tokenId: parsed.tokenId });
    return unauthorized("Unknown token", 400);
  }

  if (loginToken.tokenHash !== tokenHash) {
    console.warn("[telegram] Token hash mismatch", { chatId, tokenId: parsed.tokenId });
    return unauthorized("Invalid token", 400);
  }

  if (loginToken.expiresAt.getTime() < Date.now()) {
    console.warn("[telegram] Token expired", { chatId, tokenId: parsed.tokenId });
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

  console.info("[telegram] Token verified", { chatId, tokenId: parsed.tokenId, agentId: loginToken.agentId });
  return new Response("ok", { status: 200 });
}
