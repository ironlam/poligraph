export const SOCIAL_CATEGORIES = [
  "affaires",
  "votes",
  "elections",
  "methodo",
  "factchecks",
  "profil",
  "chiffres",
  "presence",
  "opendata",
  "civique",
] as const;

export type SocialCategory = (typeof SOCIAL_CATEGORIES)[number];

/** All categories require editorial review */
export const SENSITIVE_CATEGORIES: SocialCategory[] = [...SOCIAL_CATEGORIES];

export function isSensitiveCategory(category: SocialCategory): boolean {
  return SENSITIVE_CATEGORIES.includes(category);
}

/**
 * Categories whose posts publish only after an approval in /admin/social, even from the MCP server.
 * A confirmation inside Claude is a click in the same conversation that wrote the post; for judicial
 * affairs (presumption of innocence, RGPD art. 10) the gate has to be one Claude cannot reach.
 */
export const ADMIN_APPROVAL_CATEGORIES: readonly SocialCategory[] = ["affaires"];

export function requiresAdminApproval(category: string): boolean {
  return (ADMIN_APPROVAL_CATEGORIES as readonly string[]).includes(category);
}

/** Kill switch — set SOCIAL_AUTO_POST=false to disable posting */
export function isAutoPostEnabled(): boolean {
  return process.env.SOCIAL_AUTO_POST !== "false";
}

/** Category priority order (index = priority, lower = higher priority) */
export const CATEGORY_PRIORITY: SocialCategory[] = [
  "affaires",
  "votes",
  "elections",
  "methodo",
  "factchecks",
  "profil",
  "chiffres",
  "presence",
];

/** Methodo posts limited to 1 per week */
export const METHODO_COOLDOWN_DAYS = 7;

export const SLACK_SOCIAL_WEBHOOK_URL = process.env.SLACK_SOCIAL_WEBHOOK_URL;
export { SITE_URL } from "@/config/site";
