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
  /** Takes back a claim left by an interrupted publication, once checked by hand on the network. */
  resume?: boolean;
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

/** Publications in flight longer than this are treated as interrupted, not as running. */
export const CLAIM_STALE_MS = 10 * 60 * 1000;

async function countPublishedToday(network: SocialNetwork, now: Date): Promise<number> {
  const since = startOfParisDay(now);
  // In-flight claims count too: two parallel calls cannot both slip under the cap.
  if (network === "bluesky") {
    return db.socialPost.count({ where: { blueskyPostedAt: { gte: since } } });
  }
  return db.socialPost.count({ where: { twitterPostedAt: { gte: since } } });
}

/**
 * Takes the network for this post in one conditional UPDATE: Postgres re-checks the WHERE clause
 * once it holds the row lock, so of two concurrent calls only one sees `count === 1`. A stale claim
 * (crash between the network call and the save) is only taken back on an explicit resume, because
 * the post may already be online and nothing here can tell.
 */
async function claimNetwork(
  id: string,
  network: SocialNetwork,
  now: Date,
  resume: boolean
): Promise<boolean> {
  const staleBefore = new Date(now.getTime() - CLAIM_STALE_MS);
  if (network === "bluesky") {
    const freeOrStale: Prisma.SocialPostWhereInput[] = [{ blueskyPostedAt: null }];
    if (resume) freeOrStale.push({ blueskyPostedAt: { lt: staleBefore } });
    const claimed = await db.socialPost.updateMany({
      where: { id, blueskyUrl: null, OR: freeOrStale },
      data: { blueskyPostedAt: now, blueskyError: null },
    });
    return claimed.count === 1;
  }
  const freeOrStale: Prisma.SocialPostWhereInput[] = [{ twitterPostedAt: null }];
  if (resume) freeOrStale.push({ twitterPostedAt: { lt: staleBefore } });
  const claimed = await db.socialPost.updateMany({
    where: { id, twitterUrl: null, OR: freeOrStale },
    data: { twitterPostedAt: now, twitterError: null },
  });
  return claimed.count === 1;
}

/** Writes only this network's columns, so a parallel call on the other network is never undone. */
async function saveNetworkOutcome(id: string, outcome: NetworkOutcome): Promise<void> {
  if (outcome.statut === "publie") {
    if (outcome.reseau === "bluesky") {
      await db.socialPost.update({ where: { id }, data: { blueskyUrl: outcome.url } });
    } else {
      await db.socialPost.update({ where: { id }, data: { twitterUrl: outcome.url } });
    }
    // First publication on any network, kept for the pages written for the former pipeline.
    await db.socialPost.updateMany({
      where: { id, postedAt: null },
      data: { postedAt: new Date() },
    });
    return;
  }
  if (outcome.statut === "echec") {
    // Releasing the claim also gives the slot back to the daily cap: nothing went out.
    const error = JSON.stringify(outcome.diagnostic);
    if (outcome.reseau === "bluesky") {
      await db.socialPost.update({
        where: { id },
        data: { blueskyPostedAt: null, blueskyError: error },
      });
    } else {
      await db.socialPost.update({
        where: { id },
        data: { twitterPostedAt: null, twitterError: error },
      });
    }
  }
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

function describeBusyClaim(
  network: SocialNetwork,
  post: {
    blueskyUrl: string | null;
    twitterUrl: string | null;
    blueskyPostedAt: Date | null;
    twitterPostedAt: Date | null;
  },
  now: Date
): NetworkOutcome {
  const url = network === "bluesky" ? post.blueskyUrl : post.twitterUrl;
  if (url) return { reseau: network, statut: "ignore", raison: "Déjà publié.", url };
  const claimedAt = network === "bluesky" ? post.blueskyPostedAt : post.twitterPostedAt;
  if (claimedAt && now.getTime() - claimedAt.getTime() >= CLAIM_STALE_MS) {
    return {
      reseau: network,
      statut: "ignore",
      raison:
        "Publication interrompue sans résultat enregistré. Vérifier sur le réseau qu'aucun post n'est parti, puis relancer avec reprendre à true.",
    };
  }
  return { reseau: network, statut: "ignore", raison: "Publication déjà en cours." };
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
    if (!(await claimNetwork(id, network, now, options.resume ?? false))) {
      const current = await db.socialPost.findUnique({ where: { id } });
      results.push(describeBusyClaim(network, current ?? post, now));
      continue;
    }
    const outcome = await publishOn(network, text);
    await saveNetworkOutcome(id, outcome);
    results.push(outcome);
  }

  // Completeness is read back from the row: a parallel call may have finished the other network.
  const fresh = await db.socialPost.findUnique({ where: { id } });
  const complete =
    fresh !== null &&
    (fresh.content.length === 0 || fresh.blueskyUrl !== null) &&
    (!fresh.twitterContent || fresh.twitterUrl !== null);
  if (complete) {
    // Never downgraded on failure: an approved affaire stays approved and can be retried.
    await db.socialPost.update({ where: { id }, data: { status: "POSTED" } });
  }
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
