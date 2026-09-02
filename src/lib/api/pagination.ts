export interface PaginationResult {
  page: number;
  limit: number;
  skip: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface PaginationOptions {
  defaultLimit?: number;
  maxLimit?: number;
  maxPage?: number;
}

/**
 * Parse pagination params from URLSearchParams.
 * Clamps page >= 1 and limit in [1, maxLimit].
 */
export function parsePagination(
  searchParams: URLSearchParams,
  options?: PaginationOptions
): PaginationResult {
  const { defaultLimit = 50, maxLimit = 100 } = options ?? {};
  const rawPage = parseInt(searchParams.get("page") || "1", 10);
  const page = Math.max(1, Number.isNaN(rawPage) ? 1 : rawPage);
  const rawLimit = parseInt(searchParams.get("limit") || String(defaultLimit), 10);
  const limit = Math.min(maxLimit, Math.max(1, Number.isNaN(rawLimit) ? defaultLimit : rawLimit));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

/**
 * Parse pagination without correcting malformed client input.
 *
 * Public contracts that promise bounded integers use this variant so `1.5`, `0`, an unsafe
 * integer or an out-of-range limit is rejected instead of being silently truncated or clamped.
 */
export function parseStrictPagination(
  searchParams: URLSearchParams,
  options?: PaginationOptions
): PaginationResult | null {
  const { defaultLimit = 50, maxLimit = 100, maxPage = Number.MAX_SAFE_INTEGER } = options ?? {};
  const rawPage = searchParams.get("page");
  const rawLimit = searchParams.get("limit");
  const isPositiveInteger = (value: string): boolean => /^[1-9][0-9]*$/.test(value);

  if (rawPage !== null && !isPositiveInteger(rawPage)) return null;
  if (rawLimit !== null && !isPositiveInteger(rawLimit)) return null;

  const page = rawPage === null ? 1 : Number(rawPage);
  const limit = rawLimit === null ? defaultLimit : Number(rawLimit);
  if (
    !Number.isSafeInteger(page) ||
    !Number.isSafeInteger(limit) ||
    page > maxPage ||
    limit > maxLimit
  ) {
    return null;
  }

  const skip = (page - 1) * limit;
  if (!Number.isSafeInteger(skip)) return null;
  return { page, limit, skip };
}

/**
 * Build a pagination metadata object for API responses.
 */
export function buildPaginationMeta(page: number, limit: number, total: number): PaginationMeta {
  return { page, limit, total, totalPages: Math.ceil(total / limit) };
}
