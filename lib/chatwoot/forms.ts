import {
  CHATWOOT_COMPLAINT_TYPES,
  CHATWOOT_CONVERSATION_ATTRIBUTE_KEYS,
} from "@/config/chatwootAttributes";

export type ChatwootFormFieldType =
  | "text"
  | "text_area"
  | "email"
  | "select"
  | "number"
  | "date"
  | "url"
  | "phone";

export interface ChatwootFormFieldOption {
  label: string;
  value: string;
}

export interface ChatwootFormField {
  name: string;
  label: string;
  type: ChatwootFormFieldType | (string & {});
  placeholder?: string;
  default?: string;
  options?: ChatwootFormFieldOption[];
}

export interface ChatwootFormContentAttributes {
  title?: string;
  items: ChatwootFormField[];
  in_reply_to?: number;
}

const ATTRIBUTE_KEY_VALUES = CHATWOOT_CONVERSATION_ATTRIBUTE_KEYS;

type ComplaintAttributeKey =
  | keyof typeof ATTRIBUTE_KEY_VALUES
  | (typeof ATTRIBUTE_KEY_VALUES)[keyof typeof ATTRIBUTE_KEY_VALUES];

export type ChatwootComplaintFormDefaults = Partial<
  Record<ComplaintAttributeKey, string>
>;

export const COMPLAINT_TYPE_OPTIONS: ChatwootFormFieldOption[] =
  CHATWOOT_COMPLAINT_TYPES.map((value) => ({
    label: value,
    value,
  }));

function pickDefault(
  defaults: ChatwootComplaintFormDefaults | undefined,
  ...keys: ComplaintAttributeKey[]
): string | undefined {
  if (!defaults) {
    return undefined;
  }
  for (const key of keys) {
    const rawValue = defaults[key];
    if (typeof rawValue === "string") {
      const trimmed = rawValue.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }
  return undefined;
}

export const DEFAULT_COMPLAINT_FORM_TITLE = "Complaint intake form";

export function buildComplaintFormFields(
  defaults?: ChatwootComplaintFormDefaults
): ChatwootFormField[] {
  const attr = ATTRIBUTE_KEY_VALUES;
  return [
    {
      name: attr.customerName,
      label: "Customer name",
      type: "text",
      placeholder: "Customer full name",
      default: pickDefault(defaults, attr.customerName, "customerName"),
    },
    {
      name: attr.companyName,
      label: "Company name",
      type: "text",
      placeholder: "Company or organization",
      default: pickDefault(defaults, attr.companyName, "companyName"),
    },
    {
      name: attr.companyLocation,
      label: "Company location",
      type: "text",
      placeholder: "City, state, or region",
      default: pickDefault(defaults, attr.companyLocation, "companyLocation"),
    },
    {
      name: attr.contact,
      label: "Primary contact",
      type: "text",
      placeholder: "Email or phone number",
      default: pickDefault(defaults, attr.contact, "contact"),
    },
    {
      name: attr.complaintType,
      label: "Complaint type",
      type: "select",
      options: COMPLAINT_TYPE_OPTIONS,
      default: pickDefault(defaults, attr.complaintType, "complaintType"),
    },
    {
      name: attr.issueDescription,
      label: "Issue description",
      type: "text_area",
      placeholder: "Describe the issue",
      default: pickDefault(
        defaults,
        attr.issueDescription,
        "issueDescription"
      ),
    },
  ];
}

export function buildComplaintFormContent(
  defaults?: ChatwootComplaintFormDefaults,
  options?: { title?: string }
): ChatwootFormContentAttributes {
  const items = buildComplaintFormFields(defaults);
  const title = options?.title?.trim() || DEFAULT_COMPLAINT_FORM_TITLE;
  return {
    title,
    items,
  };
}
