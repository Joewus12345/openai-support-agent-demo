export interface RelevanceResult {
  isRelevant: boolean;
  reasoning: string;
}

export interface JailbreakResult {
  isSafe: boolean;
  reasoning: string;
}

export async function checkRelevance(
  latestMessage: string
): Promise<RelevanceResult> {
  try {
    const res = await fetch("/api/guardrails/check_relevance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: latestMessage }),
    });
    if (!res.ok) throw new Error("Failed to check relevance");
    return (await res.json()) as RelevanceResult;
  } catch (error) {
    console.error("checkRelevance error:", error);
    return { isRelevant: true, reasoning: "error" };
  }
}

export async function checkJailbreak(
  latestMessage: string
): Promise<JailbreakResult> {
  try {
    const res = await fetch("/api/guardrails/check_jailbreak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: latestMessage }),
    });
    if (!res.ok) throw new Error("Failed to check jailbreak");
    return (await res.json()) as JailbreakResult;
  } catch (error) {
    console.error("checkJailbreak error:", error);
    return { isSafe: true, reasoning: "error" };
  }
}
