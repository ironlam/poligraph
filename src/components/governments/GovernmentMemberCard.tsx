import type { ReactNode } from "react";
import { PoliticianAvatar } from "@/components/politicians/PoliticianAvatar";
import type { PersonCard } from "@/lib/governments/mapping";
import { RememberReturn } from "./RememberReturn";

export const PENDING_PROFILE_NOTE =
  "Identité et fonction vérifiées ; profil public en cours de constitution.";

export type MemberCardFunction = {
  key: string;
  title: ReactNode;
  detail: ReactNode;
  badge?: ReactNode;
};

/**
 * One person in a composition or a member list. A published profile is a real link that
 * remembers the page of origin; a pending one is plain text with its note. Hidden people never
 * reach this component (filtered by the caller).
 */
export function GovernmentMemberCard({
  person,
  functions,
  returnUrl,
  returnLabel,
  nameClassName = "font-display text-base font-bold",
  aside,
}: {
  person: PersonCard;
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
            <span>{person.fullName}</span>
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
          <p className="mt-2 text-[13px] text-muted-foreground">{PENDING_PROFILE_NOTE}</p>
        )}
      </div>
    </article>
  );
}
