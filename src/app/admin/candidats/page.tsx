import { getCandidates2027ForModeration } from "@/lib/data/candidates";
import { EMPTY_MEASURE_READINESS, getMeasureReadinessByCandidacies } from "@/lib/data/measures";
import { db } from "@/lib/db";
import { CandidatesListClient, type CandidateRowView } from "./CandidatesListClient";

export const metadata = {
  title: "Candidats présidentielle 2027 (admin) | Poligraph",
  robots: { index: false },
};

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

  const rows: CandidateRowView[] = candidates.map((candidacy) => ({
    candidacyId: candidacy.id,
    candidateName: candidacy.candidateName,
    politicianSlug: candidacy.politician?.slug ?? null,
    partyLabel: candidacy.party?.shortName ?? candidacy.partyLabel ?? null,
    status: candidacy.status,
    sourced: Boolean(candidacy.status && candidacy.sourceUrl && candidacy.sourceLabel),
    presidentialId: candidacy.presidentialData?.id ?? null,
    publicationStatus: candidacy.presidentialData?.publicationStatus ?? null,
    slogan: candidacy.presidentialData?.slogan ?? null,
    rank: candidacy.presidentialData?.rank ?? null,
    readiness: readiness.get(candidacy.id) ?? EMPTY_MEASURE_READINESS,
    editions: editions
      .filter((edition) => edition.candidacyId === candidacy.id)
      .map((edition) => ({
        id: edition.id,
        label: edition.label,
        version: edition.version,
        publicationStatus: edition.publicationStatus,
      })),
  }));

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
