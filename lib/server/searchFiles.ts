'use server'

import { fileSearch } from '@/lib/tools/fileSearch';

export async function search_files({
  query,
  provider,
}: {
  query: string;
  provider?: string;
}) {
  return fileSearch({ query, provider });
}
