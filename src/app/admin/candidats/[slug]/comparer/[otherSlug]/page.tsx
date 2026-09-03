import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCandidatePresidentialBySlug } from "@/lib/data/candidates";
import { CompareView, type CompareCandidate } from "@/components/candidates/CompareView";
import { getProbityStats } from "@/lib/affairs/probity-stats";
import type { ThemeCategory } from "@/types";

export const metadata = {
  title: "Comparer 2 candidats 2027 (admin)",
  robots: { index: false },
};

interface PageProps {
  params: Promise<{ slug: string; otherSlug: string }>;
}

async function loadCompareCandidate(
  electionSlug: string,
  slug: string
): Promise<CompareCandidate | null> {
  const candidacy = await getCandidatePresidentialBySlug(electionSlug, slug);
  if (!candidacy || !candidacy.politician) return null;
  const politician = candidacy.politician;

  const [groupBy, topPromises, affairsCount, probityStats] = await Promise.all([
    db.promise.groupBy({
      by: ["theme"],
      where: { politicianId: politician.id, extractionStatus: "PUBLISHED" },
      _count: { _all: true },
    }),
    db.promise.findMany({
      where: { politicianId: politician.id, extractionStatus: "PUBLISHED" },
      orderBy: { publishedAt: "desc" },
      select: { id: true, text: true, theme: true },
      take: 3,
    }),
    db.affair.count({
      where: { politicianId: politician.id, publicationStatus: "PUBLISHED" },
    }),
    getProbityStats(politician.id),
  ]);

  return {
    slug,
    name: candidacy.candidateName,
    partyShortName: politician.currentParty?.shortName ?? null,
    partyColor: candidacy.presidentialData?.accentColor ?? politician.currentParty?.color ?? null,
    slogan: candidacy.presidentialData?.slogan ?? null,
    promisesCount: groupBy.reduce((s, g) => s + g._count._all, 0),
    affairsCount,
    probityStats,
    topPromises: topPromises.map((p) => ({
      id: p.id,
      text: p.text,
      theme: p.theme as ThemeCategory,
    })),
    themeFocus: groupBy.map((g) => ({
      theme: g.theme as ThemeCategory,
      count: g._count._all,
    })),
  };
}

export default async function AdminCompareCandidatesPage({ params }: PageProps) {
  const { slug, otherSlug } = await params;
  if (slug === otherSlug) notFound();

  const [left, right] = await Promise.all([
    loadCompareCandidate("presidentielle-2027", slug),
    loadCompareCandidate("presidentielle-2027", otherSlug),
  ]);

  if (!left || !right) notFound();

  return (
    <div className="space-y-6">
      <h1 className="font-display text-xl font-bold tracking-tight">
        Comparer : {left.name} ↔ {right.name}
      </h1>
      <CompareView left={left} right={right} />
    </div>
  );
}
