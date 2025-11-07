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

export interface CreateComplaintArgs {
  user_id?: unknown;
  type?: unknown;
  details?: unknown;
  order_id?: unknown;
}

interface ComplaintRequestPayload {
  user_id: string;
  type: string;
  details: string;
  order_id: string;
}

function resolveInternalApiUrl(path: string): string {
  const base =
    process.env.INTERNAL_API_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL;

  if (!base) {
    return path;
  }

  try {
    return new URL(path, base).toString();
  } catch (error) {
    console.warn(
      "[chatwoot]",
      "resolveInternalApiUrl",
      "failed to resolve URL",
      error
    );
    return path;
  }
}

function normalizeRequiredString(
  value: unknown,
  field: keyof ComplaintRequestPayload
): string {
  if (typeof value !== "string") {
    throw new Error(`create_complaint requires a string ${String(field)}`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`create_complaint requires a non-empty ${String(field)}`);
  }
  return trimmed;
}

async function postJsonWithLogging<T>(
  path: string,
  payload: ComplaintRequestPayload
): Promise<T> {
  const url = resolveInternalApiUrl(path);
  console.info("[chatwoot]", "POST", url, JSON.stringify(payload));
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    console.error(
      "[chatwoot]",
      "create_complaint",
      response.status,
      errorText
    );
    throw new Error(
      `create_complaint request failed with status ${response.status}`
    );
  }

  if (response.status === 204) {
    return {} as T;
  }

  try {
    return (await response.json()) as T;
  } catch (error) {
    console.warn(
      "[chatwoot]",
      "create_complaint",
      "response JSON parse failed",
      error
    );
    return {} as T;
  }
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

export async function submitChatwootComplaint(
  rawArgs: Record<string, unknown> | CreateComplaintArgs
) {
  const args = (rawArgs || {}) as CreateComplaintArgs;

  const payload: ComplaintRequestPayload = {
    user_id: normalizeRequiredString(args.user_id, "user_id"),
    type: normalizeRequiredString(args.type, "type"),
    details: normalizeRequiredString(args.details, "details"),
    order_id: normalizeRequiredString(args.order_id, "order_id"),
  };

  const response = await postJsonWithLogging<Record<string, unknown>>(
    "/api/complaints/create",
    payload
  );

  return {
    status: "submitted",
    complaint: response,
  };
}

export async function create_complaint(
  _context: ChatwootToolExecutionContext,
  rawArgs: Record<string, unknown>
) {
  return submitChatwootComplaint(rawArgs);
}

export const chatwootToolExecutors: Record<string, ChatwootToolExecutor> = {
  send_complaint_form: async (context, args) =>
    send_complaint_form(context, args),
  create_complaint: async (context, args) =>
    create_complaint(context, args),
};
