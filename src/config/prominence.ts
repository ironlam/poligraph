import type { MandateType, PartyRole } from "@/generated/prisma";

/**
 * Prominence scoring configuration.
 *
 * Total score range: 0–1000
 * Components:
 *   mandateWeight  (0–400) — current/past mandates, weighted by importance
 *   activityScore  (0–200) — votes, press mentions, fact-checks
 *   mediaScore     (0–150) — recent press coverage volume
 *   affairsScore   (0–100) — judicial affairs (controversial but newsworthy)
 *   recencyBonus   (0–150) — boost for currently active politicians
 */

// === Mandate weights (higher = more important role) ===

export const MANDATE_WEIGHTS: Record<MandateType, number> = {
  PRESIDENT_REPUBLIQUE: 400,
  PREMIER_MINISTRE: 350,
  MINISTRE: 280,
  MINISTRE_DELEGUE: 250,
  SECRETAIRE_ETAT: 230,
  DEPUTE: 200,
  SENATEUR: 200,
  DEPUTE_EUROPEEN: 180,
  PRESIDENT_REGION: 160,
  VICE_PRESIDENT_REGION: 100,
  PRESIDENT_DEPARTEMENT: 140,
  VICE_PRESIDENT_DEPARTEMENT: 90,
  MAIRE: 120,
  // Sous MAIRE : un secteur parisien pèse moins qu'une commune, mais au-dessus
  // d'un adjoint, l'exécutif d'arrondissement étant une fonction propre.
  MAIRE_ARRONDISSEMENT: 90,
  PRESIDENT_PARTI: 200,
  ADJOINT_MAIRE: 60,
  CONSEILLER_REGIONAL: 50,
  CONSEILLER_DEPARTEMENTAL: 50,
  CONSEILLER_MUNICIPAL: 40,
  OTHER: 30,
};

// Current mandate multiplier (vs past mandate)
export const CURRENT_MANDATE_MULTIPLIER = 1.0;
export const PAST_MANDATE_MULTIPLIER = 0.3;

// === Party role weights (for politicians without mandates) ===

export const PARTY_ROLE_WEIGHTS: Record<PartyRole, number> = {
  SECRETAIRE_GENERAL: 140,
  PORTE_PAROLE: 100,
  COORDINATEUR: 80,
  FONDATEUR: 80,
  PRESIDENT_HONNEUR: 40,
  MEMBRE: 0,
};

// === Activity scoring ===

export const ACTIVITY_CONFIG = {
  // Points per vote (parliamentary participation)
  pointsPerVote: 0.5,
  maxVotePoints: 80,
  // Points per press mention (last 6 months)
  pointsPerPressMention: 3,
  maxPressPoints: 100,
  // Points per fact-check mention
  pointsPerFactCheck: 8,
  maxFactCheckPoints: 60,
};

// === Media scoring (recent press mentions, last 3 months) ===

export const MEDIA_CONFIG = {
  pointsPerRecentMention: 5,
  maxMediaPoints: 150,
  recentMonths: 3,
};

// === Affairs scoring (newsworthy signal, weighted by severity) ===

export const AFFAIRS_CONFIG = {
  pointsBySeverity: {
    CRITIQUE: 25, // Atteintes à la probité — most newsworthy
    GRAVE: 15,
    SIGNIFICATIF: 5,
  } as Record<string, number>,
  maxAffairsPoints: 100,
};

// === Recency bonus ===

export const RECENCY_CONFIG = {
  // Has current mandate
  currentMandateBonus: 150,
  // Has significant party role (non-MEMBRE, active)
  activePartyRoleBonus: 100,
  // Was active in last 5 years (ended mandate within 5y)
  recentlyActiveBonus: 50,
};

// === Score caps (per component) ===

export const SCORE_CAPS = {
  mandate: 400,
  activity: 200,
  media: 150,
  affairs: 100,
  recency: 150,
  total: 1000,
};

// === Publication status rules ===

export const STATUS_RULES = {
  // Auto-PUBLISHED if: has current mandate OR prominenceScore >= threshold
  publishThreshold: 150,
  // Auto-ARCHIVED if: deceased > 10 years OR no mandate and score < threshold
  archiveDeathYears: 10,
  archiveScoreThreshold: 50,
  // Auto-EXCLUDED if: matches exclusion criteria from CLAUDE.md
  // (foreign, deceased before 1958, born before 1920 without recent activity)
  excludeDeathBeforeYear: 1958,
  excludeBornBeforeYear: 1920,
  // Minimum data for PUBLISHED (at least photo OR biography)
  minDataForPublished: true,
};
