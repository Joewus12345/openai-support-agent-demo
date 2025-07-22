'use server'

import { fileSearch } from '@/lib/tools/fileSearch';
import { localVectorStore } from '../localVectorStore';

export async function search_knowledge_base({
  query,
  provider,
  options,
}: {
  query: string;
  provider?: string;
  options?: {
    domain_filter: string | null;
    sort_by: string | null;
  };
}) {
  if (provider === 'ollama' || provider === 'ollama-openai') {
    const max_results = 20;
    const results = await localVectorStore.search(query, max_results);
    let filtered = results;
    if (options?.domain_filter) {
      const df = options.domain_filter.toLowerCase();
      filtered = filtered.filter((r) =>
        r.attributes.type.toLowerCase().includes(df)
      );
    }
    if (options?.sort_by === 'alphabetical') {
      filtered = [...filtered].sort((a, b) =>
        a.attributes.filename.localeCompare(b.attributes.filename)
      );
    }
    return { results: filtered };
  }
  return fileSearch({ query, provider });
}
