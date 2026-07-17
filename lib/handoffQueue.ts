import prisma from "./prisma";
import type { HandoffRequest, HandoffRequestStatus } from "./generated/prisma";
import { getConversationKey } from "./getConversationKey";
import { getRuntimeTenantAccountId } from "./accounts/constants";

export type QueueScope = {
  accountId: number;
  inboxId?: number;
};

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
  const tenantAccountId = getRuntimeTenantAccountId();
  const nextStatus = status ?? "pending";
  type UpsertArgs = Parameters<typeof prisma.handoffRequest.upsert>[0];
  const updateData: UpsertArgs["update"] = {
    status: nextStatus,
    agentId,
    inboxId,
    accountId,
  };
  if (nextStatus === "pending") {
    updateData.requestedAt = new Date();
    updateData.lastPositionNotified = null;
  }
  return prisma.handoffRequest.upsert({
    where: { conversationKey, tenantAccountId },
    update: updateData,
    create: {
      conversationKey,
      tenantAccountId,
      conversationId,
      status: nextStatus,
      agentId,
      inboxId,
      accountId,
    },
  });
}

async function getPendingRequests(scope: QueueScope): Promise<HandoffRequest[]> {
  const tenantAccountId = getRuntimeTenantAccountId();
  return prisma.handoffRequest.findMany({
    where: {
      tenantAccountId,
      status: "pending",
      accountId: scope.accountId,
      ...(scope.inboxId === undefined ? {} : { inboxId: scope.inboxId }),
    },
    orderBy: { requestedAt: "asc" },
  });
}

export async function dequeueRequest(accountId: number, inboxId: number) {
  const queue = await getPendingRequests({ accountId, inboxId });
  return queue[0] ?? null;
}

export async function dequeueNextPendingRequest(accountId: number) {
  const queue = await getPendingRequests({ accountId });
  return queue[0] ?? null;
}

export async function updateRequest(
  conversationKey: string,
  data: {
    status?: HandoffRequestStatus;
    agentId?: number | null;
    lastPositionNotified?: number | null;
  }
) {
  const tenantAccountId = getRuntimeTenantAccountId();
  return prisma.handoffRequest.update({
    where: { conversationKey, tenantAccountId },
    data,
  });
}

export async function getPendingQueue(
  accountId: number,
  inboxId: number
): Promise<HandoffRequest[]> {
  return getPendingRequests({ accountId, inboxId });
}

export type QueuePositionUpdate = HandoffRequest & { position: number };

export async function updateQueuePositions(
  scope: QueueScope
): Promise<QueuePositionUpdate[]> {
  const queue = await getPendingRequests(scope);
  const updates: QueuePositionUpdate[] = [];

  await Promise.all(
    queue.map(async (request, index) => {
      const position = index + 1;
      if (request.lastPositionNotified === position) {
        return;
      }
      const updated = await prisma.handoffRequest.update({
        where: {
          conversationKey: request.conversationKey,
          tenantAccountId: request.tenantAccountId,
        },
        data: { lastPositionNotified: position },
      });
      updates.push({ ...updated, position });
    })
  );

  return updates.sort((a, b) => a.requestedAt.getTime() - b.requestedAt.getTime());
}
