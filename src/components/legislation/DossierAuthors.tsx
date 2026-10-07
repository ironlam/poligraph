import Link from "next/link";
import { PoliticianAvatar } from "@/components/politicians/PoliticianAvatar";
import { Users, BookOpen, ChevronRight } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ensureContrast } from "@/lib/contrast";
import type { DossierActorRole, Chamber } from "@/generated/prisma";

interface DossierAuthor {
  role?: DossierActorRole | null;
  chamber?: Chamber | null;
  commission?: string | null;
  politician: {
    slug: string;
    fullName: string;
    photoUrl: string | null;
    blobPhotoUrl: string | null;
    civility: string | null;
    currentParty: { shortName: string; color: string | null } | null;
    mandates?: {
      parliamentaryData: {
        parliamentaryGroup: {
          code: string;
          name: string;
          shortName: string | null;
          color: string | null;
        } | null;
      } | null;
    }[];
  };
}

const CHAMBER_LABELS: Record<string, string> = {
  AN: "AN",
  SENAT: "Sénat",
};

// Collapse threshold: show details toggle only when there are more cosignataires
const COLLAPSE_THRESHOLD = 12;

function getGroupInfo(author: DossierAuthor) {
  const group = author.politician.mandates?.[0]?.parliamentaryData?.parliamentaryGroup;
  if (group) return { code: group.shortName || group.code, name: group.name, color: group.color };
  const party = author.politician.currentParty;
  if (party) return { code: party.shortName, name: party.shortName, color: party.color };
  return { code: "Ind.", name: "Indépendant", color: null };
}

// Featured display for main author(s)
function FeaturedAuthor({ author }: { author: DossierAuthor }) {
  const party = author.politician.currentParty;
  const partyColor = party?.color ? ensureContrast(party.color) : undefined;
  const chamberLabel = author.chamber ? CHAMBER_LABELS[author.chamber] : null;
  const group = author.politician.mandates?.[0]?.parliamentaryData?.parliamentaryGroup;
  const groupColor = group?.color ? ensureContrast(group.color) : undefined;

  return (
    <Link
      href={`/politiques/${author.politician.slug}`}
      prefetch={false}
      className="flex items-center gap-4 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors group"
    >
      <PoliticianAvatar
        photoUrl={author.politician.photoUrl}
        blobPhotoUrl={author.politician.blobPhotoUrl}
        fullName={author.politician.fullName}
        size="lg"
      />
      <div className="min-w-0">
        <p className="font-medium group-hover:underline">
          {author.politician.civility ? `${author.politician.civility} ` : ""}
          {author.politician.fullName}
        </p>
        <div className="flex flex-wrap items-center gap-2 mt-1 text-sm">
          {group && (
            <span className="font-medium" style={groupColor ? { color: groupColor } : undefined}>
              {group.shortName || group.code}
            </span>
          )}
          {party && !group && (
            <span className="font-medium" style={partyColor ? { color: partyColor } : undefined}>
              {party.shortName}
            </span>
          )}
          {chamberLabel && <span className="text-muted-foreground">{chamberLabel}</span>}
        </div>
      </div>
    </Link>
  );
}

// Rapporteur display
function RapporteurEntry({ author }: { author: DossierAuthor }) {
  const party = author.politician.currentParty;
  const partyColor = party?.color ? ensureContrast(party.color) : undefined;
  const chamberLabel = author.chamber ? CHAMBER_LABELS[author.chamber] : null;
  const group = author.politician.mandates?.[0]?.parliamentaryData?.parliamentaryGroup;
  const groupColor = group?.color ? ensureContrast(group.color) : undefined;

  return (
    <Link
      href={`/politiques/${author.politician.slug}`}
      prefetch={false}
      className="flex items-center gap-3 group"
    >
      <PoliticianAvatar
        photoUrl={author.politician.photoUrl}
        blobPhotoUrl={author.politician.blobPhotoUrl}
        fullName={author.politician.fullName}
        size="md"
      />
      <div className="min-w-0">
        <p className="text-sm font-medium group-hover:underline leading-tight">
          {author.politician.civility ? `${author.politician.civility} ` : ""}
          {author.politician.fullName}
        </p>
        {(party || group || chamberLabel) && (
          <p className="text-xs mt-0.5 flex items-center gap-1.5">
            {group && (
              <span style={groupColor ? { color: groupColor } : undefined}>
                {group.shortName || group.code}
              </span>
            )}
            {party && !group && (
              <span style={partyColor ? { color: partyColor } : undefined}>{party.shortName}</span>
            )}
            {chamberLabel && <span className="text-muted-foreground">{chamberLabel}</span>}
          </p>
        )}
        {author.commission && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{author.commission}</p>
        )}
      </div>
    </Link>
  );
}

// Group breakdown pills
function GroupBreakdown({
  groups,
}: {
  groups: { code: string; name: string; color: string | null; count: number }[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {groups.map((g) => {
        const color = g.color ? ensureContrast(g.color) : undefined;
        return (
          <span
            key={g.code}
            title={g.name}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-muted"
          >
            {color && (
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
            )}
            {g.code}
            <span className="text-muted-foreground">({g.count})</span>
          </span>
        );
      })}
    </div>
  );
}

/**
 * Collapsible section for co-authors: shows group pills summary,
 * full grouped list behind a <details> toggle.
 */
function CoAuthorsCollapsible({ coAuthors, label }: { coAuthors: DossierAuthor[]; label: string }) {
  const sortedGroups = buildGroupBreakdown(coAuthors);
  const breakdown = sortedGroups.map((g) => ({
    code: g.info.code,
    name: g.info.name,
    color: g.info.color,
    count: g.members.length,
  }));

  const needsCollapse = coAuthors.length > COLLAPSE_THRESHOLD;

  return (
    <div>
      <h4 className="text-sm font-semibold text-muted-foreground mb-3">{label}</h4>

      <GroupBreakdown groups={breakdown} />

      {needsCollapse ? (
        <details className="mt-4 group/details">
          <summary className="cursor-pointer text-sm text-primary hover:underline list-none flex items-center gap-1.5 select-none">
            <ChevronRight className="h-4 w-4 transition-transform group-open/details:rotate-90" />
            Voir la liste complète
          </summary>
          <div className="mt-4 space-y-5">
            {sortedGroups.map((g) => (
              <GroupSection key={g.info.code} group={g.info} members={g.members} />
            ))}
          </div>
        </details>
      ) : (
        <p className="mt-3 text-sm leading-relaxed">
          {coAuthors.map((a, i) => (
            <span key={a.politician.slug}>
              {i > 0 && ", "}
              <Link
                href={`/politiques/${a.politician.slug}`}
                prefetch={false}
                className="text-primary hover:underline"
              >
                {a.politician.fullName}
              </Link>
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

/**
 * Build grouped breakdown from a list of authors.
 * Returns groups sorted by member count (descending).
 */
function buildGroupBreakdown(authors: DossierAuthor[]) {
  const groupMap = new Map<
    string,
    { info: ReturnType<typeof getGroupInfo>; members: DossierAuthor[] }
  >();
  for (const author of authors) {
    const info = getGroupInfo(author);
    const existing = groupMap.get(info.code);
    if (existing) {
      existing.members.push(author);
    } else {
      groupMap.set(info.code, { info, members: [author] });
    }
  }
  return Array.from(groupMap.values()).sort((a, b) => b.members.length - a.members.length);
}

function GroupSection({
  group,
  members,
}: {
  group: ReturnType<typeof getGroupInfo>;
  members: DossierAuthor[];
}) {
  const color = group.color ? ensureContrast(group.color) : undefined;

  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        {color && (
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
        )}
        <span className="text-sm font-medium">{group.code}</span>
        <span className="text-xs text-muted-foreground">({members.length})</span>
      </div>
      <p className="text-sm pl-5 leading-relaxed">
        {members.map((a, i) => (
          <span key={a.politician.slug}>
            {i > 0 && ", "}
            <Link
              href={`/politiques/${a.politician.slug}`}
              prefetch={false}
              className="text-primary hover:underline"
            >
              {a.politician.fullName}
            </Link>
          </span>
        ))}
      </p>
    </div>
  );
}

export function DossierAuthors({ authors }: { authors: DossierAuthor[] }) {
  if (!authors || authors.length === 0) return null;

  const rapporteurs = authors.filter(
    (a) => a.role === "RAPPORTEUR" || a.role === "RAPPORTEUR_AVIS"
  );
  const explicitCosignataires = authors.filter((a) => a.role === "COSIGNATAIRE");
  const auteurs = authors.filter((a) => !a.role || a.role === "AUTEUR");

  // AN data often marks ALL authors as AUTEUR (no COSIGNATAIRE distinction).
  // When many AUTEURs exist: first is the main author, rest are co-authors.
  let mainAuthors: DossierAuthor[];
  let coAuthors: DossierAuthor[];

  if (explicitCosignataires.length > 0) {
    mainAuthors = auteurs;
    coAuthors = explicitCosignataires;
  } else if (auteurs.length <= 5) {
    mainAuthors = auteurs;
    coAuthors = [];
  } else {
    mainAuthors = auteurs.slice(0, 1);
    coAuthors = auteurs.slice(1);
  }

  const hasRapporteurs = rapporteurs.length > 0;
  const hasCoAuthors = coAuthors.length > 0;
  const totalCount = authors.length;
  const titleLabel = hasRapporteurs ? "Acteurs du dossier" : "Auteurs de la proposition";

  return (
    <Card className="mb-8 border-l-4 border-l-primary">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          {titleLabel} ({totalCount})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Main author(s) - featured */}
        {mainAuthors.length > 0 && (
          <div>
            {(hasCoAuthors || hasRapporteurs) && mainAuthors.length <= 3 && (
              <h4 className="text-sm font-semibold text-muted-foreground mb-3">
                {mainAuthors.length === 1 ? "Auteur principal" : "Auteurs principaux"}
              </h4>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {mainAuthors.map((a) => (
                <FeaturedAuthor key={a.politician.slug} author={a} />
              ))}
            </div>
          </div>
        )}

        {/* Co-authors: group pills + collapsible full list */}
        {hasCoAuthors && (
          <CoAuthorsCollapsible
            coAuthors={coAuthors}
            label={`${coAuthors.length} cosignataire${coAuthors.length > 1 ? "s" : ""}`}
          />
        )}

        {/* Rapporteurs */}
        {hasRapporteurs && (
          <div>
            <h4 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
              <BookOpen className="h-3.5 w-3.5" />
              Rapporteurs ({rapporteurs.length})
            </h4>
            <div className="flex flex-wrap gap-6">
              {rapporteurs.map((a) => (
                <RapporteurEntry
                  key={`${a.politician.slug}-${a.role ?? "rapporteur"}`}
                  author={a}
                />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
