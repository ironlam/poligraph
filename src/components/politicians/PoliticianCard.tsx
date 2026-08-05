import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PoliticianAvatar } from "./PoliticianAvatar";
import { MANDATE_TYPE_LABELS, PARTY_ROLE_LABELS, feminizePartyRole } from "@/config/labels";
import { ensureContrast } from "@/lib/contrast";
import type { PoliticianWithParty, PoliticianWithPartyAndCounts } from "@/types";

interface PoliticianCardProps {
  politician: PoliticianWithParty | PoliticianWithPartyAndCounts;
  showConvictionBadge?: boolean;
  showMissingDeclarationBadge?: boolean;
}

// Format mandate for display (short version)
function formatMandateShort(
  mandate: { type: string; constituency: string | null } | null | undefined
): string | null {
  if (!mandate) return null;

  const typeLabel =
    MANDATE_TYPE_LABELS[mandate.type as keyof typeof MANDATE_TYPE_LABELS] || mandate.type;

  if (mandate.constituency) {
    // Extract department name from "Département (numéro)"
    const match = mandate.constituency.match(/^([^(]+)/);
    const dept = match ? match[1]!.trim() : mandate.constituency;
    return `${typeLabel} · ${dept}`;
  }

  return typeLabel;
}

export function PoliticianCard({
  politician,
  showConvictionBadge = false,
  showMissingDeclarationBadge = false,
}: PoliticianCardProps) {
  const hasCritiqueAffair =
    ("hasCritiqueAffair" in politician && politician.hasCritiqueAffair) ||
    ("hasCritiqueAffair" in politician && politician.hasCritiqueAffair);
  const affairCount = "_count" in politician ? politician._count.affairs : 0;
  const isDeceased = politician.deathDate !== null;
  const missingDeclaration = "missingDeclaration" in politician && politician.missingDeclaration;
  const currentMandate = "currentMandate" in politician ? politician.currentMandate : null;
  const significantPartyRole =
    "significantPartyRole" in politician ? politician.significantPartyRole : null;
  const mandateDisplay = formatMandateShort(currentMandate);

  // Fallback display: party role when no current mandate
  const roleDisplay =
    !mandateDisplay && significantPartyRole
      ? `${feminizePartyRole(PARTY_ROLE_LABELS[significantPartyRole.role], politician.civility)} · ${significantPartyRole.partyShortName}`
      : null;

  return (
    <Link
      href={`/politiques/${politician.slug}`}
      prefetch={false}
      className="block group focus-visible:outline-none"
    >
      <Card
        className={`h-full transition-all duration-300 hover:shadow-xl hover:-translate-y-1 hover:border-primary/30 focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2 ${hasCritiqueAffair ? "ring-1 ring-red-200 dark:ring-red-900/50" : ""}`}
      >
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <div className="relative">
              <div className="transition-transform duration-300 group-hover:scale-110">
                <PoliticianAvatar
                  photoUrl={politician.photoUrl}
                  blobPhotoUrl={politician.blobPhotoUrl}
                  firstName={politician.firstName}
                  lastName={politician.lastName}
                  size="md"
                />
              </div>
              {showConvictionBadge && hasCritiqueAffair && (
                <div
                  className="absolute -top-1 -right-1 w-5 h-5 bg-destructive rounded-full flex items-center justify-center shadow-md animate-pulse"
                  title="Condamnation définitive pour atteinte à la probité"
                  aria-label="Ce représentant a une condamnation définitive pour atteinte à la probité"
                >
                  <span className="text-white text-xs font-bold">!</span>
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-lg group-hover:text-primary transition-colors duration-200">
                {politician.fullName}
              </p>
              {(mandateDisplay || roleDisplay) && (
                <p className="text-sm text-muted-foreground mt-0.5">
                  {mandateDisplay || roleDisplay}
                </p>
              )}
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                {politician.currentParty && (
                  <Badge
                    variant="secondary"
                    className="font-medium transition-colors"
                    title={politician.currentParty.name}
                    style={{
                      backgroundColor: politician.currentParty.color
                        ? `${politician.currentParty.color}15`
                        : undefined,
                      color: politician.currentParty.color
                        ? ensureContrast(politician.currentParty.color, "#ffffff")
                        : undefined,
                      borderColor: politician.currentParty.color
                        ? `${politician.currentParty.color}30`
                        : undefined,
                    }}
                  >
                    {politician.currentParty.shortName}
                  </Badge>
                )}
                {isDeceased && (
                  <Badge variant="outline" className="text-xs text-muted-foreground bg-muted/50">
                    Décédé{politician.civility === "Mme" ? "e" : ""}
                  </Badge>
                )}
                {showConvictionBadge && hasCritiqueAffair && affairCount > 0 && (
                  <Badge
                    variant="outline"
                    className="text-xs text-destructive/80 border-destructive/40 bg-destructive/5"
                  >
                    Probité : {affairCount} condamnation{affairCount > 1 ? "s" : ""}
                  </Badge>
                )}
                {showMissingDeclarationBadge && missingDeclaration && (
                  <Badge
                    variant="outline"
                    className="text-xs text-amber-600 border-amber-300 bg-amber-50 dark:text-amber-400 dark:border-amber-800 dark:bg-amber-950/30"
                  >
                    Aucune déclaration publiée
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
