export interface SearchOptions {
  domain_filter: string | null;
  sort_by: string | null;
}

export function inferSearchOptions(query: string): SearchOptions {
  const q = query.toLowerCase();

  let domain: string | null = null;
  if (/csr|corporate social responsibility/.test(q)) {
    domain = 'csr initiatives';
  } else if (/training|course|program/.test(q)) {
    domain = 'training programs';
  } else if (/certification|certificate/.test(q)) {
    domain = 'certifications';
  } else if (/product|price|sell|catalog|shop|store/.test(q)) {
    domain = 'products';
  } else if (/service|support|installation|maintenance/.test(q)) {
    domain = 'services';
  } else if (/personnel|staff|employee|team/.test(q)) {
    domain = 'personnel';
  } else if (/company|about us|overview|history/.test(q)) {
    domain = 'company overview';
  }

  let sort: string | null = 'relevance';
  if (/alphabetical|a\s*-\s*z/.test(q)) {
    sort = 'alphabetical';
  } else if (/latest|recent|newest|date/.test(q)) {
    sort = 'date';
  } else if (/popular|top|best/.test(q)) {
    sort = 'popularity';
  }

  return { domain_filter: domain, sort_by: sort };
}