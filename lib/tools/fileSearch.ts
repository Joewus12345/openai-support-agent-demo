import { VECTOR_STORE_ID } from "@/config/constants";

export interface FileSearchParams {
  query: string;
  max_results?: number;
}

export async function fileSearch({ query, max_results = 5 }: FileSearchParams) {
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
        body: JSON.stringify({ query, max_num_results: max_results }),
      }
    );
    if (!res.ok) {
      return { error: await res.text() };
    }
    return await res.json();
  } catch (error) {
    console.error("Error searching files:", error);
    return { error: "Failed to search files" };
  }
}
