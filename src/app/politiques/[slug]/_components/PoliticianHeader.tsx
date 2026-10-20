import type { CSSProperties } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { PoliticianAvatar } from "@/components/politicians/PoliticianAvatar";
import { FollowButton } from "@/components/politicians/FollowButton";
import { CopyableId } from "@/components/politicians/CopyableId";
import { PARTY_ROLE_LABELS, feminizePartyRole } from "@/config/labels";
import { ensureContrast, ensureContrastOnDark, tintOver } from "@/lib/contrast";

// --background (oklch(0.97 0 0) en clair, oklch(0.16 0 0) en sombre) : le badge de parti est une
// teinte posée sur le fond de page, le texte se calcule donc contre cette teinte dans chaque thème.
const PAGE_BACKGROUND = "#f5f5f5";
const PAGE_BACKGROUND_DARK = "#0d0d0d";
const PARTY_TINT_ALPHA = 0x20 / 255;
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
    <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-6 mb-8">
      <PoliticianAvatar
        photoUrl={politician.photoUrl}
        blobPhotoUrl={politician.blobPhotoUrl}
        firstName={politician.firstName}
        lastName={politician.lastName}
        size="lg"
      />
      <div className="min-w-0 w-full sm:flex-1">
        <div className="flex flex-wrap items-center gap-3 mb-2">
          <h1 className="min-w-0 break-words text-3xl font-display font-extrabold tracking-tight">
            {politician.fullName}
          </h1>
          <FollowButton slug={politician.slug} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {currentParty && (
            <Link
              href={currentParty.slug ? `/partis/${currentParty.slug}` : "/partis"}
              className="min-w-0 max-w-full"
            >
              <Badge
                data-party-badge
                className="block max-w-full text-sm hover:opacity-80 transition-opacity cursor-pointer whitespace-normal break-words"
                style={
                  currentParty.color
                    ? ({
                        backgroundColor: `${currentParty.color}20`,
                        "--party-fg": ensureContrast(
                          currentParty.color,
                          tintOver(currentParty.color, PARTY_TINT_ALPHA, PAGE_BACKGROUND)
                        ),
                        "--party-fg-dark": ensureContrastOnDark(
                          currentParty.color,
                          tintOver(currentParty.color, PARTY_TINT_ALPHA, PAGE_BACKGROUND_DARK)
                        ),
                      } as CSSProperties)
                    : undefined
                }
              >
                <span className="mr-1">Parti :</span>
                {currentParty.name}
              </Badge>
            </Link>
          )}

          {currentGroup && (
            <Badge
              data-party-badge
              variant="outline"
              className="block max-w-full text-sm whitespace-normal break-words"
              style={
                currentGroup.color
                  ? ({
                      borderColor: currentGroup.color,
                      "--party-fg": ensureContrast(currentGroup.color, PAGE_BACKGROUND),
                      "--party-fg-dark": ensureContrastOnDark(
                        currentGroup.color,
                        PAGE_BACKGROUND_DARK
                      ),
                    } as CSSProperties)
                  : undefined
              }
              title={currentGroup.name}
            >
              Groupe : {currentGroup.name} ({currentGroup.code})
            </Badge>
          )}

          {activeRoles.map((entry) => (
            <Badge
              key={entry.id}
              variant="outline"
              className="block max-w-full text-sm whitespace-normal break-words"
            >
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
