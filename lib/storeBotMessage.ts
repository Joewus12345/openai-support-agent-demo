import { getConversationKey } from "@/lib/getConversationKey";
import {
  getNumericId,
  storeAssistantMessage,
  type StoreAssistantMessageParams,
} from "@/lib/storeConversationMessage";

export type BotMessageIdentifiers = {
  messageId?: number;
  sourceId?: number;
  inboxId?: number;
};

export type StoreBotMessageParams = {
  accountId: number;
  conversationId: number;
  messageId: number;
  inboxId: number;
  payload?: unknown;
  sourceId?: number;
  fallbackContent?: string;
  conversationKey?: string;
  createdAt?: StoreAssistantMessageParams["createdAt"];
};

export type StoreBotMessageResult = {
  stored: true;
  messageId: number;
  inboxId: number;
  sourceId?: number;
  conversationKey: string;
  content: string;
};

export function resolveBotMessageIdentifiers(payload: unknown): BotMessageIdentifiers {
  if (!payload || typeof payload !== "object") {
    return {};
  }

  const record = payload as Record<string, unknown>;

  const messageId =
    getNumericId((record as any)?.id) ??
    getNumericId((record as any)?.message_id) ??
    undefined;

  const sourceId = getNumericId((record as any)?.source_id) ?? undefined;

  let inboxId = getNumericId((record as any)?.inbox_id) ?? undefined;
  if (inboxId === undefined) {
    const conversation = (record as any)?.conversation;
    if (conversation && typeof conversation === "object") {
      inboxId = getNumericId((conversation as any)?.inbox_id) ?? undefined;
    }
  }
  if (inboxId === undefined) {
    inboxId = getNumericId((record as any)?.inboxId) ?? undefined;
  }

  return { messageId, sourceId, inboxId };
}

export async function storeBotMessage({
  accountId,
  conversationId,
  messageId,
  inboxId,
  payload,
  sourceId,
  fallbackContent,
  conversationKey: providedConversationKey,
  createdAt: explicitCreatedAt,
}: StoreBotMessageParams): Promise<StoreBotMessageResult> {
  const record =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : undefined;

  const contentValue =
    typeof record?.content === "string"
      ? record.content
      : typeof fallbackContent === "string"
        ? fallbackContent
        : "";

  const createdAtValue =
    explicitCreatedAt ??
    ((record?.created_at ?? record?.createdAt) as
      | Date
      | string
      | number
      | null
      | undefined);

  const resolvedSourceId =
    sourceId ?? (record ? getNumericId((record as any)?.source_id) ?? undefined : undefined);

  const conversationKey =
    typeof providedConversationKey === "string" && providedConversationKey.trim().length > 0
      ? providedConversationKey
      : getConversationKey(accountId, conversationId, inboxId);

  await storeAssistantMessage({
    accountId,
    conversationId,
    inboxId,
    conversationKey,
    messageId,
    content: contentValue,
    createdAt: createdAtValue,
  });

  return {
    stored: true,
    messageId,
    inboxId,
    sourceId: resolvedSourceId,
    conversationKey,
    content: contentValue,
  };
}
