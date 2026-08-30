import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import { PoliticalPositionBadge } from "@/components/partis/PoliticalPositionBadge";
import type { PoliticalPosition } from "@/generated/prisma";

/** A neighbouring party in the lineage: the one this one succeeds, or one that succeeds it. */
interface RelatedParty {
  id: string;
  name: string;
  slug: string | null;
  color: string | null;
}

interface PartySidebarProps {
  party: {
    foundedDate: Date | null;
    dissolvedDate: Date | null;
    ideology: string | null;
    politicalPosition: PoliticalPosition | null;
    politicalPositionSource: string | null;
    politicalPositionSourceUrl: string | null;
    headquarters: string | null;
    website: string | null;
    predecessor: RelatedParty | null;
    successors: RelatedParty[];
    externalIds: Array<{ id: string; source: string; url: string | null }>;
  };
  currentMemberCount: number;
  historicalMemberCount: number;
  affairCount: number;
}

/**
 * The right-hand column of a party page: identity, lineage, counts, external links.
 *
 * Four cards that read the party record and nothing else. They were inline in the page component,
 * which is how it reached 767 lines.
 */
export function PartySidebar({
  party,
  currentMemberCount,
  historicalMemberCount,
  affairCount,
}: PartySidebarProps) {
  const hasLineage = party.predecessor !== null || party.successors.length > 0;

  return (
    <div className="space-y-6">
      {/* Quick info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Informations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {party.foundedDate && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Fondé</span>
              <span className="font-semibold">{formatDate(party.foundedDate)}</span>
            </div>
          )}
          {party.dissolvedDate && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Dissous</span>
              <span className="font-semibold">{formatDate(party.dissolvedDate)}</span>
            </div>
          )}
          {party.ideology && (
            <div>
              <span className="text-muted-foreground block mb-1">Idéologie</span>
              <span className="text-sm">{party.ideology}</span>
            </div>
          )}
          {party.politicalPosition && party.politicalPositionSource && (
            <div>
              <span className="text-muted-foreground block mb-1">Position politique</span>
              <div className="flex items-center gap-2">
                <PoliticalPositionBadge position={party.politicalPosition} />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Source : {party.politicalPositionSource}
              </p>
              {party.politicalPositionSourceUrl && (
                <a
                  href={party.politicalPositionSourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline"
                >
                  Voir la source
                </a>
              )}
            </div>
          )}
          {party.headquarters && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Siège</span>
              <span className="text-sm">{party.headquarters}</span>
            </div>
          )}
          {party.website && (
            <div>
              <a
                href={party.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline"
              >
                Site officiel
              </a>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Party evolution */}
      {hasLineage && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Évolution</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {party.predecessor && (
              <div>
                <span className="text-sm text-muted-foreground block mb-1">Succède à</span>
                <PartyLink party={party.predecessor} className="inline-flex" />
              </div>
            )}
            {party.successors.length > 0 && (
              <div>
                <span className="text-sm text-muted-foreground block mb-1">Précède</span>
                <div className="space-y-1">
                  {party.successors.map((successor) => (
                    <PartyLink key={successor.id} party={successor} className="flex" />
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">En bref</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <CountRow label="Membres actuels" value={currentMemberCount} />
          <CountRow label="Anciens membres" value={historicalMemberCount} />
          <CountRow label="Affaires" value={affairCount} />
        </CardContent>
      </Card>

      {/* External links */}
      {party.externalIds.length > 0 && (
        <Card className="bg-muted">
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground mb-2">Liens externes</p>
            <div className="flex flex-wrap gap-2">
              {party.externalIds.map(
                (ext) =>
                  ext.url && (
                    <a
                      key={ext.id}
                      href={ext.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline"
                    >
                      {ext.source.replace("_", " ")}
                    </a>
                  )
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/** A party without a slug has no page yet, so the link falls back to the listing. */
function PartyLink({ party, className }: { party: RelatedParty; className: string }) {
  return (
    <Link
      href={party.slug ? `/partis/${party.slug}` : "/partis"}
      className={`${className} items-center gap-2 text-primary hover:underline`}
    >
      <span
        className="w-3 h-3 rounded-full"
        style={{ backgroundColor: party.color || "#888" }}
        aria-hidden="true"
      />
      {party.name}
    </Link>
  );
}

function CountRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
