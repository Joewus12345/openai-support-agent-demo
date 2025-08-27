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
  const onlineAgents = agents.filter(
    (a) => a.availability_status === "online"
  );
  if (onlineAgents.length === 0) {
    return null;
  }

  const assignment = await prisma.agentAssignment.findUnique({
    where: { inboxId },
  });
  const lastAgentId = assignment?.agentId;
  let nextIndex = 0;
  if (lastAgentId !== undefined && lastAgentId !== null) {
    const lastIndex = onlineAgents.findIndex((a) => a.id === lastAgentId);
    if (lastIndex >= 0) {
      nextIndex = (lastIndex + 1) % onlineAgents.length;
    }
  }

  const nextAgent = onlineAgents[nextIndex];
  await prisma.agentAssignment.upsert({
    where: { inboxId },
    update: { agentId: nextAgent.id, lastAssignedAt: new Date() },
    create: {
      inboxId,
      agentId: nextAgent.id,
      lastAssignedAt: new Date(),
    },
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