/**
 * Supabase can occasionally spend more than Prisma's five-second default inside a measure
 * transition, especially when the transition also refreshes its search document. Keep this
 * below PostgreSQL's 30-second statement timeout while leaving enough room for ordinary pooler
 * jitter.
 */
export const PRISMA_TRANSACTION_OPTIONS = {
  maxWait: 5_000,
  timeout: 15_000,
} as const;
