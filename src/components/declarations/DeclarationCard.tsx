import type { DeclarationDetails } from "@/types/hatvp";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, Info } from "lucide-react";
import { DeclarationMetrics } from "./DeclarationMetrics";
import { DeclarationHistory } from "./DeclarationHistory";
import { AnnualRevenueSeries } from "./AnnualRevenueSeries";
import { FinancialParticipations } from "./FinancialParticipations";
import {
  displayHatvpText,
  isEmptyPlaceholder,
  formatEuroExact,
} from "@/lib/declarations/hatvp-display";
import { groupDeclarationLinks, type DeclarationLink } from "@/lib/declarations/declaration-links";

interface DeclarationCardProps {
  id?: string;
  declarations: Array<{
    id: string;
    type: string;
    year: number;
    hatvpUrl: string;
    pdfUrl: string | null;
    details: DeclarationDetails | null;
  }>;
}

function CollapsibleSection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <details className="group border rounded-lg">
      <summary className="flex items-center gap-2 cursor-pointer p-3 hover:bg-muted/50 transition-colors rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1">
        <ChevronRight
          className="w-4 h-4 text-muted-foreground transition-transform group-open:rotate-90"
          aria-hidden="true"
        />
        <span className="text-sm font-medium flex-1">{title}</span>
        <Badge variant="secondary" className="text-xs px-1.5 py-0">
          {count}
        </Badge>
      </summary>
      <div className="px-3 pb-3 pt-1 space-y-3">{children}</div>
    </details>
  );
}

// Sum of every declared annual amount across the items of a section.
function sectionTotal(items: Array<{ annualRevenues: { amount: number }[] }>): number {
  return items.reduce((sum, it) => sum + it.annualRevenues.reduce((a, r) => a + r.amount, 0), 0);
}

function SectionTotal({ items }: { items: Array<{ annualRevenues: { amount: number }[] }> }) {
  return (
    <p className="pt-2 mt-1 border-t text-sm">
      <span className="font-semibold">Total des montants déclarés dans cette section</span> :{" "}
      <span className="font-semibold tabular-nums">{formatEuroExact(sectionTotal(items))}</span>
    </p>
  );
}

function DeclarationLinkGroup({ title, links }: { title: string; links: DeclarationLink[] }) {
  if (links.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground mb-1.5">{title}</p>
      <div className="flex flex-wrap gap-2">
        {links.map((l) => (
          <a key={l.id} href={l.url} target="_blank" rel="noopener noreferrer">
            <Badge variant="outline" className="hover:bg-accent cursor-pointer">
              {l.label}
              {l.isMostRecentYear ? " · année la plus récente" : ""} ↗
              <span className="sr-only"> (ouvre un nouvel onglet)</span>
            </Badge>
          </a>
        ))}
      </div>
    </div>
  );
}

export function DeclarationCard({ id, declarations }: DeclarationCardProps) {
  if (declarations.length === 0) return null;

  // Latest DIA that has parsed details drives the metrics + detail sections.
  const latestDIA = declarations.find((d) => d.details !== null);
  const details = latestDIA?.details as DeclarationDetails | null;

  const links = groupDeclarationLinks(declarations);

  // Collaborators: usable ones shown individually; "Néant"/empty grouped.
  const usableCollaborators =
    details?.collaborators.filter((c) => !isEmptyPlaceholder(c.employer)) ?? [];
  const emptyCollaboratorsCount = (details?.collaborators.length ?? 0) - usableCollaborators.length;
  const spouse = displayHatvpText(details?.spouseActivity);
  const collaboratorsCount = (spouse ? 1 : 0) + usableCollaborators.length;

  return (
    <Card id={id}>
      <CardHeader>
        <h2 className="text-lg font-semibold">Déclarations d&apos;intérêts et d&apos;activités</h2>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Editorial integrity: declarative, not audited; DIA is not DSP. */}
        <div className="flex gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-xs leading-relaxed text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden={true} />
          <div>
            <strong>Données déclaratives, non auditées.</strong> Ces montants sont déclarés par
            l&apos;élu(e) et publiés par la Haute Autorité pour la transparence de la vie publique
            (HATVP). Poligraph les met en forme sans les vérifier ni les estimer.
            <details className="mt-1.5">
              <summary className="cursor-pointer font-medium text-primary">
                Intérêts (DIA) n&apos;est pas patrimoine (DSP)
              </summary>
              <p className="mt-1 text-muted-foreground">
                Pour les parlementaires, seule la déclaration d&apos;intérêts et d&apos;activités
                (DIA) est consultable en ligne : elle liste les activités, revenus et
                participations. La déclaration de patrimoine (DSP), qui détaille les biens
                immobiliers, comptes et épargne, n&apos;est consultable qu&apos;en préfecture. Les
                montants affichés ici ne représentent donc pas une fortune nette.
              </p>
            </details>
          </div>
        </div>

        {/* Key metrics */}
        {details && (
          <DeclarationMetrics
            totalPortfolioValue={details.totalPortfolioValue}
            totalCompanies={details.totalCompanies}
            latestAnnualIncome={details.latestAnnualIncome}
            electoralMandatesCount={details.electoralMandates.length}
            directorshipsCount={details.directorships.length}
          />
        )}

        {/* Financial participations */}
        {details && details.financialParticipations.length > 0 && (
          <FinancialParticipations participations={details.financialParticipations} />
        )}

        {/* Professional activities */}
        {details && details.professionalActivities.length > 0 && (
          <CollapsibleSection
            title="Revenus et activités professionnelles"
            count={details.professionalActivities.length}
          >
            {details.professionalActivities.map((activity, i) => (
              <div key={`activity-${i}`} className="text-sm">
                <div className="font-medium">
                  {displayHatvpText(activity.description) ?? "(non publié)"}
                </div>
                {displayHatvpText(activity.employer) && (
                  <div className="text-muted-foreground">{displayHatvpText(activity.employer)}</div>
                )}
                {activity.startDate && (
                  <div className="text-xs text-muted-foreground">
                    {activity.startDate} — {activity.endDate || "en cours"}
                  </div>
                )}
                <AnnualRevenueSeries revenues={activity.annualRevenues} />
              </div>
            ))}
            <SectionTotal items={details.professionalActivities} />
          </CollapsibleSection>
        )}

        {/* Electoral mandates */}
        {details && details.electoralMandates.length > 0 && (
          <CollapsibleSection
            title="Mandats électifs et indemnités"
            count={details.electoralMandates.length}
          >
            {details.electoralMandates.map((mandate, i) => (
              <div key={`mandate-${i}`} className="text-sm">
                <div className="font-medium">
                  {displayHatvpText(mandate.mandate) ?? "(non publié)"}
                </div>
                {mandate.startDate && (
                  <div className="text-xs text-muted-foreground">
                    {mandate.startDate} — {mandate.endDate || "en cours"}
                  </div>
                )}
                <AnnualRevenueSeries revenues={mandate.annualRevenues} />
              </div>
            ))}
            <SectionTotal items={details.electoralMandates} />
          </CollapsibleSection>
        )}

        {/* Directorships */}
        {details && details.directorships.length > 0 && (
          <CollapsibleSection title="Postes de direction" count={details.directorships.length}>
            {details.directorships.map((dir, i) => (
              <div key={`dir-${i}`} className="text-sm">
                <div className="font-medium">{displayHatvpText(dir.company) ?? "(non publié)"}</div>
                {displayHatvpText(dir.role) && (
                  <div className="text-muted-foreground">{displayHatvpText(dir.role)}</div>
                )}
                {dir.startDate && (
                  <div className="text-xs text-muted-foreground">
                    {dir.startDate} — {dir.endDate || "en cours"}
                  </div>
                )}
                <AnnualRevenueSeries revenues={dir.annualRevenues} />
              </div>
            ))}
            <SectionTotal items={details.directorships} />
          </CollapsibleSection>
        )}

        {/* Spouse & collaborators */}
        {details && (collaboratorsCount > 0 || emptyCollaboratorsCount > 0) && (
          <CollapsibleSection title="Conjoint & collaborateurs" count={collaboratorsCount}>
            {spouse && <p className="text-sm text-muted-foreground">{spouse}</p>}
            {usableCollaborators.map((c, i) => (
              <div key={`collab-${i}`} className="text-sm">
                <span className="font-medium">{displayHatvpText(c.name) ?? "(non publié)"}</span>
                <span className="text-muted-foreground">
                  {" "}
                  — {displayHatvpText(c.employer) ?? "(non publié)"}
                </span>
              </div>
            ))}
            {emptyCollaboratorsCount > 0 && (
              <p className="text-sm text-muted-foreground">
                {emptyCollaboratorsCount} collaborateur{emptyCollaboratorsCount > 1 ? "s" : ""}{" "}
                déclaré{emptyCollaboratorsCount > 1 ? "s" : ""} « Néant » ou sans objet
              </p>
            )}
          </CollapsibleSection>
        )}

        {/* DIA history (chronological, null-aware, no variation) */}
        <DeclarationHistory
          declarations={declarations
            .filter((d) => d.type === "INTERETS")
            .map((d) => ({ id: d.id, year: d.year, details: d.details }))}
        />

        {/* Declaration links, grouped by type + sorted */}
        <div className="space-y-3 pt-4 border-t">
          <DeclarationLinkGroup title="Intérêts (DIA)" links={links.interets} />
          <DeclarationLinkGroup title="Patrimoine (préfecture)" links={links.patrimoine} />
        </div>
      </CardContent>
    </Card>
  );
}
