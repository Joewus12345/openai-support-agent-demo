import prisma from "./prisma";
import { listAgents } from "./chatwoot";

export interface AgentRecord {
  id: number;
  availability_status: string;
  role?: "agent" | "administrator";
  [key: string]: any;
}

export async function getNextAgent(
  accountId: number
): Promise<AgentRecord | null> {
  const agents: AgentRecord[] = await listAgents(accountId, "available");
  // Double-check the API response to ensure only available agents are considered
  const availableAgents = agents.filter(
    (a) => a.availability_status === "available"
  );
  console.info(
    "[agentRotation] fetched agents",
    { accountId, agents: availableAgents.map((a) => ({ id: a.id, availability_status: a.availability_status })) }
  );
  if (availableAgents.length === 0) {
    return null;
  }

  const existing = await prisma.agentAssignment.findMany({
    where: { inboxId: accountId },
  });
  const availableIds = new Set(availableAgents.map((a) => a.id));
  const existingIds = new Set(existing.map((a) => a.agentId));

  const newAgents = availableAgents.filter((a) => !existingIds.has(a.id));
  if (newAgents.length > 0) {
    await prisma.agentAssignment.createMany({
      data: newAgents.map((a) => ({
        inboxId: accountId,
        agentId: a.id,
        lastAssignedAt: new Date(0),
      })),
    });
  }

  const offlineIds = existing
    .filter((a) => !availableIds.has(a.agentId))
    .map((a) => a.agentId);
  if (offlineIds.length > 0) {
    await prisma.agentAssignment.deleteMany({
      where: {
        inboxId: accountId,
        agentId: { in: offlineIds },
      },
    });
  }

  const nextAssignment = await prisma.agentAssignment.findFirst({
    where: { inboxId: accountId },
    orderBy: { lastAssignedAt: "asc" },
  });
  if (!nextAssignment) {
    return null;
  }

  const nextAgent = availableAgents.find(
    (a) => a.id === nextAssignment.agentId
  );
  if (!nextAgent) {
    return null;
  }

  await prisma.agentAssignment.update({
    where: {
      inboxId_agentId: {
        inboxId: accountId,
        agentId: nextAssignment.agentId,
      },
    },
    data: { lastAssignedAt: new Date() },
  });

  return nextAgent;
}

export async function setActiveConversation(
  agentId: number,
  conversationId: number
) {
  await prisma.agentAssignment.updateMany({
    where: { agentId },
    data: { activeConversationId: conversationId },
  });
}

export async function clearActiveConversation(agentId: number) {
  await prisma.agentAssignment.updateMany({
    where: { agentId },
    data: { activeConversationId: null },
  });
}
