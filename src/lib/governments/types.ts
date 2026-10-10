// Types purs de la rubrique « Gouvernements ». Dates au format `YYYY-MM-DD` partout.
// Aucune dépendance à Prisma : la conversion depuis la base se fait dans la couche de lecture.

export type DateEvidence = "ACT" | "DATASET" | "DERIVED";

export type FunctionType = "PREMIER_MINISTRE" | "MINISTRE" | "MINISTRE_DELEGUE" | "SECRETAIRE_ETAT";

export type GovernmentDates = {
  id: string;
  slug: string;
  primeMinisterAppointedAt: string;
  formedAt: string | null;
  resignedAt: string | null;
  resignedEvidence: DateEvidence | null;
  endedAt: string | null;
  compositionVerifiedAt: string | null;
  // Un acte atteste le régime d'affaires courantes (`currentAffairsActId` renseigné).
  currentAffairsAttested: boolean;
  hasDerivedDate: boolean;
};

export type Episode = {
  membershipId: string;
  mandateId: string;
  mandatePublicId: string | null;
  governmentId: string;
  politicianId: string;
  type: FunctionType;
  title: string;
  start: string;
  startEvidence: DateEvidence | null;
  startSourceUrl: string | null;
  end: string | null;
  endEvidence: DateEvidence | null;
  endSourceUrl: string | null;
  endKind: "INDIVIDUAL" | "COLLECTIVE_RESIGNATION" | null;
  lastConfirmedAt: string | null;
  predecessorMembershipId: string | null;
  sameDayOrderEstablished: boolean;
  sameDayOrderSourceUrl: string | null;
  // Fin propre des affaires courantes de cette fonction (décharge, renomination ailleurs).
  currentAffairsEndedAt: string | null;
  // Actes référencés de début et de fin. Un même acte qui clôt une fonction et en ouvre une autre
  // pour la même personne établit l'ordre de ce changement de fonction (§13.1).
  startActId: string | null;
  endActId: string | null;
};

export type Category = "established" | "currentAffairs" | "transition" | "undocumented";

// Entrées et sorties d'UN gouvernement au jour D, indexées par membershipId.
export type SameDayContext = {
  date: string;
  entries: Map<string, Episode>;
  exits: Map<string, Episode>;
};

export type CompositionResult =
  | { status: "out_of_range"; range: { from: string; to: string } }
  | { status: "not_established"; reason: "before_team" | "no_formation_date" | "not_verified" }
  | {
      status: "ok";
      date: string;
      byCategory: Record<Category, Episode[]>;
      establishedPersons: number; // personnes distinctes de established + currentAffairs
      caretaker: boolean; // au moins une fonction en currentAffairs
    };

export type Change = {
  date: string;
  kind: "formation" | "entry" | "exit" | "titleChange" | "resignation" | "transition";
  membershipIds: string[];
  evidence: DateEvidence | null;
  sourceUrl: string | null;
};
