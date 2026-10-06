import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PoliticianAvatar } from "@/components/politicians/PoliticianAvatar";
import { StatusBadge } from "./StatusBadge";
import { ensureContrast } from "@/lib/contrast";
import { Users, Building2, FileText } from "lucide-react";
import type { PPLStats } from "@/lib/data/legislation";
import type { DossierStatus } from "@/generated/prisma";

export function DossierPPLStats({ stats }: { stats: PPLStats }) {
  const { topAuthors, topParties, topDossiers } = stats;

  if (topAuthors.length === 0) return null;

  return (
    <div className="mb-8">
      <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
        <Users className="h-5 w-5 text-muted-foreground" />
        Initiatives et signatures suivies
      </h2>
      <p className="text-sm text-muted-foreground mb-4 max-w-3xl">
        Ces chiffres comptent des dépôts et cosignatures dans les données suivies par Poligraph. Ils
        ne mesurent ni l&apos;efficacité législative, ni la qualité des textes, ni leur probabilité
        d&apos;adoption. Le rattachement à un parti reflète le parti actuel du signataire, pas son
        groupe au moment du dépôt.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Parlementaires les plus présents dans les signatures */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" />
              Parlementaires les plus présents dans les signatures
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-3">
              {topAuthors.slice(0, 5).map((author, i) => {
                const partyColor = author.partyColor
                  ? ensureContrast(author.partyColor)
                  : undefined;
                return (
                  <Link
                    key={author.slug}
                    href={`/politiques/${author.slug}`}
                    prefetch={false}
                    className="flex items-center gap-3 group"
                  >
                    <span className="text-sm font-mono text-muted-foreground w-5 shrink-0">
                      {i + 1}.
                    </span>
                    <PoliticianAvatar
                      photoUrl={author.photoUrl}
                      blobPhotoUrl={author.blobPhotoUrl}
                      fullName={author.fullName}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium group-hover:underline">{author.fullName}</p>
                      {author.partyShortName && (
                        <p
                          className="text-xs"
                          style={partyColor ? { color: partyColor } : undefined}
                        >
                          {author.partyShortName}
                        </p>
                      )}
                    </div>
                    <span className="text-sm tabular-nums text-muted-foreground shrink-0">
                      {author.count}
                    </span>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Partis actuels des signataires */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Partis actuels des signataires
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-3">
              {topParties.slice(0, 5).map((party, i) => {
                const color = party.color ? ensureContrast(party.color) : undefined;
                // Compute bar width relative to max
                const maxCount = topParties[0]?.count || 1;
                const pct = Math.round((party.count / maxCount) * 100);
                return (
                  <Link
                    key={party.slug}
                    href={`/partis/${party.slug}`}
                    prefetch={false}
                    className="block group"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-mono text-muted-foreground w-5 shrink-0">
                        {i + 1}.
                      </span>
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: color || "#94a3b8" }}
                      />
                      <span className="text-sm font-medium group-hover:underline flex-1">
                        {party.shortName}
                      </span>
                      <span className="text-sm tabular-nums text-muted-foreground shrink-0">
                        {party.count.toLocaleString("fr-FR")}
                      </span>
                    </div>
                    <div className="ml-7 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: color || "#94a3b8",
                        }}
                      />
                    </div>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Textes les plus co-signés */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Textes les plus co-signés
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-3">
              {topDossiers.map((dossier, i) => (
                <Link
                  key={dossier.slug}
                  href={`/parlement/dossiers/${dossier.slug}`}
                  prefetch={false}
                  className="block group"
                >
                  <div className="flex items-start gap-2">
                    <span className="text-sm font-mono text-muted-foreground w-5 shrink-0 mt-0.5">
                      {i + 1}.
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium group-hover:underline line-clamp-2 leading-snug">
                        {dossier.shortTitle || dossier.title}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <StatusBadge status={dossier.status as DossierStatus} />
                        <span className="text-xs text-muted-foreground">
                          {dossier.authorCount} signataires
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
