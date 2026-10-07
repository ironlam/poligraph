import Link from "next/link";
import { PoliticianAvatar } from "@/components/politicians/PoliticianAvatar";
import { formatDate } from "@/lib/utils";
import type { CandidatePresidentialRow, CrossCycleEntry } from "@/lib/data/candidates";
import { formatProbityBreakdown, type ProbityStats } from "@/lib/affairs/probity-stats";

const STATUS_BADGE: Record<string, { label: string; bg: string }> = {
  DECLARE: { label: "Candidat déclaré", bg: "bg-emerald-500/90" },
  PRESSENTI: { label: "Candidat pressenti", bg: "bg-amber-500/90" },
  ENVISAGE: { label: "Candidature envisagée", bg: "bg-slate-400/90" },
  RETIRE: { label: "Candidature retirée", bg: "bg-red-500/90" },
};

interface Props {
  candidacy: CandidatePresidentialRow;
  crossCycle: (CrossCycleEntry & { round1Pct: number | null })[];
  promisesCount: number;
  votesParticipationPct: number | null;
  probityStats: ProbityStats;
}

export function CandidateHero({
  candidacy,
  crossCycle,
  promisesCount,
  votesParticipationPct,
  probityStats,
}: Props) {
  const pres = candidacy.presidentialData;
  const accent = pres?.accentColor ?? candidacy.politician?.currentParty?.color ?? "#3b82f6";
  const badge = STATUS_BADGE[candidacy.status ?? "ENVISAGE"] ?? STATUS_BADGE.ENVISAGE!;

  // Couleurs de parti claires (jaune, beige) cassent le contraste avec le texte blanc.
  // On force un dégradé assombri et un texte sombre pour rester au-dessus de WCAG AA.
  const useDarkText = isLightColor(accent);
  const gradientStart = shade(accent, useDarkText ? -10 : -25);
  const gradientEnd = useDarkText ? shade(accent, -55) : accent;
  const textCls = useDarkText ? "text-slate-900" : "text-white";
  const subtleBg = useDarkText ? "bg-slate-900/15" : "bg-white/15";
  const previousCycle = crossCycle.at(0);
  const previousYear = previousCycle?.electionTitle.match(/\d{4}/)?.[0] ?? null;

  return (
    <header
      className={`rounded-lg p-4 ${textCls} sm:p-6`}
      style={{ background: `linear-gradient(135deg, ${gradientStart}, ${gradientEnd})` }}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <PoliticianAvatar
          photoUrl={candidacy.politician?.photoUrl ?? null}
          blobPhotoUrl={candidacy.politician?.blobPhotoUrl ?? null}
          fullName={candidacy.candidateName}
          size="lg"
        />
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-xl font-bold sm:text-2xl break-words">
            {candidacy.candidateName}
          </h1>
          <p className="text-sm opacity-90">
            {candidacy.politician?.currentParty?.name ??
              candidacy.party?.name ??
              candidacy.partyLabel ??
              ""}
            {candidacy.politician?.currentParty?.shortName
              ? ` · ${candidacy.politician.currentParty.shortName}`
              : ""}
          </p>
          {pres?.slogan && <p className="mt-1 text-sm italic opacity-95">« {pres.slogan} »</p>}
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badge.bg} self-start`}>
          {badge.label}
        </span>
      </div>

      {previousCycle && previousYear && (
        <div
          className={`mt-3 inline-flex items-center gap-2 rounded ${subtleBg} px-3 py-1 text-xs`}
        >
          <span>
            Déjà candidat en {previousYear}
            {previousCycle.round1Pct != null && <> · T1 : {previousCycle.round1Pct.toFixed(2)}%</>}
          </span>
          <Link
            href={`/elections/${previousCycle.electionSlug}`}
            className="underline hover:no-underline"
          >
            Voir
          </Link>
        </div>
      )}

      {pres?.withdrewAt && pres.withdrewReason && (
        <div className="mt-3 rounded bg-red-700/30 px-3 py-2 text-xs">
          Retrait le {formatDate(pres.withdrewAt)}. {pres.withdrewReason}
        </div>
      )}

      <dl className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
        <div className={`rounded ${subtleBg} px-2 py-2`}>
          <dt className="opacity-90">Promesses extraites</dt>
          <dd className="mt-0.5 text-lg font-bold">{promisesCount}</dd>
        </div>
        <div className={`rounded ${subtleBg} px-2 py-2`}>
          <dt className="opacity-90">Participation parlementaire</dt>
          <dd className="mt-0.5 text-lg font-bold">
            {votesParticipationPct != null ? `${votesParticipationPct.toFixed(0)}%` : "-"}
          </dd>
        </div>
        <div className={`rounded ${subtleBg} px-2 py-2`}>
          <dt className="opacity-90">Atteintes à la probité</dt>
          <dd className="mt-0.5 text-lg font-bold">{probityStats.total}</dd>
          <dd className="mt-0.5 text-[10px] leading-tight opacity-90">
            {formatProbityBreakdown(probityStats)}
          </dd>
        </div>
      </dl>
    </header>
  );
}

function isLightColor(hex: string): boolean {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return false;
  const num = parseInt(m[1]!, 16);
  const r = (num >> 16) / 255;
  const g = ((num >> 8) & 0xff) / 255;
  const b = (num & 0xff) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 0.6;
}

function shade(hex: string, delta: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const num = parseInt(m[1]!, 16);
  const r = Math.max(0, Math.min(255, (num >> 16) + delta));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + delta));
  const b = Math.max(0, Math.min(255, (num & 0xff) + delta));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}
