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
  options,
}: {
  query?: string;
  queries?: string[];
  provider?: string;
  options?: {
    domain_filter: string | null;
    sort_by: string | null;
  };
}) {
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
      const results = await localVectorStore.search(q, max_results);
      collected = collected.concat(results);
    } else {
      const res = await fileSearch({ query: q, provider });
      if (res.results) {
        collected = collected.concat(res.results);
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

  let filtered = merged;
  if (options?.domain_filter) {
    const df = options.domain_filter.toLowerCase();
    filtered = filtered.filter((r) =>
      r.attributes?.type?.toLowerCase().includes(df)
    );
  }
  if (options?.sort_by === 'alphabetical') {
    filtered = [...filtered].sort((a, b) =>
      (a.attributes?.filename ?? '').localeCompare(b.attributes?.filename ?? '')
    );
  }

  return { results: filtered };
}
