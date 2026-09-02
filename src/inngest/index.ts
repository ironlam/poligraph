import { createSyncFunction } from "./functions/single-script";
import { discoverAffairs } from "./functions/discover-affairs";
import { generateAi } from "./functions/generate-ai";
import { indexEmbeddings } from "./functions/index-embeddings";
import { maintenance } from "./functions/maintenance";
import { moderationPreflight } from "./functions/moderation-preflight";
import { syncFactchecksGrouped } from "./functions/sync-factchecks";
import { syncLegislation } from "./functions/sync-legislation";
import { syncPoliticians } from "./functions/sync-politicians";
import { syncDaily } from "./functions/sync-daily";
import { generateSocialDrafts, publishApprovedPost } from "./functions/post-social";
import { sendNewsletter } from "./functions/send-newsletter";
import { onboardingSend } from "./functions/onboarding-send";
import { syncEngagement } from "./functions/sync-engagement";
import { syncPress } from "./functions/sync-press";
import { syncScrutins } from "./functions/sync-scrutins";
import { syncPlatformUpdates } from "./functions/sync-platform-updates";
import { pipelineDigest } from "./functions/pipeline-digest";
import { runVoteSyncWithCacheInvalidation } from "./vote-cache";

// --- Grouped multi-step functions ---
const groupedFunctions = [
  syncPress,
  syncScrutins,
  syncLegislation,
  discoverAffairs,
  syncFactchecksGrouped,
  generateAi,
  indexEmbeddings,
  syncPoliticians,
  maintenance,
  moderationPreflight,
  syncDaily,
  generateSocialDrafts,
  publishApprovedPost,
  sendNewsletter,
  onboardingSend,
  syncEngagement,
  pipelineDigest,
  syncPlatformUpdates,
];

// --- Individual script wrappers (admin SCRIPT_CATALOG) ---

// Phase 1: Migrated — lazy dynamic imports to avoid loading heavy deps at route init
const migratedFunctions = [
  createSyncFunction("sync-scrutins-an", async (data) => {
    const { syncScrutinsAN } = await import("@/services/sync/scrutins-an");
    const todayOnly = !data.flags || !(data.flags as string).includes("--all");
    return runVoteSyncWithCacheInvalidation(() => syncScrutinsAN(undefined, false, todayOnly));
  }),
  createSyncFunction("sync-scrutins-senat", async (data) => {
    const { syncScrutinsSenat } = await import("@/services/sync/scrutins-senat");
    const todayOnly = !data.flags || !(data.flags as string).includes("--all");
    return runVoteSyncWithCacheInvalidation(() => syncScrutinsSenat(null, false, todayOnly));
  }),
  createSyncFunction("sync-press-analysis", async (data) => {
    const { syncPressAnalysis } = await import("@/services/sync/press-analysis");
    const limit = (data.limit as number) || 100;
    return syncPressAnalysis({ limit });
  }),
  // No Judilibre discovery function is registered, and none may be (#337): the
  // name-based pipeline is removed, not merely switched off.
  createSyncFunction("sync-factchecks", async (data) => {
    const { syncFactchecks } = await import("@/services/sync/factchecks");
    const limit = (data.limit as number) || 50;
    return syncFactchecks({ limit });
  }),
  createSyncFunction("sync-press", async () => {
    const { syncPress: syncPressService } = await import("@/services/sync/press");
    return syncPressService();
  }),
  createSyncFunction("recalculate-prominence", async () => {
    const { recalculateProminence } = await import("@/services/sync/prominence");
    return recalculateProminence();
  }),
  createSyncFunction("compute-municipales-snapshots", async () => {
    const { computeMunicipalesSnapshots } =
      await import("@/services/sync/compute-municipales-snapshots");
    return computeMunicipalesSnapshots();
  }),
  createSyncFunction("assign-publication-status", async () => {
    const { assignPublicationStatus } = await import("@/services/sync/publication-status");
    return assignPublicationStatus();
  }),
  createSyncFunction("reconcile-affairs", async (data) => {
    const { reconcileAffairs } = await import("@/services/sync/reconcile-affairs");
    const autoMerge = Boolean(data.flags && (data.flags as string).includes("--auto-merge"));
    return reconcileAffairs({ autoMerge });
  }),
  createSyncFunction("classify-themes", async (data) => {
    const { classifyThemes } = await import("@/services/sync/classify-themes");
    const limit = (data.limit as number) || 30;
    return classifyThemes({ limit });
  }),
  createSyncFunction("reindex-measures-search", async (data) => {
    const { reindexPresidentialMeasureSearch } =
      await import("@/services/sync/reindex-measures-search");
    const result = await reindexPresidentialMeasureSearch();
    const jobId = typeof data.jobId === "string" ? data.jobId : null;
    if (jobId) {
      const { db } = await import("@/lib/db");
      await db.syncJob.update({
        where: { id: jobId },
        data: { total: result.total, processed: result.processed, progress: 90 },
      });
    }
    return result;
  }),
];

// Phase 2a: Migrated — services already exist, just wire them up
const phase2Migrated = [
  createSyncFunction("sync-assemblee", async () => {
    const { syncDeputes } = await import("@/services/sync/deputes");
    return syncDeputes();
  }),
  createSyncFunction("sync-senat", async () => {
    const { syncSenateurs } = await import("@/services/sync/senateurs");
    return syncSenateurs();
  }),
  createSyncFunction("sync-gouvernement", async () => {
    const { syncGouvernement } = await import("@/services/sync/gouvernement");
    return syncGouvernement();
  }),
  createSyncFunction("sync-europarl", async () => {
    const { syncEuroparl } = await import("@/services/sync/europarl");
    return syncEuroparl();
  }),
  createSyncFunction("sync-photos", async () => {
    const { syncPhotos } = await import("@/services/sync/photos");
    return syncPhotos();
  }),
  createSyncFunction("sync-hatvp", async () => {
    const { syncHATVP } = await import("@/services/sync/hatvp");
    return syncHATVP();
  }),
  createSyncFunction("sync-deceased", async () => {
    const { syncDeceasedFromWikidata } = await import("@/services/sync/deceased");
    return syncDeceasedFromWikidata();
  }),
];

// Phase 2b: Migrated — services extracted from CLI scripts
const phase2Extracted = [
  createSyncFunction("sync-president", async () => {
    const { syncPresident } = await import("@/services/sync/president");
    return syncPresident();
  }),
  createSyncFunction("sync-wikidata-ids", async (data) => {
    const { syncWikidataIds } = await import("@/services/sync/wikidata-ids");
    const limit = (data.limit as number) || undefined;
    return syncWikidataIds({ limit });
  }),
  createSyncFunction("sync-birthdates", async (data) => {
    const { syncBirthdates } = await import("@/services/sync/birthdates");
    const limit = (data.limit as number) || undefined;
    return syncBirthdates({ limit });
  }),
  createSyncFunction("sync-careers", async (data) => {
    const { syncCareers } = await import("@/services/sync/careers");
    const limit = (data.limit as number) || undefined;
    const foundersOnly = Boolean(data.flags && (data.flags as string).includes("--founders-only"));
    return syncCareers({ limit, foundersOnly });
  }),
  createSyncFunction("sync-partis", async (data) => {
    const { syncPartis } = await import("@/services/sync/partis");
    const configOnly = Boolean(data.flags && (data.flags as string).includes("--config"));
    return syncPartis({ configOnly });
  }),
  createSyncFunction("sync-mep-parties", async (data) => {
    const { syncMepParties } = await import("@/services/sync/mep-parties");
    const limit = (data.limit as number) || undefined;
    const force = Boolean(data.flags && (data.flags as string).includes("--force"));
    return syncMepParties({ limit, force });
  }),
  createSyncFunction("sync-opensanctions", async (data) => {
    const { syncOpenSanctions } = await import("@/services/sync/opensanctions");
    const limit = (data.limit as number) || undefined;
    return syncOpenSanctions({ limit });
  }),
  createSyncFunction("sync-opensanctions-incremental", async (data) => {
    const { syncOpenSanctionsIncremental } = await import("@/services/sync/opensanctions");
    const limit = (data.limit as number) || undefined;
    return syncOpenSanctionsIncremental({ limit });
  }),
];

export const functions = [
  ...groupedFunctions,
  ...migratedFunctions,
  ...phase2Migrated,
  ...phase2Extracted,
];
