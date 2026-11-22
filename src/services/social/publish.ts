import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma";
import {
  checkBlueskyAccount,
  checkXAccount,
  publishToBluesky,
  publishToX,
} from "@/lib/api/social-networks";
import { isAutoPostEnabled, requiresAdminApproval } from "@/lib/social/config";
import {
  buildDiagnostic,
  diagnoseBlueskyError,
  diagnoseXError,
  type SocialDiagnostic,
  type SocialNetwork,
} from "@/lib/social/diagnostic";
import { validateBlueskyText, validateXText } from "@/lib/social/validation";

const DEFAULT_DAILY_CAP = 6;

export type NetworkOutcome =
  | { reseau: SocialNetwork; statut: "publie"; url: string }
  | { reseau: SocialNetwork; statut: "ignore"; raison: string; url?: string }
  | { reseau: SocialNetwork; statut: "echec"; diagnostic: SocialDiagnostic };

export type PublishResult =
  | { ok: true; id: string; complet: boolean; resultats: NetworkOutcome[] }
  | { ok: false; id: string; refus: string };

export interface PublishOptions {
  allowLinkOnX?: boolean;
  /** Who asked, for the audit log: the OAuth client behind the MCP call. */
  actor: string;
  now?: Date;
}

export function getDailyCap(): number {
  const configured = Number(process.env.SOCIAL_DAILY_CAP);
  if (Number.isInteger(configured) && configured >= 0) return configured;
  return DEFAULT_DAILY_CAP;
}

/** Midnight in Paris, as a UTC instant: the daily cap follows the reader's day, not the server's. */
export function startOfParisDay(now: Date): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const parisWallClockAsUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second")
  );
  const offsetMs = parisWallClockAsUtc - Math.floor(now.getTime() / 1000) * 1000;
  return new Date(Date.UTC(get("year"), get("month") - 1, get("day")) - offsetMs);
}

async function countPublishedToday(network: SocialNetwork, now: Date): Promise<number> {
  const since = startOfParisDay(now);
  // `NOT: { field: null }` rather than `{ not: null }`, which Prisma 7 rejects on some nullable fields.
  if (network === "bluesky") {
    return db.socialPost.count({
      where: { NOT: { blueskyUrl: null }, postedAt: { gte: since } },
    });
  }
  return db.socialPost.count({
    where: { NOT: { twitterUrl: null }, postedAt: { gte: since } },
  });
}

async function publishOn(network: SocialNetwork, text: string): Promise<NetworkOutcome> {
  try {
    if (network === "bluesky") {
      const { url } = await publishToBluesky(text);
      return { reseau: network, statut: "publie", url };
    }
    const { url } = await publishToX(text);
    return { reseau: network, statut: "publie", url };
  } catch (error) {
    let diagnostic: SocialDiagnostic;
    if (network === "bluesky") {
      diagnostic = diagnoseBlueskyError(error);
    } else {
      diagnostic = diagnoseXError(error);
    }
    console.error(`[social] publication ${network} en échec : ${diagnostic.code}`, error);
    return { reseau: network, statut: "echec", diagnostic };
  }
}

/**
 * Publishes one stored post on the requested networks. Each network succeeds or fails on its own:
 * a post that reached Bluesky but not X keeps its Bluesky URL, and a retry only targets X.
 */
export async function publishSocialPost(
  id: string,
  networks: SocialNetwork[],
  options: PublishOptions
): Promise<PublishResult> {
  const now = options.now ?? new Date();
  if (!isAutoPostEnabled()) {
    return { ok: false, id, refus: "Publication coupée (SOCIAL_AUTO_POST=false sur Vercel)." };
  }

  const post = await db.socialPost.findUnique({ where: { id } });
  if (!post) return { ok: false, id, refus: "Brouillon introuvable." };
  if (post.status === "REJECTED") return { ok: false, id, refus: "Ce brouillon a été rejeté." };
  if (requiresAdminApproval(post.category) && post.status === "PENDING_REVIEW") {
    return {
      ok: false,
      id,
      refus:
        "Catégorie « affaires » : le post doit d'abord être approuvé dans /admin/social (présomption d'innocence, RGPD art. 10).",
    };
  }

  const cap = getDailyCap();
  const results: NetworkOutcome[] = [];
  for (const network of [...new Set(networks)]) {
    const text = network === "bluesky" ? post.content : (post.twitterContent ?? "");
    const existingUrl = network === "bluesky" ? post.blueskyUrl : post.twitterUrl;

    if (existingUrl) {
      results.push({ reseau: network, statut: "ignore", raison: "Déjà publié.", url: existingUrl });
      continue;
    }
    if (text.length === 0) {
      results.push({ reseau: network, statut: "ignore", raison: "Pas de texte pour ce réseau." });
      continue;
    }
    let problems: string[];
    if (network === "bluesky") {
      problems = validateBlueskyText(text);
    } else {
      problems = validateXText(text, { allowLink: options.allowLinkOnX });
    }
    if (problems.length > 0) {
      results.push({
        reseau: network,
        statut: "echec",
        diagnostic: buildDiagnostic(network, "CONTENT_REJECTED", { detail: problems.join(" ") }),
      });
      continue;
    }
    if ((await countPublishedToday(network, now)) >= cap) {
      results.push({
        reseau: network,
        statut: "ignore",
        raison: `Plafond quotidien atteint (${cap} posts, SOCIAL_DAILY_CAP).`,
      });
      continue;
    }
    results.push(await publishOn(network, text));
  }

  const published = new Map(
    results.flatMap((result) =>
      result.statut === "publie" ? [[result.reseau, result.url] as const] : []
    )
  );
  const blueskyUrl = published.get("bluesky") ?? post.blueskyUrl;
  const twitterUrl = published.get("x") ?? post.twitterUrl;
  const failures = results.flatMap((result) =>
    result.statut === "echec" ? [result.diagnostic] : []
  );
  const complete =
    (post.content.length === 0 || blueskyUrl !== null) &&
    (!post.twitterContent || twitterUrl !== null);

  await db.socialPost.update({
    where: { id },
    data: {
      blueskyUrl,
      twitterUrl,
      error: failures.length > 0 ? JSON.stringify(failures) : null,
      postedAt: published.size > 0 ? (post.postedAt ?? now) : post.postedAt,
      // Never downgraded on failure: an approved affaire stays approved and can be retried.
      status: complete ? "POSTED" : post.status,
    },
  });
  await db.auditLog.create({
    data: {
      action: "SOCIAL_PUBLISH",
      entityType: "SocialPost",
      entityId: id,
      changes: { networks, results } as unknown as Prisma.InputJsonValue,
      userId: options.actor,
    },
  });

  return { ok: true, id, complet: complete, resultats: results };
}

export type AccountCheck =
  | { reseau: SocialNetwork; ok: true; compte: string }
  | { reseau: SocialNetwork; ok: false; diagnostic: SocialDiagnostic };

/** Tests both sets of credentials without posting anything. */
export async function checkSocialAccounts(): Promise<AccountCheck[]> {
  const [bluesky, x] = await Promise.allSettled([checkBlueskyAccount(), checkXAccount()]);

  const checks: AccountCheck[] = [];
  if (bluesky.status === "fulfilled") {
    checks.push({ reseau: "bluesky", ok: true, compte: bluesky.value.handle });
  } else {
    checks.push({ reseau: "bluesky", ok: false, diagnostic: diagnoseBlueskyError(bluesky.reason) });
  }

  if (x.status === "rejected") {
    checks.push({ reseau: "x", ok: false, diagnostic: diagnoseXError(x.reason) });
  } else if (x.value.accessLevel !== null && !x.value.accessLevel.includes("write")) {
    checks.push({
      reseau: "x",
      ok: false,
      diagnostic: buildDiagnostic("x", "INSUFFICIENT_PERMISSIONS", {
        detail: `x-access-level: ${x.value.accessLevel}`,
      }),
    });
  } else {
    checks.push({ reseau: "x", ok: true, compte: `@${x.value.handle}` });
  }
  return checks;
}
