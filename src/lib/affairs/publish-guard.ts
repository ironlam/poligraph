import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma";
import type { Involvement } from "@/types";

/**
 * Garde de publication des affaires judiciaires (RGPD article 10,
 * invariant I2) : SEUL point de passage autorisé vers PUBLISHED.
 *
 * Toute écriture de `publicationStatus: "PUBLISHED"` sur Affair en dehors de
 * ce module est interdite (garde-fou CI dans code-quality.yml). La
 * publication écrit le couple `verifiedAt` + `verifiedBy` atomiquement :
 * c'est l'invariant de validation éditoriale humaine. `verifiedAt` seul ne
 * vaut pas validation.
 */

/** Valeur conventionnelle de verifiedBy pour la modération (cf. mémoire projet). */
export const VERIFIED_BY_MODERATION = "Poligraph Moderation";

/**
 * Constante à utiliser partout où un auditLog ou un message doit mentionner
 * le statut publié : le garde-fou CI interdit le littéral
 * `publicationStatus: "PUBLISHED"` en contexte d'écriture hors de ce module.
 */
export const PUBLISHED_STATUS = "PUBLISHED" as const;

/** reviewActions valant confirmation humaine d'un rattachement. */
const CONFIRMING_REVIEW_ACTIONS = ["CONFIRMED", "REASSIGNED", "CREATED_POLITICIAN"] as const;

export type PublishBlockReason =
  | { code: "NO_SOURCE"; message: string }
  | { code: "MISSING_INVOLVEMENT_NOTE"; message: string }
  | {
      code: "UNREVIEWED_MATCHING_DECISION";
      message: string;
      decisionIds: string[];
    };

export class PublishGuardError extends Error {
  readonly affairId: string;
  readonly reasons: PublishBlockReason[];

  constructor(affairId: string, reasons: PublishBlockReason[]) {
    super(`Affaire ${affairId} non publiable : ${reasons.map((r) => r.message).join(" ; ")}`);
    this.name = "PublishGuardError";
    this.affairId = affairId;
    this.reasons = reasons;
  }
}

/**
 * Sous-ensemble structurel du client Prisma utilisé par ce module.
 * Défini manuellement pour être compatible avec db, tx et les mocks de test,
 * sans dépendre des types générés dérivés des extensions de client.
 */
type GuardClient = {
  affair: {
    findUnique: (args: {
      where: Prisma.AffairWhereUniqueInput;
      select: Prisma.AffairSelect;
    }) => Promise<{
      id: string;
      politicianId: string;
      involvement: Involvement;
      involvementNote: string | null;
      sources: { url: string }[];
    } | null>;
    update: (args: {
      where: Prisma.AffairWhereUniqueInput;
      data: Prisma.AffairUpdateInput;
    }) => Promise<unknown>;
  };
  affairPoliticianDecision: {
    findMany: (args: {
      where: Prisma.AffairPoliticianDecisionWhereInput;
      select: unknown;
    }) => Promise<
      {
        id: string;
        reviewedAt: Date | null;
        reviewedBy: string | null;
        reviewAction: string | null;
        chosenPoliticianId: string | null;
      }[]
    >;
  };
};

/**
 * Vérifie qu'une affaire est publiable. Retourne la liste des raisons de
 * blocage (vide = publiable). Règles :
 *
 * 1. Au moins une Source.
 * 2. Aucune décision de matching automatique (SAME ou UNDECIDED) non validée
 *    par un humain. Une décision est validée si et seulement si :
 *    reviewedAt non null, reviewedBy non null, reviewAction confirmant
 *    (CONFIRMED, REASSIGNED, CREATED_POLITICIAN) et chosenPoliticianId égal
 *    au politicien de l'affaire.
 *
 * Les décisions sont cherchées par deux chemins : lien direct `affairId`,
 * et fallback sur les décisions orphelines (affairId null) partageant le
 * politicien et une URL de source de l'affaire (sourceRef). Le fallback
 * couvre l'historique antérieur à la liaison systématique de Phase 1.
 */
export async function checkPublishable(
  affairId: string,
  client: GuardClient = db as unknown as GuardClient
): Promise<PublishBlockReason[]> {
  const affair = await client.affair.findUnique({
    where: { id: affairId },
    select: {
      id: true,
      politicianId: true,
      involvement: true,
      involvementNote: true,
      sources: { select: { url: true } },
    },
  });

  if (!affair) {
    throw new Error(`Affaire introuvable : ${affairId}`);
  }

  const reasons: PublishBlockReason[] = [];

  if (affair.sources.length === 0) {
    reasons.push({
      code: "NO_SOURCE",
      message: "aucune source vérifiable",
    });
  }

  // A non-accused person can no longer be published without stating why they
  // appear in the affair: the sourced nature of the link (I3, I5).
  if (affair.involvement !== "DIRECT" && !affair.involvementNote?.trim()) {
    reasons.push({
      code: "MISSING_INVOLVEMENT_NOTE",
      message: "note d'implication manquante (obligatoire hors « mis en cause »)",
    });
  }

  const sourceUrls = affair.sources.map((s) => s.url).filter((u) => u.length > 0);

  const decisions = await client.affairPoliticianDecision.findMany({
    where: {
      judgment: { in: ["SAME", "UNDECIDED"] },
      OR: [
        { affairId: affair.id },
        ...(sourceUrls.length > 0
          ? [
              {
                affairId: null,
                chosenPoliticianId: affair.politicianId,
                sourceRef: { in: sourceUrls },
              },
            ]
          : []),
      ],
    },
    select: {
      id: true,
      reviewedAt: true,
      reviewedBy: true,
      reviewAction: true,
      chosenPoliticianId: true,
    },
  });

  const blocking = decisions.filter(
    (d) =>
      !(
        d.reviewedAt !== null &&
        d.reviewedBy !== null &&
        d.reviewAction !== null &&
        (CONFIRMING_REVIEW_ACTIONS as readonly string[]).includes(d.reviewAction) &&
        d.chosenPoliticianId === affair.politicianId
      )
  );

  if (blocking.length > 0) {
    reasons.push({
      code: "UNREVIEWED_MATCHING_DECISION",
      message: `${blocking.length} décision(s) de rattachement automatique non validée(s) par un humain`,
      decisionIds: blocking.map((d) => d.id),
    });
  }

  return reasons;
}

/**
 * Publie une affaire après vérification, dans une transaction unique :
 * re-vérifie puis écrit PUBLISHED + verifiedAt + verifiedBy atomiquement.
 * Lève PublishGuardError (avec raisons typées) si l'affaire n'est pas
 * publiable ; dans ce cas, rien n'est écrit.
 */
export async function assertPublishable(
  affairId: string,
  { verifiedBy }: { verifiedBy: string }
): Promise<void> {
  await db.$transaction(async (tx) => {
    const reasons = await checkPublishable(affairId, tx as unknown as GuardClient);
    if (reasons.length > 0) {
      throw new PublishGuardError(affairId, reasons);
    }
    await tx.affair.update({
      where: { id: affairId },
      data: {
        publicationStatus: "PUBLISHED",
        verifiedAt: new Date(),
        verifiedBy,
      },
    });
  });
}
