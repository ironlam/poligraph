import type { Prisma, ThemeCategory } from "@/generated/prisma";
import type { ThemeSynthesisInput } from "./candidacy-theme-synthesis";
import { PUBLIC_CURRENT_MEASURE_WHERE } from "./publication";

export type ThemeSynthesisCorpus = {
  candidacyId: string;
  electionId: string;
  presidentialId: string;
  input: ThemeSynthesisInput;
};

export type ThemeSynthesisCorpusFailure =
  | "CANDIDACY_NOT_FOUND"
  | "CANDIDACY_NOT_DECLARED"
  | "PRESIDENTIAL_EXTENSION_MISSING"
  | "THEME_NOT_COVERED";

export type ThemeSynthesisCorpusResult =
  | { ok: true; corpus: ThemeSynthesisCorpus }
  | { ok: false; reason: ThemeSynthesisCorpusFailure };

/**
 * Loads the exact corpus a thematic synthesis is allowed to summarize.
 *
 * This invariant is shared by generation, publication review and freshness checks. Keeping the
 * public-measure predicate here prevents a draft, withdrawn measure or unsourced revision from
 * entering through one operation while another computes a different fingerprint.
 */
export async function loadCandidacyThemeSynthesisCorpus(
  tx: Prisma.TransactionClient,
  candidacyId: string,
  theme: ThemeCategory
): Promise<ThemeSynthesisCorpusResult> {
  const candidacy = await tx.candidacy.findUnique({
    where: { id: candidacyId },
    select: {
      id: true,
      candidateName: true,
      electionId: true,
      status: true,
      presidentialData: { select: { id: true } },
    },
  });
  if (!candidacy) return { ok: false, reason: "CANDIDACY_NOT_FOUND" };
  if (candidacy.status !== "DECLARE") {
    return { ok: false, reason: "CANDIDACY_NOT_DECLARED" };
  }
  if (!candidacy.presidentialData) {
    return { ok: false, reason: "PRESIDENTIAL_EXTENSION_MISSING" };
  }

  const measures = await tx.measure.findMany({
    where: {
      candidacyId,
      electionId: candidacy.electionId,
      theme,
      ...PUBLIC_CURRENT_MEASURE_WHERE,
    },
    select: {
      id: true,
      publishedRevisionId: true,
      publishedRevision: { select: { text: true, details: true } },
    },
    orderBy: { id: "asc" },
  });
  const input: ThemeSynthesisInput = {
    candidateName: candidacy.candidateName,
    theme,
    measures: measures.flatMap((measure) =>
      measure.publishedRevision && measure.publishedRevisionId
        ? [
            {
              id: measure.id,
              revisionId: measure.publishedRevisionId,
              text: measure.publishedRevision.text,
              details: measure.publishedRevision.details,
            },
          ]
        : []
    ),
  };
  if (input.measures.length === 0) return { ok: false, reason: "THEME_NOT_COVERED" };

  return {
    ok: true,
    corpus: {
      candidacyId,
      electionId: candidacy.electionId,
      presidentialId: candidacy.presidentialData.id,
      input,
    },
  };
}
