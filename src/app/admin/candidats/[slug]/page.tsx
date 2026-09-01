import Link from "next/link";
import { notFound } from "next/navigation";
import { getCandidatePresidentialBySlug } from "@/lib/data/candidates";
import { EMPTY_MEASURE_READINESS, getMeasureReadinessByCandidacies } from "@/lib/data/measures";
import { db } from "@/lib/db";
import { isSynthesisContradictedByMeasures } from "@/lib/presidentielle/candidate-synthesis";
import { CandidatesListClient, type CandidateRowView } from "../CandidatesListClient";

export const metadata = {
  title: "Modifier une candidature présidentielle (admin) | Poligraph",
  robots: { index: false },
};

export const maxDuration = 120;

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function AdminCandidacyPage({ params }: PageProps) {
  const { slug } = await params;
  const candidacy = await getCandidatePresidentialBySlug("presidentielle-2027", slug);
  if (!candidacy) notFound();

  const [readinessByCandidacy, editions] = await Promise.all([
    getMeasureReadinessByCandidacies([candidacy.id]),
    db.programEdition.findMany({
      where: { candidacyId: candidacy.id },
      select: { id: true, candidacyId: true, label: true, version: true, publicationStatus: true },
      orderBy: [{ publishedAt: "asc" }, { version: "asc" }],
    }),
  ]);
  const readiness = readinessByCandidacy.get(candidacy.id) ?? EMPTY_MEASURE_READINESS;
  const row: CandidateRowView = {
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
    readiness,
    synthesisState: !candidacy.presidentialData?.synthesis
      ? "MISSING"
      : isSynthesisContradictedByMeasures({
            generatedAt: candidacy.presidentialData.synthesisGeneratedAt,
            firstMeasurePublishedAt: readiness.firstPublishedAt,
          })
        ? "CONTRADICTED"
        : "CURRENT",
    synthesisGeneratedAt: candidacy.presidentialData?.synthesisGeneratedAt ?? null,
    editions: editions.map((edition) => ({
      id: edition.id,
      label: edition.label,
      version: edition.version,
      publicationStatus: edition.publicationStatus,
    })),
  };

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link href="/admin/candidats" className="text-sm text-primary underline underline-offset-2">
          Retour aux candidatures
        </Link>
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">
            Modifier la candidature de {candidacy.candidateName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Statut et source de candidature, publication, programme et synthèses.
          </p>
        </div>
        <nav aria-label="Autres outils pour cette candidature" className="flex flex-wrap gap-3">
          {candidacy.politician && (
            <Link
              href={`/admin/politiques/${candidacy.politician.id}`}
              className="inline-flex min-h-11 items-center rounded-md border px-4 text-sm font-semibold hover:bg-muted"
            >
              Modifier la personnalité
            </Link>
          )}
          {candidacy.politician?.slug && (
            <Link
              href={`/admin/candidats/${candidacy.politician.slug}/syntheses-thematiques`}
              className="inline-flex min-h-11 items-center rounded-md border px-4 text-sm font-semibold hover:bg-muted"
            >
              Gérer les synthèses thématiques
            </Link>
          )}
        </nav>
      </header>

      <CandidatesListClient rows={[row]} />
    </div>
  );
}
