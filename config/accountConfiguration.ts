export type AccountConfigField = {
  key: string;
  label: string;
  description: string;
  group: "AI provider" | "Chatwoot" | "Ollama";
  kind: "text" | "secret" | "number" | "select" | "url";
  placeholder?: string;
  options?: { label: string; value: string }[];
};

export const ACCOUNT_CONFIG_FIELDS: AccountConfigField[] = [
  {
    key: "CHATWOOT_WEBHOOK_PROVIDER",
    label: "AI provider",
    description: "Provider used to answer messages for this account.",
    group: "AI provider",
    kind: "select",
    options: [
      { label: "OpenAI", value: "openai" },
      { label: "Ollama", value: "ollama" },
      { label: "Ollama (OpenAI compatible)", value: "ollama-openai" },
    ],
  },
  {
    key: "OPENAI_API_KEY",
    label: "OpenAI API key",
    description: "Bring-your-own key used only for this account.",
    group: "AI provider",
    kind: "secret",
    placeholder: "sk-…",
  },
  {
    key: "OPENAI_MODEL",
    label: "Default OpenAI model",
    description: "Model used when a workflow does not choose one explicitly.",
    group: "AI provider",
    kind: "text",
    placeholder: "e.g. gpt-4.1-mini…",
  },
  {
    key: "OPENAI_VECTOR_STORE_ID",
    label: "Knowledge vector store",
    description: "Vector store used only for this account's knowledge search and ingestion.",
    group: "AI provider",
    kind: "text",
    placeholder: "e.g. vs_...",
  },
  {
    key: "OPENAI_BASE_URL",
    label: "OpenAI-compatible endpoint",
    description: "Optional custom API base URL for an OpenAI-compatible service.",
    group: "AI provider",
    kind: "url",
    placeholder: "e.g. https://api.openai.com/v1…",
  },
  {
    key: "OPENAI_REQUEST_TIMEOUT_MS",
    label: "OpenAI request timeout",
    description: "Maximum request duration in milliseconds for this account.",
    group: "AI provider",
    kind: "number",
    placeholder: "e.g. 120000",
  },
  {
    key: "OPENAI_MAX_RETRIES",
    label: "OpenAI retry attempts",
    description: "SDK retries for transient connection and provider failures.",
    group: "AI provider",
    kind: "number",
    placeholder: "e.g. 2",
  },
  {
    key: "CHATWOOT_WEBHOOK_MODEL",
    label: "Chatwoot response model",
    description: "Optional model override for Chatwoot webhook responses.",
    group: "AI provider",
    kind: "text",
    placeholder: "e.g. gpt-4.1-mini…",
  },
  {
    key: "CHATWOOT_IMAGE_SEARCH_PROVIDER",
    label: "Image search provider",
    description: "Provider used to search the knowledge base for image messages.",
    group: "AI provider",
    kind: "select",
    options: [
      { label: "OpenAI", value: "openai" },
      { label: "Ollama", value: "ollama" },
      { label: "Ollama (OpenAI compatible)", value: "ollama-openai" },
    ],
  },
  {
    key: "CHATWOOT_IMAGE_MODEL",
    label: "Image model",
    description: "Vision-capable model used to understand image attachments.",
    group: "AI provider",
    kind: "text",
    placeholder: "e.g. gpt-4.1-mini…",
  },
  {
    key: "CHATWOOT_IMAGE_KB_LIMIT",
    label: "Image knowledge results",
    description: "Maximum knowledge-base matches added to an image response.",
    group: "AI provider",
    kind: "number",
    placeholder: "e.g. 3…",
  },
  {
    key: "CHATWOOT_URL",
    label: "Chatwoot URL",
    description: "Base URL of this company’s Chatwoot installation.",
    group: "Chatwoot",
    kind: "url",
    placeholder: "e.g. https://support.example.com…",
  },
  {
    key: "CHATWOOT_APP_TOKEN",
    label: "Chatwoot app token",
    description: "API token used for account-level Chatwoot operations.",
    group: "Chatwoot",
    kind: "secret",
  },
  {
    key: "CHATWOOT_BOT_TOKEN",
    label: "Chatwoot bot token",
    description: "Bot access token used to post assistant responses.",
    group: "Chatwoot",
    kind: "secret",
  },
  {
    key: "CHATWOOT_BOT_WEBHOOK_SECRET",
    label: "Bot webhook secret",
    description: "Secret used to verify bot webhook requests.",
    group: "Chatwoot",
    kind: "secret",
  },
  {
    key: "CHATWOOT_WEBHOOK_ENDPOINT_SECRET",
    label: "Webhook endpoint secret",
    description: "Secret required by the inbound Chatwoot webhook endpoint.",
    group: "Chatwoot",
    kind: "secret",
  },
  {
    key: "OLLAMA_HOST",
    label: "Ollama host",
    description: "Network address of the account’s Ollama server.",
    group: "Ollama",
    kind: "url",
    placeholder: "e.g. http://localhost:11434…",
  },
  {
    key: "OLLAMA_MODEL",
    label: "Ollama model",
    description: "Default local model for this account.",
    group: "Ollama",
    kind: "text",
    placeholder: "e.g. llama3.2…",
  },
  {
    key: "OLLAMA_NUM_CTX",
    label: "Context window",
    description: "Maximum context window sent to Ollama.",
    group: "Ollama",
    kind: "number",
    placeholder: "e.g. 16384…",
  },
  {
    key: "OLLAMA_OPENAI_BASE_URL",
    label: "Ollama OpenAI endpoint",
    description: "OpenAI-compatible Ollama API endpoint.",
    group: "Ollama",
    kind: "url",
    placeholder: "e.g. http://localhost:11434/v1…",
  },
  {
    key: "OLLAMA_OPENAI_API_KEY",
    label: "Ollama endpoint key",
    description: "Optional API key for a protected OpenAI-compatible endpoint.",
    group: "Ollama",
    kind: "secret",
  },
];

export const ACCOUNT_CONFIG_KEYS = new Set(ACCOUNT_CONFIG_FIELDS.map((field) => field.key));

export function getAccountConfigField(key: string) {
  return ACCOUNT_CONFIG_FIELDS.find((field) => field.key === key);
}
