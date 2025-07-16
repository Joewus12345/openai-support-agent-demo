'use server'

import { fileSearch } from '@/lib/tools/fileSearch';

export async function search_files({
  query,
  max_results,
  provider,
}: {
  query: string;
  max_results?: number;
  provider?: string;
}) {
  return fileSearch({ query, max_results, provider });
}
