import prisma from "./prisma";
import { listAgents } from "./chatwoot";

export interface AgentRecord {
  id: number;
  availability_status: string;
  [key: string]: any;
}

export async function getNextAgent(
  inboxId: number
): Promise<AgentRecord | null> {
  const agents: AgentRecord[] = await listAgents(inboxId);
  // Log agent availability to verify Chatwoot's status strings
  console.info(
    "[agentRotation] fetched agents",
    agents.map((a) => ({ id: a.id, availability_status: a.availability_status }))
  );
  // Chatwoot marks active agents with "online" rather than "available"
  const onlineAgents = agents.filter(
    (a) => a.availability_status === "online"
  );
  if (onlineAgents.length === 0) {
    return null;
  }

  const existing = await prisma.agentAssignment.findMany({
    where: { inboxId },
  });
  const onlineIds = new Set(onlineAgents.map((a) => a.id));
  const existingIds = new Set(existing.map((a) => a.agentId));

  const newAgents = onlineAgents.filter((a) => !existingIds.has(a.id));
  if (newAgents.length > 0) {
    await prisma.agentAssignment.createMany({
      data: newAgents.map((a) => ({
        inboxId,
        agentId: a.id,
        lastAssignedAt: new Date(0),
      })),
    });
  }

  const offlineIds = existing
    .filter((a) => !onlineIds.has(a.agentId))
    .map((a) => a.agentId);
  if (offlineIds.length > 0) {
    await prisma.agentAssignment.deleteMany({
      where: {
        inboxId,
        agentId: { in: offlineIds },
      },
    });
  }

  const nextAssignment = await prisma.agentAssignment.findFirst({
    where: { inboxId },
    orderBy: { lastAssignedAt: "asc" },
  });
  if (!nextAssignment) {
    return null;
  }

  const nextAgent = onlineAgents.find((a) => a.id === nextAssignment.agentId);
  if (!nextAgent) {
    return null;
  }

  await prisma.agentAssignment.update({
    where: {
      inboxId_agentId: {
        inboxId,
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
