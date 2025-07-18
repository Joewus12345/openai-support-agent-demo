import { VECTOR_STORE_ID } from "@/config/constants";
import { localVectorStore } from "@/lib/localVectorStore";

export interface FileSearchParams {
  query: string;
  max_results?: number;
  provider?: string;
}

export async function fileSearch({
  query,
  max_results = 5,
  provider,
}: FileSearchParams) {
  // Fallback to default when max_results is missing or not positive
  max_results =
    typeof max_results === "number" && max_results > 0
      ? Math.floor(max_results)
      : 5;
  if (provider === "ollama" || "ollama-openai") {
    try {
      const results = await localVectorStore.search(query, max_results);
      return { results };
    } catch (error) {
      console.error("Local file search failed", error);
      return {
        error: error instanceof Error ? error.message : "Failed to search files",
      };
    }
  }
  try {
    const res = await fetch(
      `https://api.openai.com/v1/vector_stores/${VECTOR_STORE_ID}/search`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "OpenAI-Beta": "assistants=v2",
        },
        body: JSON.stringify({ query, max_results }),
      }
    );
    if (!res.ok) {
      return { error: await res.text() };
    }
    return await res.json();
  } catch (error) {
    console.error("Error searching files:", error);
    return {
      error: error instanceof Error ? error.message : "Failed to search files",
    };
  }
}
