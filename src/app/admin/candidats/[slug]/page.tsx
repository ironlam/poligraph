import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { getCandidatePresidentialBySlug, getCandidateCrossCycle } from "@/lib/data/candidates";
import { CandidateHero } from "@/components/candidates/CandidateHero";
import { ThemeFocusRadar } from "@/components/candidates/ThemeFocusRadar";
import { PromisesSection } from "@/components/candidates/PromisesSection";
import { CompareToggle } from "@/components/candidates/CompareToggle";
import { MANDATE_TYPE_LABELS } from "@/config/labels";
import { formatDate } from "@/lib/utils";
import { getProbityStats, formatProbityBreakdown } from "@/lib/affairs/probity-stats";
import type { ThemeCategory } from "@/types";

export const metadata = {
  title: "Profil candidat 2027 (admin) | Poligraph",
  robots: { index: false },
};

interface PageProps {
  params: Promise<{ slug: string }>;
}

const SECTIONS = [
  {
    id: "vision",
    index: 1,
    kicker: "VISION",
    title: "Ce qu'il propose",
    bg: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  },
  {
    id: "boussole",
    index: 2,
    kicker: "BOUSSOLE",
    title: "Où il se situe",
    bg: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  },
  {
    id: "action",
    index: 3,
    kicker: "ACTION PARLEMENTAIRE",
    title: "Comment il vote",
    bg: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  },
  {
    id: "parcours",
    index: 4,
    kicker: "PARCOURS",
    title: "D'où il vient",
    bg: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300",
  },
  {
    id: "integrite",
    index: 5,
    kicker: "INTÉGRITÉ",
    title: "Déclarations HATVP",
    bg: "bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-300",
  },
  {
    id: "affaires",
    index: 6,
    kicker: "AFFAIRES",
    title: "Procédures judiciaires",
    bg: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  },
] as const;

interface SectionHeaderProps {
  id: string;
  index: number;
  kicker: string;
  title: React.ReactNode;
  bg: string;
}

function SectionHeader({ id, index, kicker, title, bg }: SectionHeaderProps) {
  return (
    <>
      <span className={`inline-block rounded px-2 py-1 text-xs font-semibold ${bg}`}>
        {index}. {kicker}
      </span>
      <h2
        id={`${id}-heading`}
        className="text-lg font-display font-bold text-slate-900 dark:text-slate-100"
      >
        {title}
      </h2>
    </>
  );
}

export default async function AdminCandidatProfilePage({ params }: PageProps) {
  const { slug } = await params;
  const candidacy = await getCandidatePresidentialBySlug("presidentielle-2027", slug);
  if (!candidacy || !candidacy.politician) notFound();

  const politician = candidacy.politician;

  const [
    promiseGroups,
    promisesList,
    mandates,
    affairsCount,
    declarationsCount,
    crossCycle,
    probityStats,
  ] = await Promise.all([
    db.promise.groupBy({
      by: ["theme"],
      where: { politicianId: politician.id, extractionStatus: "PUBLISHED" },
      _count: { _all: true },
    }),
    db.promise.findMany({
      where: { politicianId: politician.id, extractionStatus: "PUBLISHED" },
      orderBy: { publishedAt: "desc" },
      select: {
        id: true,
        text: true,
        theme: true,
        sourceLabel: true,
        sourceUrl: true,
      },
      take: 20,
    }),
    db.mandate.findMany({
      where: { politicianId: politician.id },
      orderBy: { startDate: "desc" },
      take: 10,
    }),
    db.affair.count({
      where: { politicianId: politician.id, publicationStatus: "PUBLISHED" },
    }),
    db.declaration.count({ where: { politicianId: politician.id } }),
    getCandidateCrossCycle(politician.id, "presidentielle-2027"),
    getProbityStats(politician.id),
  ]);

  const promisesCount = promiseGroups.reduce((s, g) => s + g._count._all, 0);
  const participationPct = null;

  const radarItems = promiseGroups.map((g) => ({
    theme: g.theme as ThemeCategory,
    count: g._count._all,
  }));

  const accentColor =
    candidacy.presidentialData?.accentColor ?? politician.currentParty?.color ?? undefined;
  const politicianSlug = politician.slug ?? slug;

  return (
    <div className="relative space-y-8 pb-24">
      <CandidateHero
        candidacy={candidacy}
        crossCycle={crossCycle}
        promisesCount={promisesCount}
        votesParticipationPct={participationPct}
        probityStats={probityStats}
      />

      <section aria-labelledby="vision-heading" className="space-y-3">
        <SectionHeader
          id={SECTIONS[0].id}
          index={SECTIONS[0].index}
          kicker={SECTIONS[0].kicker}
          title={<>Ce qu{"'"}il propose</>}
          bg={SECTIONS[0].bg}
        />
        <div className="grid gap-3 lg:grid-cols-[280px_1fr]">
          <ThemeFocusRadar
            items={radarItems}
            candidateName={candidacy.candidateName}
            accentColor={accentColor}
          />
          <PromisesSection promises={promisesList} politicianSlug={politicianSlug} />
        </div>
      </section>

      <section aria-labelledby="boussole-heading" className="space-y-3">
        <SectionHeader
          id={SECTIONS[1].id}
          index={SECTIONS[1].index}
          kicker={SECTIONS[1].kicker}
          title={SECTIONS[1].title}
          bg={SECTIONS[1].bg}
        />
        <div className="rounded-md border border-slate-200 bg-white p-4 text-sm dark:border-slate-700 dark:bg-slate-900">
          <p className="text-slate-600 dark:text-slate-300">
            Alignement boussole détaillé en cours de connexion avec le module Programmes.
          </p>
          <Link
            href="/programmes"
            className="mt-2 inline-block text-xs font-semibold text-primary hover:underline"
          >
            Tester votre alignement →
          </Link>
        </div>
      </section>

      <section aria-labelledby="action-heading" className="space-y-3">
        <SectionHeader
          id={SECTIONS[2].id}
          index={SECTIONS[2].index}
          kicker={SECTIONS[2].kicker}
          title={SECTIONS[2].title}
          bg={SECTIONS[2].bg}
        />
        <div className="rounded-md border border-slate-200 bg-white p-4 text-sm dark:border-slate-700 dark:bg-slate-900">
          <p className="text-slate-600 dark:text-slate-300">
            L{"'"}analyse des votes parlementaires (votes enregistrés et prises de position par
            thème) sera reliée ici depuis la fiche politicien. Un taux de participation ne peut être
            affiché que lorsque son périmètre d{"'"}éligibilité est résolu.
          </p>
          <Link
            href={`/politiques/${politicianSlug}#votes`}
            className="mt-2 inline-block text-xs font-semibold text-primary hover:underline"
          >
            Voir les votes →
          </Link>
        </div>
      </section>

      <section aria-labelledby="parcours-heading" className="space-y-3">
        <SectionHeader
          id={SECTIONS[3].id}
          index={SECTIONS[3].index}
          kicker={SECTIONS[3].kicker}
          title={<>D{"'"}où il vient</>}
          bg={SECTIONS[3].bg}
        />
        {mandates.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            Aucun mandat référencé pour ce candidat.
          </div>
        ) : (
          <div className="rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <ol className="space-y-2 text-sm">
              {mandates.map((m) => (
                <li key={m.id} className="border-l-4 border-primary pl-3">
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {MANDATE_TYPE_LABELS[m.type]}
                  </span>
                  <span className="text-slate-700 dark:text-slate-200"> · {m.title}</span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400">
                    {formatDate(m.startDate)} → {m.endDate ? formatDate(m.endDate) : "en cours"}
                  </span>
                </li>
              ))}
            </ol>
            <Link
              href={`/politiques/${politicianSlug}`}
              className="mt-3 inline-block text-xs font-semibold text-primary hover:underline"
            >
              Voir la fiche complète →
            </Link>
          </div>
        )}
      </section>

      <section aria-labelledby="integrite-heading" className="space-y-3">
        <SectionHeader
          id={SECTIONS[4].id}
          index={SECTIONS[4].index}
          kicker={SECTIONS[4].kicker}
          title={SECTIONS[4].title}
          bg={SECTIONS[4].bg}
        />
        <div className="rounded-md border border-slate-200 bg-white p-4 text-sm dark:border-slate-700 dark:bg-slate-900">
          {declarationsCount === 0 ? (
            <p className="text-slate-600 dark:text-slate-300">
              Aucune déclaration HATVP disponible pour ce candidat.
            </p>
          ) : (
            <>
              <p className="text-slate-700 dark:text-slate-200">
                {declarationsCount} déclaration{declarationsCount > 1 ? "s" : ""} HATVP référencée
                {declarationsCount > 1 ? "s" : ""}.
              </p>
              <Link
                href={`/politiques/${politicianSlug}#declarations`}
                className="mt-2 inline-block text-xs font-semibold text-primary hover:underline"
              >
                Voir les déclarations →
              </Link>
            </>
          )}
        </div>
      </section>

      <section aria-labelledby="affaires-heading" className="space-y-3">
        <SectionHeader
          id={SECTIONS[5].id}
          index={SECTIONS[5].index}
          kicker={SECTIONS[5].kicker}
          title={SECTIONS[5].title}
          bg={SECTIONS[5].bg}
        />
        <div className="rounded-md border border-slate-200 bg-white p-4 text-sm dark:border-slate-700 dark:bg-slate-900">
          {affairsCount === 0 ? (
            <p className="text-slate-600 dark:text-slate-300">
              Aucune affaire judiciaire publiée pour ce candidat.
            </p>
          ) : (
            <>
              <p className="text-slate-700 dark:text-slate-200">
                <strong>Atteintes à la probité : {probityStats.total}</strong>
                {probityStats.total > 0 && ` (${formatProbityBreakdown(probityStats)}).`}
              </p>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                {affairsCount} affaire{affairsCount > 1 ? "s" : ""} judiciaire
                {affairsCount > 1 ? "s" : ""} référencée{affairsCount > 1 ? "s" : ""} au total
                (toutes catégories). Présomption d{"'"}innocence respectée, les procédures en cours
                ne préjugent pas de la culpabilité.
              </p>
              <Link
                href={`/politiques/${politicianSlug}#affaires`}
                className="mt-2 inline-block text-xs font-semibold text-primary hover:underline"
              >
                Voir les affaires →
              </Link>
            </>
          )}
        </div>
      </section>

      <CompareToggle currentSlug={slug} currentName={candidacy.candidateName} />
    </div>
  );
}
