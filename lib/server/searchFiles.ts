'use server'

import { fileSearch } from '@/lib/tools/fileSearch';
import { localVectorStore } from '../localVectorStore';
import { generateSearchQueries } from '../generateSearchQueries';

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
    const baseParts =
      Array.isArray(queries) && queries.length > 0
        ? queries
        : query
        ? generateSearchQueries(query)
        : [];

    const searchParts = Array.from(new Set(baseParts.map((p) => p.trim())));

    const max_results = 10;
    let collected: any[] = [];

    try {
      const arrays = await Promise.all(
        searchParts.map(async (q) => {
          if (provider === 'ollama' || provider === 'ollama-openai') {
            return await localVectorStore.search(q, max_results);
          }

          const res = await fileSearch({ query: q, provider });
          if (res.error) throw new Error(res.error);
          return res.results ?? [];
        })
      );

      for (const arr of arrays) {
        collected = collected.concat(arr);
      }
    } catch (error) {
      console.error('Knowledge base search failed', error);
      return { error: error instanceof Error ? error.message : 'Failed to search files' };
    }

  const seen = new Set<string>();
  const deduped = collected.filter((r) => {
    const key = `${r.text}|${r.attributes?.filepath ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const qWords = query
    ? new Set(query.toLowerCase().split(/\W+/).filter(Boolean))
    : null;
  const textScore = (t: string) => {
    if (!qWords) return 0;
    const words = new Set(t.toLowerCase().split(/\W+/).filter(Boolean));
    let overlap = 0;
    for (const w of qWords) if (words.has(w)) overlap++;
    return overlap / (qWords.size || 1);
  };

  const ranked = deduped
    .map((r) => ({
      item: r,
      rank: ((typeof r.score === 'number' ? r.score : 0) + textScore(r.text)) / 2,
    }))
    .sort((a, b) => b.rank - a.rank)
    .slice(0, max_results)
    .map((r) => r.item);

  const results =
    provider === 'ollama' || provider === 'ollama-openai'
      ? ranked.map((r) => r.text)
      : ranked;

  return { results };
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