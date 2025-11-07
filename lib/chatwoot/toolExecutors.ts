import {
  CHATWOOT_COMPLAINT_TYPES,
  CHATWOOT_CONVERSATION_ATTRIBUTE_KEYS,
  type ChatwootComplaintType,
} from "@/config/chatwootAttributes";
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

const ATTRIBUTE_KEYS = CHATWOOT_CONVERSATION_ATTRIBUTE_KEYS;

type ComplaintAttributeKey =
  (typeof ATTRIBUTE_KEYS)[keyof typeof ATTRIBUTE_KEYS];

export type CreateComplaintArgs = Partial<
  Record<ComplaintAttributeKey, unknown>
>;

type ComplaintCustomAttributes = {
  [ATTRIBUTE_KEYS.customerName]: string;
  [ATTRIBUTE_KEYS.companyName]: string;
  [ATTRIBUTE_KEYS.companyLocation]: string;
  [ATTRIBUTE_KEYS.contact]: string;
  [ATTRIBUTE_KEYS.complaintType]: ChatwootComplaintType;
  [ATTRIBUTE_KEYS.issueDescription]: string;
};

interface ComplaintRequestPayload {
  custom_attributes: ComplaintCustomAttributes;
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

function normalizeRequiredString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`create_complaint requires a string ${String(field)}`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`create_complaint requires a non-empty ${String(field)}`);
  }
  return trimmed;
}

function normalizeComplaintType(value: unknown): ChatwootComplaintType {
  const normalized = normalizeRequiredString(
    value,
    ATTRIBUTE_KEYS.complaintType
  );

  const matched = CHATWOOT_COMPLAINT_TYPES.find(
    (type) => type.toLowerCase() === normalized.toLowerCase()
  );

  if (!matched) {
    throw new Error(
      `create_complaint requires a valid ${ATTRIBUTE_KEYS.complaintType}`
    );
  }

  return matched;
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
    custom_attributes: {
      [ATTRIBUTE_KEYS.customerName]: normalizeRequiredString(
        args[ATTRIBUTE_KEYS.customerName],
        ATTRIBUTE_KEYS.customerName
      ),
      [ATTRIBUTE_KEYS.companyName]: normalizeRequiredString(
        args[ATTRIBUTE_KEYS.companyName],
        ATTRIBUTE_KEYS.companyName
      ),
      [ATTRIBUTE_KEYS.companyLocation]: normalizeRequiredString(
        args[ATTRIBUTE_KEYS.companyLocation],
        ATTRIBUTE_KEYS.companyLocation
      ),
      [ATTRIBUTE_KEYS.contact]: normalizeRequiredString(
        args[ATTRIBUTE_KEYS.contact],
        ATTRIBUTE_KEYS.contact
      ),
      [ATTRIBUTE_KEYS.complaintType]: normalizeComplaintType(
        args[ATTRIBUTE_KEYS.complaintType]
      ),
      [ATTRIBUTE_KEYS.issueDescription]: normalizeRequiredString(
        args[ATTRIBUTE_KEYS.issueDescription],
        ATTRIBUTE_KEYS.issueDescription
      ),
    },
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
