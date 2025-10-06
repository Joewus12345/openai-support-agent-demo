import prisma from "./prisma";
import type { HandoffRequest, HandoffRequestStatus } from "./generated/prisma";
import { getConversationKey } from "./getConversationKey";

export function formatQueuePositionMessage(
  baseMessage: string,
  position: number
): string {
  const normalizedPosition = Math.max(1, Math.trunc(position));
  return `${baseMessage} You are currently number ${normalizedPosition} in the queue.`;
}

export async function enqueueRequest(
  accountId: number,
  conversationId: number,
  status: HandoffRequestStatus = "pending",
  agentId?: number,
  inboxId?: number
) {
  if (inboxId === undefined) {
    throw new Error("enqueueRequest requires an inboxId to segment the queue");
  }
  const conversationKey = getConversationKey(accountId, conversationId, inboxId);
  return prisma.handoffRequest.upsert({
    where: { conversationKey },
    update: { status, agentId, inboxId, accountId },
    create: {
      conversationKey,
      conversationId,
      status,
      agentId,
      inboxId,
      accountId,
    },
  });
}

export async function dequeueRequest(accountId: number, inboxId: number) {
  return prisma.handoffRequest.findFirst({
    where: { status: "pending", accountId, inboxId },
    orderBy: { requestedAt: "asc" },
  });
}

export async function dequeueNextPendingRequest(accountId: number) {
  return prisma.handoffRequest.findFirst({
    where: { status: "pending", accountId },
    orderBy: { requestedAt: "asc" },
  });
}

export async function updateRequest(
  conversationKey: string,
  data: {
    status?: HandoffRequestStatus;
    agentId?: number | null;
    lastPositionNotified?: number | null;
  }
) {
  return prisma.handoffRequest.update({
    where: { conversationKey },
    data,
  });
}

export async function getPendingQueue(
  accountId: number,
  inboxId: number
): Promise<HandoffRequest[]> {
  return prisma.handoffRequest.findMany({
    where: { status: "pending", accountId, inboxId },
    orderBy: { requestedAt: "asc" },
  });
}

export type QueuePositionUpdate = HandoffRequest & { position: number };

export async function updateQueuePositions(
  accountId: number,
  inboxId: number
): Promise<QueuePositionUpdate[]> {
  const queue = await getPendingQueue(accountId, inboxId);
  const updates: QueuePositionUpdate[] = [];

  await Promise.all(
    queue.map(async (request, index) => {
      const position = index + 1;
      if (request.lastPositionNotified === position) {
        return;
      }
      const updated = await prisma.handoffRequest.update({
        where: { conversationKey: request.conversationKey },
        data: { lastPositionNotified: position },
      });
      updates.push({ ...updated, position });
    })
  );

  return updates.sort((a, b) => a.requestedAt.getTime() - b.requestedAt.getTime());
}
