/**
 * Pure publication-status decision, kept free of any database import so it can
 * be unit-tested without a connection. See STATUS_RULES in config/prominence.
 */

import { PublicationStatus } from "@/generated/prisma";
import { STATUS_RULES } from "@/config/prominence";

export type PoliticianRow = {
  id: string;
  birthDate: Date | null;
  deathDate: Date | null;
  photoUrl: string | null;
  biography: string | null;
  publicationStatus: PublicationStatus;
  statusOverride: boolean;
  prominenceScore: number;
  hasCurrentMandate: boolean;
  hasPublishedDirectAffair: boolean;
  hasPublishedPresidentialCandidacy: boolean;
};

export function determineStatus(p: PoliticianRow): PublicationStatus | null {
  // Rule 1: Manual override — don't touch
  if (p.statusOverride) return null;

  const now = new Date();

  // Rule 2: Deceased before 1958 → EXCLUDED
  if (p.deathDate && p.deathDate.getFullYear() < STATUS_RULES.excludeDeathBeforeYear) {
    return PublicationStatus.EXCLUDED;
  }

  // Rule 3: Born before 1920 AND no current mandate AND low score → EXCLUDED
  if (
    p.birthDate &&
    p.birthDate.getFullYear() < STATUS_RULES.excludeBornBeforeYear &&
    !p.hasCurrentMandate &&
    p.prominenceScore < STATUS_RULES.publishThreshold
  ) {
    return PublicationStatus.EXCLUDED;
  }

  // Rule 3b: A sourced presidential candidacy keeps an already-published profile public.
  // Candidate pages and their measures require a PUBLISHED Politician, so the prominence
  // pass must not undo that explicit editorial decision. This is deliberately sticky rather
  // than promotional: a DRAFT profile still requires its own publication decision.
  if (p.hasPublishedPresidentialCandidacy && p.publicationStatus === PublicationStatus.PUBLISHED) {
    return PublicationStatus.PUBLISHED;
  }

  // Rule 3c: Publishing someone's judicial affair publishes their profile.
  // /politiques and the sitemap only list PUBLISHED profiles, so leaving the
  // profile ARCHIVED or DRAFT would link readers from a published affair to a
  // page the site excludes from its own directory and index. Prominence has
  // nothing to say here: this is a consequence of an editorial decision that
  // has already been taken. Placed after the exclusion rules so a published
  // affair cannot drag a pre-1958 figure back into scope.
  if (p.hasPublishedDirectAffair) return PublicationStatus.PUBLISHED;

  // Rule 4: Has current mandate → PUBLISHED
  if (p.hasCurrentMandate) return PublicationStatus.PUBLISHED;

  // Rule 5: High prominence AND has minimum data → PUBLISHED
  if (p.prominenceScore >= STATUS_RULES.publishThreshold) {
    if (!STATUS_RULES.minDataForPublished || p.photoUrl || p.biography) {
      return PublicationStatus.PUBLISHED;
    }
  }

  // Rule 6: Deceased > 10 years → ARCHIVED
  if (p.deathDate) {
    const yearsDeceased = (now.getTime() - p.deathDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    if (yearsDeceased > STATUS_RULES.archiveDeathYears) {
      return PublicationStatus.ARCHIVED;
    }
  }

  // Rule 7: Low score AND no current mandate → ARCHIVED
  if (p.prominenceScore < STATUS_RULES.archiveScoreThreshold && !p.hasCurrentMandate) {
    return PublicationStatus.ARCHIVED;
  }

  // Rule 8: Default → DRAFT
  return PublicationStatus.DRAFT;
}
