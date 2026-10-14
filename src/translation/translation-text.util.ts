const BROKEN_MARKERS = [
  'QUERY LENGTH LIMIT',
  'MAX ALLOWED QUERY',
  'MYMEMORY WARNING',
];

export function isUnusableTranslation(value?: string | null): boolean {
  if (!value || !value.trim()) return true;
  const upper = value.toUpperCase();
  return BROKEN_MARKERS.some((marker) => upper.includes(marker));
}

export function preferTranslation<T extends string | null | undefined>(
  translated: T,
  original: T,
): T {
  if (typeof translated === 'string' && !isUnusableTranslation(translated)) {
    return translated;
  }
  return original;
}

export function preferTranslationList(
  translated: string[] | null | undefined,
  original: string[] | null | undefined,
): string[] {
  const fallback = original || [];
  if (!translated || translated.length === 0) return fallback;
  if (translated.some((item) => isUnusableTranslation(item))) return fallback;
  return translated;
}
