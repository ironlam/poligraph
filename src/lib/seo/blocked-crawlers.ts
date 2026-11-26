/**
 * Crawlers shut out of the whole site. Each one walks the long tail (communes, scrutins,
 * profiles) faster than any visitor, and most of those pages were cold: every fetch rendered
 * the page and wrote it to the ISR cache. Measured on 23-25 November 2026, these five
 * triggered about a fifth of all regenerations, for no search traffic and no visibility in an
 * answer engine: Amazonbot and Meta-ExternalAgent collect training data, AhrefsBot and
 * PetalBot feed an SEO index and a search engine with no French audience, and YandexBot no
 * longer honours `Crawl-delay`, so blocking is the only setting it reads.
 *
 * Deliberately absent: Googlebot, Bingbot (also behind ChatGPT search and Copilot),
 * PerplexityBot, OAI-SearchBot, GPTBot, ClaudeBot and the social preview bots, which bring
 * readers or citations.
 */
export const BLOCKED_USER_AGENTS = [
  "Amazonbot",
  "AhrefsBot",
  "PetalBot",
  "meta-externalagent",
  "YandexBot",
] as const;
