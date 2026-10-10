// Conversion des lignes Prisma de la rubrique « Gouvernements » vers les types purs.
// Fonctions pures, sans accès à la base : la lecture vit dans `src/lib/data/governments.ts`.

import type { Prisma, PublicationStatus } from "@/generated/prisma";
import type { DateEvidence, Episode, FunctionType, GovernmentDates } from "./types";

// --- Sélections -------------------------------------------------------------

const ACT_SELECT = {
  select: { label: true, url: true, signedAt: true, journalPublishedAt: true },
} as const;

// Champs nécessaires à la visibilité d'une personne et à sa carte.
export const PERSON_SELECT = {
  id: true,
  publicId: true,
  slug: true,
  fullName: true,
  lastName: true,
  civility: true,
  photoUrl: true,
  blobPhotoUrl: true,
  biography: true,
  publicationStatus: true,
  statusOverride: true,
} satisfies Prisma.PoliticianSelect;

export const GOVERNMENT_SELECT = {
  id: true,
  slug: true,
  name: true,
  sequence: true,
  primeMinister: { select: { slug: true, fullName: true, civility: true } },
  primeMinisterAppointedAt: true,
  primeMinisterAppointedEvidence: true,
  formedAt: true,
  formedEvidence: true,
  formedSourceUrl: true,
  resignedAt: true,
  resignedEvidence: true,
  resignedSourceUrl: true,
  endedAt: true,
  endedEvidence: true,
  endedSourceUrl: true,
  completeness: true,
  pendingChanges: true,
  coverageNote: true,
  compositionVerifiedAt: true,
  compositionVerifiedSourceUrl: true,
  compositionCheckedAt: true,
  primeMinisterAppointedAct: ACT_SELECT,
  formedAct: ACT_SELECT,
  resignedAct: ACT_SELECT,
  endedAct: ACT_SELECT,
  currentAffairsAct: ACT_SELECT,
  currentAffairsActId: true,
  updatedAt: true,
  memberships: { select: { mandate: { select: { politician: { select: PERSON_SELECT } } } } },
} satisfies Prisma.GovernmentSelect;

export const EPISODE_SELECT = {
  id: true,
  governmentId: true,
  startEvidence: true,
  startSourceUrl: true,
  endEvidence: true,
  endSourceUrl: true,
  endKind: true,
  predecessorId: true,
  sameDayOrderEstablished: true,
  sameDayOrderSourceUrl: true,
  currentAffairsEndedAt: true,
  startAct: { select: { url: true } },
  endAct: { select: { url: true } },
  currentAffairsEndAct: { select: { url: true } },
  mandate: {
    select: {
      id: true,
      publicId: true,
      type: true,
      title: true,
      startDate: true,
      endDate: true,
      lastConfirmedAt: true,
      politician: { select: PERSON_SELECT },
    },
  },
} satisfies Prisma.MandateGovernmentSelect;

export type GovernmentRow = Prisma.GovernmentGetPayload<{ select: typeof GOVERNMENT_SELECT }>;
export type EpisodeRow = Prisma.MandateGovernmentGetPayload<{ select: typeof EPISODE_SELECT }>;
type PersonRow = Prisma.PoliticianGetPayload<{ select: typeof PERSON_SELECT }>;
type ActRow = { label: string; url: string; signedAt: Date; journalPublishedAt: Date | null };

// --- Types publics ----------------------------------------------------------

export type Gender = "F" | "M" | null;

export type ActRef = {
  label: string;
  url: string;
  signedAt: string;
  journalPublishedAt: string | null;
};

export type PublishedGovernment = GovernmentDates & {
  name: string;
  sequence: number;
  primeMinister: { slug: string; fullName: string; gender: Gender };
  completeness: "COMPLETE" | "PARTIAL";
  pendingChanges: number | null;
  coverageNote: string | null;
  compositionVerifiedSourceUrl: string | null;
  // Date à laquelle la vérification de la composition a été effectuée (§13.3).
  compositionCheckedAt: string | null;
  // URL de l'acte référencé, à défaut l'ancienne URL saisie avec la date.
  referenceSources: { formed: string | null; resigned: string | null; ended: string | null };
  acts: {
    primeMinisterAppointed: ActRef | null;
    formed: ActRef | null;
    resigned: ActRef | null;
    ended: ActRef | null;
    currentAffairs: ActRef | null;
  };
  // Personnes distinctes ayant exercé une fonction, fiches cachées exclues (§5.7).
  participantCount: number;
  updatedAt: string;
};

export type PersonVisibility = "published" | "pending" | "hidden";

export type PersonCard = {
  id: string;
  publicId: string | null;
  slug: string;
  fullName: string;
  lastName: string;
  gender: Gender;
  photoUrl: string | null;
  blobPhotoUrl: string | null;
  visibility: PersonVisibility;
};

// Épisode avec la source de la fin propre des affaires courantes, que `Episode` ne porte pas.
export type GovernmentEpisode = Episode & { currentAffairsEndSourceUrl: string | null };

// --- Conversions ------------------------------------------------------------

/** Jour calendaire `YYYY-MM-DD` d'une date stockée à minuit UTC. */
export function toDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toDayOrNull(date: Date | null): string | null {
  return date ? toDay(date) : null;
}

function genderOf(civility: string | null): Gender {
  return civility === "Mme" ? "F" : civility === "M." ? "M" : null;
}

function toActRef(act: ActRow | null): ActRef | null {
  if (!act) return null;
  return {
    label: act.label,
    url: act.url,
    signedAt: toDay(act.signedAt),
    journalPublishedAt: toDayOrNull(act.journalPublishedAt),
  };
}

/**
 * Visibilité d'une personne dans la rubrique (§5.7).
 * - `published` : fiche publiée.
 * - `pending` : brouillon ou archive sans décision éditoriale, ni photo ni biographie. Entrée
 *   textuelle sans lien.
 * - `hidden` : tout le reste. Exclusion, décision éditoriale, ou fiche avec photo ou biographie
 *   en attente de la règle 3d. Jamais affichée comme entrée de composition.
 */
export function personVisibility(
  p: Pick<
    PersonRow,
    "publicationStatus" | "statusOverride" | "photoUrl" | "blobPhotoUrl" | "biography"
  > & { publicationStatus: PublicationStatus }
): PersonVisibility {
  if (p.publicationStatus === "PUBLISHED") return "published";
  const draftLike = p.publicationStatus === "DRAFT" || p.publicationStatus === "ARCHIVED";
  const hasContent = Boolean(p.photoUrl || p.blobPhotoUrl || p.biography?.trim());
  return draftLike && !p.statusOverride && !hasContent ? "pending" : "hidden";
}

export function toPersonCard(p: PersonRow): PersonCard {
  return {
    id: p.id,
    publicId: p.publicId,
    slug: p.slug,
    fullName: p.fullName,
    lastName: p.lastName,
    gender: genderOf(p.civility),
    photoUrl: p.photoUrl,
    blobPhotoUrl: p.blobPhotoUrl,
    visibility: personVisibility(p),
  };
}

export function toGovernmentDates(row: GovernmentRow): GovernmentDates {
  const evidences: (DateEvidence | null)[] = [
    row.primeMinisterAppointedEvidence,
    row.formedEvidence,
    row.resignedEvidence,
    row.endedEvidence,
  ];
  return {
    id: row.id,
    slug: row.slug,
    primeMinisterAppointedAt: toDay(row.primeMinisterAppointedAt),
    formedAt: toDayOrNull(row.formedAt),
    resignedAt: toDayOrNull(row.resignedAt),
    resignedEvidence: row.resignedEvidence,
    endedAt: toDayOrNull(row.endedAt),
    compositionVerifiedAt: toDayOrNull(row.compositionVerifiedAt),
    currentAffairsAttested: row.currentAffairsActId !== null,
    hasDerivedDate: evidences.includes("DERIVED"),
  };
}

export function toPublishedGovernment(row: GovernmentRow): PublishedGovernment {
  const participants = new Set<string>();
  for (const m of row.memberships) {
    const p = m.mandate.politician;
    if (personVisibility(p) !== "hidden") participants.add(p.id);
  }
  return {
    ...toGovernmentDates(row),
    name: row.name,
    sequence: row.sequence,
    primeMinister: {
      slug: row.primeMinister.slug,
      fullName: row.primeMinister.fullName,
      gender: genderOf(row.primeMinister.civility),
    },
    completeness: row.completeness,
    pendingChanges: row.pendingChanges,
    coverageNote: row.coverageNote,
    compositionVerifiedSourceUrl: row.compositionVerifiedSourceUrl,
    compositionCheckedAt: toDayOrNull(row.compositionCheckedAt),
    referenceSources: {
      formed: row.formedAct?.url ?? row.formedSourceUrl,
      resigned: row.resignedAct?.url ?? row.resignedSourceUrl,
      ended: row.endedAct?.url ?? row.endedSourceUrl,
    },
    acts: {
      primeMinisterAppointed: toActRef(row.primeMinisterAppointedAct),
      formed: toActRef(row.formedAct),
      resigned: toActRef(row.resignedAct),
      ended: toActRef(row.endedAct),
      currentAffairs: toActRef(row.currentAffairsAct),
    },
    participantCount: participants.size,
    updatedAt: row.updatedAt.toISOString(),
  };
}

const FUNCTION_TYPES: ReadonlySet<string> = new Set<FunctionType>([
  "PREMIER_MINISTRE",
  "MINISTRE",
  "MINISTRE_DELEGUE",
  "SECRETAIRE_ETAT",
]);

function isFunctionType(type: string): type is FunctionType {
  return FUNCTION_TYPES.has(type);
}

/** `null` pour une ligne sans gouvernement ou dont le mandat n'est pas une fonction gouvernementale. */
export function toEpisode(row: EpisodeRow): GovernmentEpisode | null {
  const { mandate } = row;
  if (row.governmentId === null || !isFunctionType(mandate.type)) return null;
  return {
    membershipId: row.id,
    mandateId: mandate.id,
    mandatePublicId: mandate.publicId,
    governmentId: row.governmentId,
    politicianId: mandate.politician.id,
    type: mandate.type,
    title: mandate.title,
    start: toDay(mandate.startDate),
    startEvidence: row.startEvidence,
    startSourceUrl: row.startAct?.url ?? row.startSourceUrl,
    end: toDayOrNull(mandate.endDate),
    endEvidence: row.endEvidence,
    endSourceUrl: row.endAct?.url ?? row.endSourceUrl,
    endKind: row.endKind,
    lastConfirmedAt: toDayOrNull(mandate.lastConfirmedAt),
    predecessorMembershipId: row.predecessorId,
    sameDayOrderEstablished: row.sameDayOrderEstablished,
    sameDayOrderSourceUrl: row.sameDayOrderSourceUrl,
    currentAffairsEndedAt: toDayOrNull(row.currentAffairsEndedAt),
    currentAffairsEndSourceUrl: row.currentAffairsEndAct?.url ?? null,
  };
}
