import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  AFFAIR_SUPER_CATEGORY_LABELS,
  AFFAIR_STATUS_LABELS,
  type AffairSuperCategory,
} from "@/config/labels";
import { CLOSE_STATUSES, type JudicialMaturity } from "@/config/judicial-maturity";
import type { AffairCategory, AffairStatus } from "@/types";
import { DonutChart } from "./DonutChart";
import { HorizontalBars } from "./HorizontalBars";
import { MethodologyDisclaimer } from "./MethodologyDisclaimer";
import { Hemicycle } from "./Hemicycle";
import { ViolenceSection } from "./ViolenceSection";
import type { HemicycleGroup } from "@/lib/data/hemicycle";

const SUPER_CATEGORY_HEX: Record<AffairSuperCategory, string> = {
  PROBITE: "#7c3aed",
  FINANCES: "#2563eb",
  PERSONNES: "#dc2626",
  EXPRESSION: "#d97706",
  AUTRE: "#6b7280",
};

interface StatusCount {
  status: AffairStatus;
  count: number;
}

interface CategoryCount {
  category: AffairSuperCategory;
  count: number;
}

interface CritiqueCategoryData {
  category: AffairCategory;
  label: string;
  total: number;
  parties: { name: string; count: number; color: string | null; slug: string | null }[];
}

interface ViolenceStats {
  totalAffairs: number;
  totalPoliticians: number;
  ongoingProcedures: number;
}

interface JudicialSectionProps {
  maturityCounts: Record<JudicialMaturity, number>;
  uniqueCondamnes: number;
  uniqueMisEnCause: number;
  byStatus: StatusCount[];
  byCategory: CategoryCount[];
  critiqueByCategory: CritiqueCategoryData[];
  hemicycleGroups: HemicycleGroup[];
  victimStats: ViolenceStats;
}

/** Statuses painted in neutral grey on the status chart: neither an ongoing
 *  procedure (amber) nor a conviction (blue). Instruction closed without any
 *  mise en examen belongs here even though it is not a closed-without-conviction
 *  outcome, because the blue fallback is reserved for convictions. */
const NEUTRAL_STATUS_SET = new Set<AffairStatus>([
  ...CLOSE_STATUSES,
  "INSTRUCTION_CLOTUREE_SANS_MISE_EN_EXAMEN",
]);

const ONGOING_STATUSES = new Set<AffairStatus>([
  "PLAINTE_DEPOSEE",
  "SIGNALEMENT_PARQUET",
  "ENQUETE_PRELIMINAIRE",
  "INSTRUCTION",
  "MISE_EN_EXAMEN",
  "RENVOI_TRIBUNAL",
  "PROCES_EN_COURS",
  "APPEL_EN_COURS",
]);

export function JudicialSection({
  maturityCounts,
  uniqueCondamnes,
  uniqueMisEnCause,
  byStatus,
  byCategory,
  critiqueByCategory,
  hemicycleGroups,
  victimStats,
}: JudicialSectionProps) {
  const ongoing = byStatus
    .filter((s) => ONGOING_STATUSES.has(s.status))
    .reduce((sum, s) => sum + s.count, 0);
  const closed = byStatus
    .filter((s) => !ONGOING_STATUSES.has(s.status))
    .reduce((sum, s) => sum + s.count, 0);

  return (
    <section aria-labelledby="judicial-heading" className="py-8 overflow-x-hidden">
      {/* 3 maturity-based KPIs. One row at every width: stacked, they filled a phone screen and a
          half before the first chart. */}
      <div className="mb-8 grid grid-cols-3 gap-2 md:gap-4">
        <Card>
          <CardContent className="px-2 pt-4 text-center md:px-6 md:pt-6">
            <div className="text-2xl font-bold tabular-nums md:text-3xl text-red-600">
              {uniqueCondamnes.toLocaleString("fr-FR")}
            </div>
            <div className="mt-1 text-xs text-muted-foreground md:text-sm">Élus condamnés</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {maturityCounts.CONDAMNATION} condamnation
              {maturityCounts.CONDAMNATION !== 1 ? "s" : ""}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="px-2 pt-4 text-center md:px-6 md:pt-6">
            <div className="text-2xl font-bold tabular-nums md:text-3xl text-amber-600">
              {uniqueMisEnCause.toLocaleString("fr-FR")}
            </div>
            <div className="mt-1 text-xs text-muted-foreground md:text-sm">Élus mis en cause</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {maturityCounts.PROCEDURE_VALIDEE} procédure
              {maturityCounts.PROCEDURE_VALIDEE !== 1 ? "s" : ""} validée
              {maturityCounts.PROCEDURE_VALIDEE !== 1 ? "s" : ""} par un juge
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="px-2 pt-4 text-center md:px-6 md:pt-6">
            <div className="text-2xl font-bold tabular-nums md:text-3xl text-gray-500">
              {maturityCounts.CLOSE_SANS_CONDAMNATION.toLocaleString("fr-FR")}
            </div>
            <div className="mt-1 text-xs text-muted-foreground md:text-sm">
              Relaxes / acquittements
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Procédures closes sans condamnation
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Hemicycle visualization */}
      {hemicycleGroups.length > 0 && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-lg">Hémicycle et affaires judiciaires</CardTitle>
            <p className="text-sm text-muted-foreground">
              Chaque siège représente un député. La taille du cercle est proportionnelle au niveau
              de certitude judiciaire.{" "}
              <span className="max-md:hidden">
                Cliquez sur un siège pour accéder à la fiche du député.
              </span>
              <span className="md:hidden">
                Touchez un groupe dans la légende pour le mettre en évidence.
              </span>
            </p>
          </CardHeader>
          <CardContent>
            <Hemicycle groups={hemicycleGroups} />
          </CardContent>
        </Card>
      )}

      {/* Further reading, after the figures: the per-party rate is one reading among others, not
          the entry point of the section. */}
      <nav
        aria-label="Approfondir les statistiques judiciaires"
        className="mb-8 grid gap-3 sm:grid-cols-2"
      >
        <Link
          href="/affaires/condamnations?view=stats"
          className={cn(
            buttonVariants({ variant: "outline" }),
            "min-h-12 justify-between whitespace-normal px-4 text-left"
          )}
          prefetch={false}
        >
          Taux de condamnation par parti
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </Link>
        <Link
          href="/affaires/condamnations?certainty=etabli"
          className={cn(
            buttonVariants({ variant: "outline" }),
            "min-h-12 justify-between whitespace-normal px-4 text-left"
          )}
          prefetch={false}
        >
          Condamnations définitives documentées
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </Link>
      </nav>

      {/* Atteintes à la probité by category → party */}
      {critiqueByCategory.length > 0 && (
        <>
          <h2 id="judicial-heading" className="text-xl font-display font-bold mb-2">
            Atteintes à la probité par parti
          </h2>
          <p className="text-sm text-muted-foreground mb-6">
            Condamnations et procédures validées par un juge, en implication directe, par catégorie
            et par parti actuel de l{"'"}élu (pas celui de l{"'"}époque des faits).
          </p>

          <div className="space-y-6 mb-8">
            {critiqueByCategory.map(({ category, label, total, parties }) => (
              <Card key={category}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center justify-between">
                    <span>{label}</span>
                    <span className="text-sm font-normal text-muted-foreground">
                      {total} affaire{total !== 1 ? "s" : ""}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <HorizontalBars
                    title={`${label} par parti`}
                    bars={parties.map((p) => ({
                      label: p.name,
                      value: p.count,
                      color: p.color || undefined,
                      href: p.slug ? `/affaires/parti/${p.slug}` : undefined,
                    }))}
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Status + Category overview */}
      <div className="grid md:grid-cols-2 gap-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Répartition par type d{"'"}infraction</CardTitle>
            <p className="text-sm text-muted-foreground">Toutes certitudes confondues</p>
          </CardHeader>
          <CardContent>
            <DonutChart
              title="Répartition des affaires par type d'infraction"
              segments={byCategory.map((c) => ({
                label: AFFAIR_SUPER_CATEGORY_LABELS[c.category],
                value: c.count,
                color: SUPER_CATEGORY_HEX[c.category],
              }))}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Statut des procédures</CardTitle>
            <p className="text-sm text-muted-foreground">
              {ongoing} en cours · {closed} terminée{closed !== 1 ? "s" : ""}
            </p>
          </CardHeader>
          <CardContent>
            <HorizontalBars
              title="Répartition des affaires par statut"
              bars={byStatus
                .filter((s) => s.count > 0)
                .sort((a, b) => b.count - a.count)
                .map((s) => ({
                  label: AFFAIR_STATUS_LABELS[s.status],
                  value: s.count,
                  color: ONGOING_STATUSES.has(s.status)
                    ? "#d97706"
                    : NEUTRAL_STATUS_SET.has(s.status)
                      ? "#6b7280"
                      : "#2563eb",
                }))}
            />
          </CardContent>
        </Card>
      </div>

      <ViolenceSection stats={victimStats} />

      <MethodologyDisclaimer>
        Les &laquo;&nbsp;atteintes à la probité&nbsp;&raquo; regroupent la corruption, le trafic
        d&apos;influence, la prise illégale d&apos;intérêts, le favoritisme, le détournement de
        fonds publics, les emplois fictifs et les conflits d&apos;intérêts. Le financement illégal
        de campagne ou de parti et l&apos;incitation à la haine n&apos;en font pas partie. Les
        compteurs &laquo;&nbsp;Élus condamnés&nbsp;&raquo; et &laquo;&nbsp;Élus mis en
        cause&nbsp;&raquo; ne prennent en compte que les affaires validées par un juge :
        condamnations, mises en examen, instructions, renvois devant un tribunal et procès en cours.
        Les enquêtes préliminaires, les simples mentions, les personnes victimes ou plaignantes et
        les procédures closes sans condamnation en sont exclues.{" "}
        <a href="/methodologie#comment-nous-comptons" className="text-primary hover:underline">
          Comment nous comptons
        </a>
      </MethodologyDisclaimer>
    </section>
  );
}
