import { getCandidates2027ForModeration } from "@/lib/data/candidates";
import { EMPTY_MEASURE_READINESS, getMeasureReadinessByCandidacies } from "@/lib/data/measures";
import { db } from "@/lib/db";
import { isSynthesisContradictedByMeasures } from "@/lib/presidentielle/candidate-synthesis";
import { CandidatesListClient, type CandidateRowView } from "./CandidatesListClient";

export const metadata = {
  title: "Candidats présidentielle 2027 (admin) | Poligraph",
  robots: { index: false },
};

/**
 * The regenerate button calls a provider inline, and the default serverless budget on this project
 * is shorter than an Anthropic call plus its one retry. Declared on the segment because a server
 * action runs on the route that renders the form, not on a route of its own.
 */
export const maxDuration = 120;

export default async function AdminCandidatsPage() {
  const candidates = await getCandidates2027ForModeration();
  const candidacyIds = candidates.map((candidacy) => candidacy.id);

  // Both reads are keyed on the candidacies already loaded, so the page stays at three queries
  // whatever the size of the field.
  const [readiness, editions] = await Promise.all([
    getMeasureReadinessByCandidacies(candidacyIds),
    db.programEdition.findMany({
      where: { candidacyId: { in: candidacyIds } },
      select: { id: true, candidacyId: true, label: true, version: true, publicationStatus: true },
      orderBy: [{ publishedAt: "asc" }, { version: "asc" }],
    }),
  ]);

  const rows: CandidateRowView[] = candidates.map((candidacy) => {
    const measures = readiness.get(candidacy.id) ?? EMPTY_MEASURE_READINESS;
    return {
      candidacyId: candidacy.id,
      candidateName: candidacy.candidateName,
      politicianId: candidacy.politician?.id ?? null,
      politicianSlug: candidacy.politician?.slug ?? null,
      politicianPublicationStatus: candidacy.politician?.publicationStatus ?? null,
      partyLabel: candidacy.party?.shortName ?? candidacy.partyLabel ?? null,
      status: candidacy.status,
      sourceUrl: candidacy.sourceUrl,
      sourceLabel: candidacy.sourceLabel,
      sourced: Boolean(candidacy.status && candidacy.sourceUrl && candidacy.sourceLabel),
      presidentialId: candidacy.presidentialData?.id ?? null,
      publicationStatus: candidacy.presidentialData?.publicationStatus ?? null,
      slogan: candidacy.presidentialData?.slogan ?? null,
      rank: candidacy.presidentialData?.rank ?? null,
      readiness: measures,
      // The same predicate the public fiche applies, on the admin population (see
      // `CandidacyMeasureReadiness.firstPublishedAt`): the moderator sees the state the fiche is in,
      // or the state publishing the extension would put it in, rather than a date to interpret.
      synthesisState: !candidacy.presidentialData?.synthesis
        ? "MISSING"
        : isSynthesisContradictedByMeasures({
              generatedAt: candidacy.presidentialData.synthesisGeneratedAt,
              firstMeasurePublishedAt: measures.firstPublishedAt,
            })
          ? "CONTRADICTED"
          : "CURRENT",
      synthesisGeneratedAt: candidacy.presidentialData?.synthesisGeneratedAt ?? null,
      editions: editions
        .filter((edition) => edition.candidacyId === candidacy.id)
        .map((edition) => ({
          id: edition.id,
          label: edition.label,
          version: edition.version,
          publicationStatus: edition.publicationStatus,
        })),
    };
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-display font-bold tracking-tight">
          Candidats présidentielle 2027
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {candidates.length} candidatures enregistrées. Publier une candidature, publier son
          programme, modifier le slogan ou le rang.
        </p>
      </header>

      <CandidatesListClient rows={rows} />

      <p className="text-xs text-muted-foreground">
        Note : cette page est admin-only. La surface publique{" "}
        <code>/elections/presidentielle-2027</code> existe, et elle reste hors des index tant que
        ses seuils de publication ne sont pas franchis.
      </p>
    </div>
  );
}
