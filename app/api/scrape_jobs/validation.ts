export function parseTargetUrlFromArgs(
  args: unknown,
  options: { required?: boolean } = {}
): { url: string | null; provided: boolean; error?: string } {
  const record = args && typeof args === "object" ? (args as Record<string, unknown>) : {};
  const provided = "url" in record || "targetUrl" in record;
  const raw = (record as Record<string, unknown>).url ?? (record as Record<string, unknown>).targetUrl;

  if (!provided) {
    if (options.required) {
      return { url: null, provided: false, error: "args.url is required" };
    }
    return { url: null, provided: false };
  }

  if (typeof raw !== "string") {
    return { url: null, provided: true, error: "args.url must be a string" };
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return { url: null, provided: true, error: "args.url cannot be empty" };
  }

  try {
    const parsed = new URL(trimmed);
    if (!parsed.protocol.startsWith("http")) {
      return { url: null, provided: true, error: "args.url must start with http or https" };
    }
    return { url: parsed.toString(), provided: true };
  } catch {
    return { url: null, provided: true, error: "Enter a valid URL for args.url" };
  }
}

export function mergeArgsWithTarget(
  args: Record<string, unknown> | null | undefined,
  targetUrl: string | null
) {
  const merged = { ...(args ?? {}) } as Record<string, unknown>;
  if (targetUrl !== null) {
    merged.url = targetUrl;
    merged.targetUrl = targetUrl;
  }
  return merged;
}

export function deriveTargetFromArgs(args: Record<string, unknown> | null | undefined) {
  if (!args) return "";
  const candidate = (args as Record<string, unknown>).url ?? (args as Record<string, unknown>).targetUrl;
  return typeof candidate === "string" ? candidate : "";
}
