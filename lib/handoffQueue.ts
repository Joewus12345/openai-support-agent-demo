import prisma from "./prisma";
import { HandoffRequestStatus } from "@prisma/client";

export async function enqueueRequest(
  conversationId: number,
  status: HandoffRequestStatus = "pending",
  agentId?: number
) {
  return prisma.handoffRequest.create({
    data: { conversationId, status, agentId },
  });
}

export async function dequeueRequest() {
  const request = await prisma.handoffRequest.findFirst({
    where: { status: "pending" },
    orderBy: { requestedAt: "asc" },
  });
  if (!request) return null;
  await prisma.handoffRequest.update({
    where: { conversationId: request.conversationId },
    data: { status: "awaiting_confirmation" },
  });
  return request;
}

export async function updateRequest(
  conversationId: number,
  data: { status?: HandoffRequestStatus; agentId?: number }
) {
  return prisma.handoffRequest.update({
    where: { conversationId },
    data,
  });
}
