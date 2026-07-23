import type { DeclarationDetails } from "@/types/hatvp";
import { HorizontalBars } from "@/components/stats/HorizontalBars";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronRight } from "lucide-react";
import { DeclarationMetrics } from "./DeclarationMetrics";

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
  politicianHatvpUrl: string | null;
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

function cleanCompanyName(name: string): string {
  return name.includes("[Données non publiées]") ? "Société (nom non publié)" : name;
}

const DECLARATION_LABEL: Record<string, string> = {
  PATRIMOINE_DEBUT_MANDAT: "Patrimoine (début mandat)",
  PATRIMOINE_FIN_MANDAT: "Patrimoine (fin mandat)",
  PATRIMOINE_MODIFICATION: "Patrimoine (modification)",
  INTERETS: "Intérêts",
};

export function DeclarationCard({ id, declarations }: DeclarationCardProps) {
  if (declarations.length === 0) return null;

  // Find the latest DIA that has parsed details
  const latestDIA = declarations.find((d) => d.details !== null);
  const details = latestDIA?.details as DeclarationDetails | null;

  // Build financial participation bars (top 5 by evaluation)
  const allParticipations =
    details?.financialParticipations.filter((p) => p.evaluation !== null && p.evaluation > 0) ?? [];
  const sortedParticipations = [...allParticipations].sort(
    (a, b) => (b.evaluation ?? 0) - (a.evaluation ?? 0)
  );
  const topParticipations = sortedParticipations.slice(0, 5);
  const remainingParticipations = sortedParticipations.slice(5);

  const participationBars = topParticipations.map((p) => ({
    label: cleanCompanyName(p.company),
    value: p.evaluation!,
    suffix: " €",
  }));

  return (
    <Card id={id}>
      <CardHeader>
        <h2 className="text-lg font-semibold">Déclarations d&apos;intérêts et d&apos;activités</h2>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Key metrics */}
        {details && (
          <DeclarationMetrics
            totalPortfolioValue={details.totalPortfolioValue}
            totalCompanies={details.totalCompanies}
            latestAnnualIncome={details.latestAnnualIncome}
            totalDirectorships={details.totalDirectorships}
          />
        )}

        {/* Financial participations */}
        {participationBars.length > 0 && (
          <div>
            <HorizontalBars bars={participationBars} title="Participations financières" />
            {remainingParticipations.length > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm text-muted-foreground hover:underline">
                  Voir les {sortedParticipations.length} participations
                </summary>
                <div className="pt-2 space-y-2">
                  {remainingParticipations.map((p, i) => (
                    <div key={`part-${i}`} className="flex items-center justify-between text-sm">
                      <span className="mr-2">{cleanCompanyName(p.company)}</span>
                      <span className="font-mono text-muted-foreground whitespace-nowrap">
                        {new Intl.NumberFormat("fr-FR").format(p.evaluation!)} €
                      </span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}

        {/* Professional activities */}
        {details && details.professionalActivities.length > 0 && (
          <CollapsibleSection
            title="Revenus et activités professionnelles"
            count={details.professionalActivities.length}
          >
            {details.professionalActivities.map((activity, i) => (
              <div key={`activity-${i}`} className="text-sm">
                <div className="font-medium">{activity.description}</div>
                <div className="text-muted-foreground">{activity.employer}</div>
                {activity.startDate && (
                  <div className="text-xs text-muted-foreground">
                    {activity.startDate} — {activity.endDate || "en cours"}
                  </div>
                )}
                {activity.annualRevenues.length > 0 && (
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                    {activity.annualRevenues.map((r) => (
                      <span key={r.year} className="text-xs font-mono">
                        {r.year}: {new Intl.NumberFormat("fr-FR").format(r.amount)} €
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
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
                <div className="font-medium">{mandate.mandate}</div>
                {mandate.startDate && (
                  <div className="text-xs text-muted-foreground">
                    {mandate.startDate} — {mandate.endDate || "en cours"}
                  </div>
                )}
                {mandate.annualRevenues.length > 0 && (
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                    {mandate.annualRevenues.map((r) => (
                      <span key={r.year} className="text-xs font-mono">
                        {r.year}: {new Intl.NumberFormat("fr-FR").format(r.amount)} €
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </CollapsibleSection>
        )}

        {/* Directorships */}
        {details && details.directorships.length > 0 && (
          <CollapsibleSection title="Postes de direction" count={details.directorships.length}>
            {details.directorships.map((dir, i) => (
              <div key={`dir-${i}`} className="text-sm">
                <div className="font-medium">{dir.company}</div>
                <div className="text-muted-foreground">{dir.role}</div>
                {dir.startDate && (
                  <div className="text-xs text-muted-foreground">
                    {dir.startDate} — {dir.endDate || "en cours"}
                  </div>
                )}
                {dir.annualRevenues.length > 0 && (
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                    {dir.annualRevenues.map((r) => (
                      <span key={r.year} className="text-xs font-mono">
                        {r.year}: {new Intl.NumberFormat("fr-FR").format(r.amount)} €
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </CollapsibleSection>
        )}

        {/* Spouse & collaborators */}
        {details && (details.spouseActivity || details.collaborators.length > 0) && (
          <CollapsibleSection
            title="Conjoint & collaborateurs"
            count={(details.spouseActivity ? 1 : 0) + details.collaborators.length}
          >
            {details.spouseActivity && (
              <p className="text-sm text-muted-foreground">{details.spouseActivity}</p>
            )}
            {details.collaborators.map((c, i) => (
              <div key={`collab-${i}`} className="text-sm">
                <span className="font-medium">{c.name}</span>
                <span className="text-muted-foreground"> — {c.employer}</span>
              </div>
            ))}
          </CollapsibleSection>
        )}

        {/* All declaration links */}
        <div className="flex flex-wrap gap-2 pt-4 border-t">
          {declarations.map((d) => (
            <a key={d.id} href={d.pdfUrl ?? d.hatvpUrl} target="_blank" rel="noopener noreferrer">
              <Badge variant="outline" className="hover:bg-accent cursor-pointer">
                {DECLARATION_LABEL[d.type] ?? d.type} {d.year} ↗
              </Badge>
            </a>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
