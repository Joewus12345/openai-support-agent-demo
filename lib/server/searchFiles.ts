'use server'

import { fileSearch } from '@/lib/tools/fileSearch';
import { localVectorStore } from '../localVectorStore';

// Break a user query into smaller search phrases when `queries` isn't provided
function splitQueries(query: string): string[] {
  return query
    .split(/(?:[.!?;,]|\band\b|\bor\b)/i)
    .map((p) => p.trim())
    .filter((p) => p);
}

/**
 * Search the knowledge base using one or multiple queries.
 * If `queries` is not provided, the single `query` string will be split into
 * shorter phrases to broaden the search.
 */
export async function search_knowledge_base({
  query,
  queries,
  provider,
}: {
  query?: string;
  queries?: string[];
  provider?: string;
}) {
  try {
    const searchParts =
      queries && queries.length > 0
        ? queries
        : query
        ? splitQueries(query)
        : [];

    const max_results = 20;
    let collected: any[] = [];

    for (const q of searchParts) {
      if (provider === 'ollama' || provider === 'ollama-openai') {
        try {
          const results = await localVectorStore.search(q, max_results);
          collected = collected.concat(results);
        } catch (error) {
          console.error('Local file search failed', error);
          return {
            error:
              error instanceof Error
                ? error.message
                : 'Failed to search files',
          };
        }
      } else {
        const res = await fileSearch({ query: q, provider });
        if (res.results) {
          collected = collected.concat(res.results);
        } else if (res.error) {
          return { error: res.error };
        }
      }
    }

  const seen = new Set<string>();
  const merged = collected.filter((r) => {
    const key = `${r.text}|${r.attributes?.filepath ?? ''}|${r.attributes?.chunk ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { results: merged };
  } catch (error) {
    console.error('Error searching knowledge base', error);
    return {
      error:
        error instanceof Error
          ? error.message
          : 'Failed to search files',
    };
  }
}