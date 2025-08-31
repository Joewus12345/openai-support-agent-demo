import prisma from "./prisma";
import type { HandoffRequestStatus } from "./generated/prisma";

export async function enqueueRequest(
  conversationId: number,
  status: HandoffRequestStatus = "pending",
  agentId?: number
) {
  return prisma.handoffRequest.upsert({
    where: { conversationId },
    update: { status, agentId },
    create: { conversationId, status, agentId },
  });
}

export async function dequeueRequest() {
  return prisma.handoffRequest.findFirst({
    where: { status: "pending" },
    orderBy: { requestedAt: "asc" },
  });
}

export async function updateRequest(
  conversationId: number,
  data: { status?: HandoffRequestStatus; agentId?: number | null }
) {
  return prisma.handoffRequest.update({
    where: { conversationId },
    data,
  });
}
