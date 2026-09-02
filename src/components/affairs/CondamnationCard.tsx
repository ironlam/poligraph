import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PoliticianAvatar } from "@/components/politicians/PoliticianAvatar";
import { getAffairPartyDisplay } from "@/lib/affairs/party-display";
import {
  AFFAIR_SUPER_CATEGORY_COLORS,
  AFFAIR_SUPER_CATEGORY_LABELS,
  CATEGORY_TO_SUPER,
} from "@/config/labels";

type Affair = {
  id: string;
  slug: string;
  title: string;
  status: string;
  category: keyof typeof CATEGORY_TO_SUPER;
  severity: string;
  involvement: string;
  verdictDate: Date | null;
  startDate: Date | null;
  factsDate: Date | null;
  sentence: string | null;
  politicianId: string;
  partyAtTimeId: string | null;
  partyAtTime: {
    id: string;
    slug: string | null;
    shortName: string;
    name: string;
    foundedDate: Date | null;
  } | null;
  politician: {
    id: string;
    slug: string;
    firstName: string;
    lastName: string;
    fullName: string;
    photoUrl: string | null;
    blobPhotoUrl: string | null;
    currentParty: {
      id: string;
      slug: string | null;
      shortName: string;
      name: string;
      foundedDate: Date | null;
    } | null;
  };
  sources: { id: string }[];
};

export function CondamnationCard({ affair, definitif }: { affair: Affair; definitif: boolean }) {
  const superCat = CATEGORY_TO_SUPER[affair.category];
  const partyDisplay = getAffairPartyDisplay({
    factsDate: affair.factsDate,
    partyAtTime: affair.partyAtTime,
    currentParty: affair.politician.currentParty,
  });
  const displayDate = affair.verdictDate || affair.startDate || affair.factsDate;
  const year = displayDate ? new Date(displayDate).getFullYear() : null;

  return (
    <Card
      data-definitif={definitif}
      className="border-l-4 transition-shadow hover:shadow-md"
      style={{
        borderLeftColor: definitif ? "#166534" : "#b45309",
      }}
    >
      <CardContent className="pt-6">
        <div className="flex gap-4">
          <PoliticianAvatar
            firstName={affair.politician.firstName}
            lastName={affair.politician.lastName}
            photoUrl={affair.politician.photoUrl}
            blobPhotoUrl={affair.politician.blobPhotoUrl}
            size="sm"
          />
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-start gap-2 mb-2">
              {year && (
                <Badge variant="secondary" className="font-mono text-base">
                  {year}
                </Badge>
              )}
              <Badge className={AFFAIR_SUPER_CATEGORY_COLORS[superCat]}>
                {AFFAIR_SUPER_CATEGORY_LABELS[superCat]}
              </Badge>
              {definitif ? (
                <Badge className="bg-green-100 text-green-900 border-green-300">
                  Condamnation définitive
                </Badge>
              ) : (
                <Badge className="bg-amber-100 text-amber-900 border-amber-300">
                  Non définitif
                </Badge>
              )}
            </div>

            <h3 className="text-lg font-semibold mb-1">
              <Link href={`/affaires/${affair.slug}`} className="hover:underline" prefetch={false}>
                {affair.title}
              </Link>
            </h3>

            <p className="text-sm">
              <Link
                href={`/politiques/${affair.politician.slug}`}
                className="text-primary hover:underline font-medium"
                prefetch={false}
              >
                {affair.politician.fullName}
              </Link>
              {partyDisplay.kind === "at-time" && partyDisplay.party.slug && (
                <>
                  {" ("}
                  <Link
                    href={`/affaires/parti/${partyDisplay.party.slug}`}
                    className="text-muted-foreground hover:underline"
                    prefetch={false}
                  >
                    {partyDisplay.party.shortName}
                  </Link>
                  {!partyDisplay.sameAsCurrent && (
                    <span className="text-xs text-muted-foreground"> à l{"'"}époque</span>
                  )}
                  {")"}
                </>
              )}
              {partyDisplay.kind === "current" && (
                <span className="text-muted-foreground">
                  {" ("}
                  {partyDisplay.party.shortName}
                  {")"}
                </span>
              )}
            </p>

            {affair.sentence && (
              <p className="text-sm mt-2">
                <span className="font-medium">
                  {definitif ? "Peine :" : "Peine prononcée (susceptible d'appel/cassation) :"}
                </span>{" "}
                {affair.sentence}
              </p>
            )}

            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-3">
              <span>
                {affair.sources.length} source
                {affair.sources.length !== 1 ? "s" : ""}
              </span>
              <Link
                href={`/affaires/${affair.slug}`}
                className="text-primary hover:underline"
                prefetch={false}
              >
                Voir les détails →
              </Link>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
