import type { ReactNode } from "react";
import { PoliticianAvatar } from "@/components/politicians/PoliticianAvatar";
import type { PersonCard } from "@/lib/governments/mapping";
import { RememberReturn } from "./RememberReturn";

export const PENDING_PROFILE_NOTE =
  "Identité et fonction vérifiées ; profil public en cours de constitution.";
/** Draft whose functions all start on a non-act date: nothing to call verified. */
export const DRAFT_PROFILE_NOTE = "Profil public en cours de constitution.";
/** Former minister excluded by the age rule: no profile, and none planned. */
export const NO_PROFILE_NOTE = "Pas de fiche détaillée sur Poligraph.";

export function pendingNote(person: PersonCard, startVerified: boolean): string {
  if (person.pendingReason === "ageExcluded") return NO_PROFILE_NOTE;
  return startVerified ? PENDING_PROFILE_NOTE : DRAFT_PROFILE_NOTE;
}

/** « (1903-1985) » after a text-only name, to tell namesakes apart. */
export function Lifespan({ person }: { person: PersonCard }) {
  if (person.visibility !== "pending" || !person.lifespan) return null;
  return (
    <span className="text-[13px] font-normal text-muted-foreground"> ({person.lifespan})</span>
  );
}

export type MemberCardFunction = {
  key: string;
  title: ReactNode;
  detail: ReactNode;
  badge?: ReactNode;
};

/**
 * One person in a composition or a member list. A published profile is a real link that
 * remembers the page of origin; a pending one is plain text with its note. Hidden people never
 * reach this component (filtered by the caller). `startVerified`: at least one of the listed
 * functions starts on an act, the only case where the note may say « fonction vérifiée ».
 */
export function GovernmentMemberCard({
  person,
  functions,
  returnUrl,
  returnLabel,
  nameClassName = "font-display text-base font-bold",
  aside,
  startVerified,
}: {
  person: PersonCard;
  startVerified: boolean;
  functions: MemberCardFunction[];
  returnUrl: string;
  returnLabel: string;
  nameClassName?: string;
  aside?: ReactNode;
}) {
  return (
    <article className="flex gap-3 rounded-2xl border bg-card p-4">
      <PoliticianAvatar
        photoUrl={person.photoUrl}
        blobPhotoUrl={person.blobPhotoUrl}
        fullName={person.fullName}
        size="sm"
        className="mt-0.5 shrink-0"
      />
      <div className="min-w-0 flex-1">
        <p className={nameClassName}>
          {person.visibility === "published" ? (
            <RememberReturn
              targetSlug={person.slug}
              returnUrl={returnUrl}
              label={returnLabel}
              className="text-primary underline-offset-4 hover:underline"
            >
              {person.fullName}
            </RememberReturn>
          ) : (
            <>
              <span>{person.fullName}</span>
              <Lifespan person={person} />
            </>
          )}
        </p>
        {aside}
        <ul className="mt-1 space-y-2">
          {functions.map((fn) => (
            <li key={fn.key} className="text-sm">
              <p>{fn.title}</p>
              <p className="text-[13px] text-muted-foreground">{fn.detail}</p>
              {fn.badge && <div className="mt-1">{fn.badge}</div>}
            </li>
          ))}
        </ul>
        {person.visibility === "pending" && (
          <p className="mt-2 text-[13px] text-muted-foreground">
            {pendingNote(person, startVerified)}
          </p>
        )}
      </div>
    </article>
  );
}
