import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { PoliticianAvatar } from "@/components/politicians/PoliticianAvatar";
import { FollowButton } from "@/components/politicians/FollowButton";
import { CopyableId } from "@/components/politicians/CopyableId";
import { PARTY_ROLE_LABELS, feminizePartyRole } from "@/config/labels";
import { ensureContrast } from "@/lib/contrast";
import { formatDate } from "@/lib/utils";
import type { PartyRole } from "@/generated/prisma";
import { PoliticianContactLinks } from "./PoliticianContactLinks";

/**
 * Identity block at the top of a politician page: portrait, name, affiliations, contacts, dates.
 *
 * Lifted out of a 556-line page component. It reads the politician record and the current
 * parliamentary group, and renders; it fetches nothing.
 */

interface PartyRef {
  name: string;
  slug: string | null;
  color: string | null;
  shortName: string | null;
}

interface PoliticianHeaderProps {
  politician: {
    slug: string;
    fullName: string;
    firstName: string;
    lastName: string;
    civility: string | null;
    photoUrl: string | null;
    blobPhotoUrl: string | null;
    birthDate: Date | null;
    birthPlace: string | null;
    deathDate: Date | null;
    publicId: string | null;
    contactEmail: string | null;
    contactTwitter: string | null;
    contactFacebook: string | null;
    contactWebsite: string | null;
    currentParty: PartyRef | null;
    partyHistory: Array<{
      id: string;
      role: PartyRole;
      endDate: Date | null;
      party: { shortName: string | null };
    }>;
  };
  /** The page derives this from the mandate list, so it can be absent as well as null. */
  currentGroup: { name: string; code: string; color: string | null } | null | undefined;
}

export function PoliticianHeader({ politician, currentGroup }: PoliticianHeaderProps) {
  const { currentParty } = politician;

  // Roles still held, minus plain membership, which the party badge already says.
  const activeRoles = politician.partyHistory.filter(
    (entry) => !entry.endDate && entry.role !== "MEMBRE"
  );

  const feminine = politician.civility === "Mme";

  return (
    <div className="flex items-start gap-6 mb-8">
      <PoliticianAvatar
        photoUrl={politician.photoUrl}
        blobPhotoUrl={politician.blobPhotoUrl}
        firstName={politician.firstName}
        lastName={politician.lastName}
        size="lg"
      />
      <div className="min-w-0">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-3xl font-display font-extrabold tracking-tight">
            {politician.fullName}
          </h1>
          <FollowButton slug={politician.slug} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {currentParty && (
            <Link href={currentParty.slug ? `/partis/${currentParty.slug}` : "/partis"}>
              <Badge
                className="text-sm hover:opacity-80 transition-opacity cursor-pointer whitespace-normal text-center"
                style={{
                  backgroundColor: currentParty.color ? `${currentParty.color}20` : undefined,
                  color: currentParty.color
                    ? ensureContrast(currentParty.color, "#ffffff")
                    : undefined,
                }}
              >
                <span className="opacity-70 mr-1">Parti :</span>
                {currentParty.name}
              </Badge>
            </Link>
          )}

          {currentGroup && (
            <Badge
              variant="outline"
              className="text-sm"
              style={{
                borderColor: currentGroup.color || undefined,
                color: currentGroup.color
                  ? ensureContrast(currentGroup.color, "#ffffff")
                  : undefined,
              }}
              title={currentGroup.name}
            >
              Groupe : {currentGroup.name} ({currentGroup.code})
            </Badge>
          )}

          {activeRoles.map((entry) => (
            <Badge key={entry.id} variant="outline" className="text-sm">
              {feminizePartyRole(PARTY_ROLE_LABELS[entry.role], politician.civility)}
              {entry.party.shortName !== currentParty?.shortName && ` · ${entry.party.shortName}`}
            </Badge>
          ))}
        </div>

        <PoliticianContactLinks
          fullName={politician.fullName}
          contactEmail={politician.contactEmail}
          contactTwitter={politician.contactTwitter}
          contactFacebook={politician.contactFacebook}
          contactWebsite={politician.contactWebsite}
        />

        {politician.birthDate && (
          <p className="text-muted-foreground mt-2">
            {feminine ? "Née" : "Né"} le {formatDate(politician.birthDate)}
            {politician.birthPlace && ` à ${politician.birthPlace}`}
            {politician.deathDate && (
              <span className="text-gray-500">
                {" "}
                - Décédé{feminine ? "e" : ""} le {formatDate(politician.deathDate)}
              </span>
            )}
          </p>
        )}

        {politician.publicId && (
          <div className="mt-1">
            <CopyableId value={politician.publicId} />
          </div>
        )}
      </div>
    </div>
  );
}
