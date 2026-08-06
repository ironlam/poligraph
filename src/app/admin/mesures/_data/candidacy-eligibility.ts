import { db } from "@/lib/db";
import { MeasureValidationError } from "@/lib/measures/errors";

const HUB_ELECTION_SLUG = "presidentielle-2027";

export type EligibleCandidacy = { electionId: string; politicianId: string };

/**
 * Server-side gate for creating a measure in the 2027 hub (issue #660, decisions of 2026-08-06).
 *
 * A measure can only be created for a candidacy of the presidential election 2027, at status `DECLARE`,
 * and sourced. This is a rule of the hub chain, not a universal constraint of the `Measure` model:
 * `createMeasure()` stays general, this gate is what the admin action calls.
 *
 * Returns the election and politician read FROM the candidacy so the action can bind the measure to
 * them rather than trusting a client payload. A selector filter is not an authorization: this runs even
 * if the request never went through the selector.
 */
export async function assertHubMeasureCandidacy(candidacyId: string): Promise<EligibleCandidacy> {
  const candidacy = await db.candidacy.findUnique({
    where: { id: candidacyId },
    select: {
      status: true,
      sourceUrl: true,
      sourceLabel: true,
      politicianId: true,
      electionId: true,
      election: { select: { slug: true } },
    },
  });

  if (!candidacy) {
    throw new MeasureValidationError("Candidature introuvable.");
  }
  if (candidacy.election.slug !== HUB_ELECTION_SLUG) {
    throw new MeasureValidationError(
      "Une mesure du hub ne peut viser qu'une candidature de la présidentielle 2027."
    );
  }
  if (candidacy.status !== "DECLARE") {
    throw new MeasureValidationError(
      "La candidature doit être déclarée pour porter une mesure. Les autres statuts restent au suivi éditorial."
    );
  }
  if (!candidacy.sourceUrl || !candidacy.sourceLabel) {
    throw new MeasureValidationError("La candidature doit être sourcée (URL et libellé).");
  }
  if (!candidacy.politicianId) {
    throw new MeasureValidationError("La candidature n'a pas de politicien associé.");
  }

  return { electionId: candidacy.electionId, politicianId: candidacy.politicianId };
}
