// Conversion des lignes Prisma de la rubrique « Gouvernements » vers les types purs.
// Fonctions pures, sans accès à la base : la lecture vit dans `src/lib/data/governments.ts`.

import type { DateDetermination, Prisma, PublicationStatus } from "@/generated/prisma";
import { STATUS_RULES } from "@/config/prominence";
import { parisDay } from "./dates";
import type { DateEvidence, Episode, FunctionType, GovernmentDates } from "./types";

// --- Sélections -------------------------------------------------------------

const ACT_SELECT = {
  select: {
    label: true,
    url: true,
    signedAt: true,
    effectiveAt: true,
    journalPublishedAt: true,
    journalNumber: true,
    jorfId: true,
  },
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
  birthDate: true,
  deathDate: true,
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
  primeMinisterAppointedDetermination: true,
  formedAt: true,
  formedEvidence: true,
  formedSourceUrl: true,
  formedDetermination: true,
  resignedAt: true,
  resignedEvidence: true,
  resignedSourceUrl: true,
  resignedDetermination: true,
  endedAt: true,
  endedEvidence: true,
  endedSourceUrl: true,
  endedDetermination: true,
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
  startDetermination: true,
  endDetermination: true,
  currentAffairsEndDetermination: true,
  startActId: true,
  endActId: true,
  startAct: ACT_SELECT,
  endAct: ACT_SELECT,
  currentAffairsEndAct: ACT_SELECT,
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
type ActRow = NonNullable<GovernmentRow["formedAct"]>;

// --- Types publics ----------------------------------------------------------

export type Gender = "F" | "M" | null;

// Acte du registre (§13.2). La date retenue d'un fait est `effectiveAt` s'il est renseigné,
// sinon `signedAt` ; la publication au JO ne sert qu'à l'affichage de la source.
export type ActRef = {
  label: string;
  url: string;
  signedAt: string;
  effectiveAt: string | null;
  journalPublishedAt: string | null;
  journalNumber: string | null;
  jorfId: string | null;
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
  // Mode de détermination de chaque date (§13.1).
  determinations: {
    primeMinisterAppointed: DateDetermination | null;
    formed: DateDetermination | null;
    resigned: DateDetermination | null;
    ended: DateDetermination | null;
  };
  // Personnes distinctes ayant exercé une fonction, fiches cachées exclues (§5.7).
  participantCount: number;
  // Personnes distinctes cachées : au-dessus de 0, le compteur s'affiche « au moins X ».
  hiddenCount: number;
  updatedAt: string;
};

export type PersonVisibility = "published" | "pending" | "hidden";

/**
 * Why a person is a text-only entry: `draft` (profile not yet published) or `ageExcluded`
 * (automatic age exclusion, never published). `null` for published and hidden people.
 */
export type PendingReason = "draft" | "ageExcluded";

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
  pendingReason: PendingReason | null;
  /** « 1903-1985 », « né en 1903 » : text-only entries only, to tell namesakes apart. */
  lifespan: string | null;
};

// Épisode enrichi de ce que l'affichage demande et que les règles pures n'utilisent pas :
// actes référencés, modes de détermination, source de la fin propre des affaires courantes.
export type GovernmentEpisode = Episode & {
  currentAffairsEndSourceUrl: string | null;
  startDetermination: DateDetermination | null;
  endDetermination: DateDetermination | null;
  currentAffairsEndDetermination: DateDetermination | null;
  startAct: ActRef | null;
  endAct: ActRef | null;
  currentAffairsEndAct: ActRef | null;
};

export type ParticipantCounts = { participantCount: number; hiddenCount: number };

// --- Conversions ------------------------------------------------------------

/** Jour calendaire `YYYY-MM-DD` d'une colonne `@db.Date` (revient à 00:00 UTC). */
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
    effectiveAt: toDayOrNull(act.effectiveAt),
    journalPublishedAt: toDayOrNull(act.journalPublishedAt),
    journalNumber: act.journalNumber,
    jorfId: act.jorfId,
  };
}

type VisibilityInput = Pick<
  PersonRow,
  | "publicationStatus"
  | "statusOverride"
  | "photoUrl"
  | "blobPhotoUrl"
  | "biography"
  | "birthDate"
  | "deathDate"
> & { publicationStatus: PublicationStatus };

/**
 * Exclusion par la règle d'âge de `publication-status-rules.ts` (né avant 1920), recalculée ici :
 * `EXCLUDED` ne dit pas pourquoi. Une exclusion par la règle des décès d'avant 1958, ou faite à la
 * main dans l'admin (qui ne pose pas d'override), n'est pas reconnue et reste cachée. Mêmes
 * années que la règle (`getFullYear`).
 */
function isAgeExcluded(p: VisibilityInput): boolean {
  return (
    p.publicationStatus === "EXCLUDED" &&
    !p.statusOverride &&
    p.birthDate !== null &&
    p.birthDate.getFullYear() < STATUS_RULES.excludeBornBeforeYear &&
    !(p.deathDate && p.deathDate.getFullYear() < STATUS_RULES.excludeDeathBeforeYear)
  );
}

function pendingReason(p: VisibilityInput): PendingReason | null {
  if (p.publicationStatus === "PUBLISHED" || p.statusOverride) return null;
  if (isAgeExcluded(p)) return "ageExcluded";
  const draftLike = p.publicationStatus === "DRAFT" || p.publicationStatus === "ARCHIVED";
  const hasContent = Boolean(p.photoUrl || p.blobPhotoUrl || p.biography?.trim());
  return draftLike && !hasContent ? "draft" : null;
}

/**
 * Visibilité d'une personne dans la rubrique (§5.7).
 * - `published` : fiche publiée.
 * - `pending` : entrée textuelle sans lien ni photo. Brouillon ou archive sans décision
 *   éditoriale, ni photo ni biographie ; ou ancien ministre exclu par la seule règle d'âge
 *   (né avant 1920, voir `isAgeExcluded`), qui reste membre de son gouvernement sans fiche.
 * - `hidden` : tout le reste. Toute autre exclusion, décision éditoriale (`statusOverride`, ex.
 *   doublon fusionné), rejet, ou fiche avec photo ou biographie en attente de la règle 3d.
 *   Jamais affichée comme entrée de composition.
 */
export function personVisibility(p: VisibilityInput): PersonVisibility {
  if (p.publicationStatus === "PUBLISHED") return "published";
  return pendingReason(p) ? "pending" : "hidden";
}

function lifespan(p: PersonRow): string | null {
  const birth = p.birthDate ? Number(parisDay(p.birthDate).slice(0, 4)) : undefined;
  const death = p.deathDate ? Number(parisDay(p.deathDate).slice(0, 4)) : undefined;
  if (birth && death) return `${birth}-${death}`;
  if (birth) {
    const gender = genderOf(p.civility);
    return `${gender === "F" ? "née" : gender === "M" ? "né" : "naissance"} en ${birth}`;
  }
  return death ? `mort en ${death}` : null;
}

/** Photo seulement pour une fiche publiée : une entrée en attente reste textuelle. */
export function toPersonCard(p: PersonRow): PersonCard {
  const visibility = personVisibility(p);
  const published = visibility === "published";
  return {
    id: p.id,
    publicId: p.publicId,
    slug: p.slug,
    fullName: p.fullName,
    lastName: p.lastName,
    gender: genderOf(p.civility),
    photoUrl: published ? p.photoUrl : null,
    blobPhotoUrl: published ? p.blobPhotoUrl : null,
    visibility,
    pendingReason: visibility === "pending" ? pendingReason(p) : null,
    lifespan: visibility === "pending" ? lifespan(p) : null,
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

/**
 * Personnes distinctes par gouvernement, calculées sur les fonctions déjà lues : visibles
 * (publiées ou en attente) d'un côté, cachées de l'autre.
 */
export function countParticipants(data: {
  episodes: Episode[];
  people: Record<string, PersonCard>;
}): Map<string, ParticipantCounts> {
  const sets = new Map<string, { visible: Set<string>; hidden: Set<string> }>();
  for (const ep of data.episodes) {
    let entry = sets.get(ep.governmentId);
    if (!entry) {
      entry = { visible: new Set(), hidden: new Set() };
      sets.set(ep.governmentId, entry);
    }
    const hidden = (data.people[ep.politicianId]?.visibility ?? "hidden") === "hidden";
    (hidden ? entry.hidden : entry.visible).add(ep.politicianId);
  }
  return new Map(
    [...sets].map(([id, e]) => [
      id,
      { participantCount: e.visible.size, hiddenCount: e.hidden.size },
    ])
  );
}

export function toPublishedGovernment(
  row: GovernmentRow,
  counts: ParticipantCounts = { participantCount: 0, hiddenCount: 0 }
): PublishedGovernment {
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
    determinations: {
      primeMinisterAppointed: row.primeMinisterAppointedDetermination,
      formed: row.formedDetermination,
      resigned: row.resignedDetermination,
      ended: row.endedDetermination,
    },
    participantCount: counts.participantCount,
    hiddenCount: counts.hiddenCount,
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
    // Horodatages Mandate : jour à Paris (voir dates.ts).
    start: parisDay(mandate.startDate),
    startEvidence: row.startEvidence,
    startSourceUrl: row.startAct?.url ?? row.startSourceUrl,
    end: mandate.endDate ? parisDay(mandate.endDate) : null,
    endEvidence: row.endEvidence,
    endSourceUrl: row.endAct?.url ?? row.endSourceUrl,
    endKind: row.endKind,
    lastConfirmedAt: mandate.lastConfirmedAt ? parisDay(mandate.lastConfirmedAt) : null,
    predecessorMembershipId: row.predecessorId,
    sameDayOrderEstablished: row.sameDayOrderEstablished,
    sameDayOrderSourceUrl: row.sameDayOrderSourceUrl,
    currentAffairsEndedAt: toDayOrNull(row.currentAffairsEndedAt),
    startActId: row.startActId,
    endActId: row.endActId,
    currentAffairsEndSourceUrl: row.currentAffairsEndAct?.url ?? null,
    startDetermination: row.startDetermination,
    endDetermination: row.endDetermination,
    currentAffairsEndDetermination: row.currentAffairsEndDetermination,
    startAct: toActRef(row.startAct),
    endAct: toActRef(row.endAct),
    currentAffairsEndAct: toActRef(row.currentAffairsEndAct),
  };
}
