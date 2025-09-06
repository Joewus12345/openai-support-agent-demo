import prisma from "./prisma";
import type { HandoffRequestStatus } from "./generated/prisma";
import { getConversationKey } from "./getConversationKey";

export async function enqueueRequest(
  accountId: number,
  conversationId: number,
  status: HandoffRequestStatus = "pending",
  agentId?: number,
  inboxId?: number
) {
  const conversationKey = getConversationKey(accountId, conversationId, inboxId);
  return prisma.handoffRequest.upsert({
    where: { conversationKey },
    update: { status, agentId },
    create: { conversationKey, conversationId, status, agentId },
  });
}

export async function dequeueRequest() {
  return prisma.handoffRequest.findFirst({
    where: { status: "pending" },
    orderBy: { requestedAt: "asc" },
  });
}

export async function updateRequest(
  conversationKey: string,
  data: { status?: HandoffRequestStatus; agentId?: number | null }
) {
  return prisma.handoffRequest.update({
    where: { conversationKey },
    data,
  });
}
