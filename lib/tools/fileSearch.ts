import { VECTOR_STORE_ID, DEFAULT_SEARCH_LIMIT } from "@/config/constants";
import { localVectorStore } from "@/lib/localVectorStore";

const OLLAMA_SEARCH_THRESHOLD = Number(
  process.env.OLLAMA_SEARCH_THRESHOLD ?? 0.3,
);

/**
 * Parameters for searching files locally or via the OpenAI Vector Store.
 *
 * `limit` controls the maximum number of results returned (defaults to 10).
 * `threshold` sets the minimum cosine similarity when `topKOnly` is false.
 * When `topKOnly` is true, only the top `limit` matches are returned.
 */
export interface FileSearchParams {
  query: string;
  provider?: string;
  limit?: number;
  threshold?: number;
  topKOnly?: boolean;
}

export async function fileSearch({
  query,
  provider,
  limit,
  threshold,
  topKOnly,
}: FileSearchParams) {
  const searchLimit = limit ?? DEFAULT_SEARCH_LIMIT;
  if (provider?.includes("ollama")) {
    try {
      const results = await localVectorStore.search(query, {
        limit: searchLimit,
        threshold: threshold ?? OLLAMA_SEARCH_THRESHOLD,
        topKOnly,
      });
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
        body: JSON.stringify({
          query,
          limit: searchLimit,
          max_results: searchLimit,
        }),
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

