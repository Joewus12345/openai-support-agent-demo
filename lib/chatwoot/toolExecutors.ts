import { sendBotFormMessage } from "@/lib/chatwootBot";
import {
  buildComplaintFormContent,
  type ChatwootComplaintFormDefaults,
} from "@/lib/chatwoot/forms";

export interface ChatwootToolExecutionContext {
  accountId: number;
  conversationId: number;
  conversation?: unknown;
  message?: unknown;
}

export type ChatwootToolExecutor = (
  context: ChatwootToolExecutionContext,
  args: Record<string, unknown>
) => Promise<unknown>;

export interface SendComplaintFormArgs {
  title?: string;
  defaults?: ChatwootComplaintFormDefaults;
}

export async function send_complaint_form(
  context: ChatwootToolExecutionContext,
  rawArgs: Record<string, unknown>
) {
  const { accountId, conversationId } = context;
  if (
    typeof accountId !== "number" ||
    Number.isNaN(accountId) ||
    typeof conversationId !== "number" ||
    Number.isNaN(conversationId)
  ) {
    throw new Error("send_complaint_form requires valid account and conversation identifiers");
  }

  const args = (rawArgs || {}) as SendComplaintFormArgs;
  const defaults = (args.defaults || {}) as ChatwootComplaintFormDefaults;
  const title = typeof args.title === "string" ? args.title : undefined;

  const formContent = buildComplaintFormContent(defaults, { title });

  await sendBotFormMessage(accountId, conversationId, formContent);

  return {
    status: "sent",
    form: {
      title: formContent.title,
      fieldCount: formContent.items.length,
    },
  };
}

export const chatwootToolExecutors: Record<string, ChatwootToolExecutor> = {
  send_complaint_form: async (context, args) =>
    send_complaint_form(context, args),
};
