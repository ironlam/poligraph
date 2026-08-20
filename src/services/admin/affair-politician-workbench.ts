import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma";
import { db } from "@/lib/db";
import { invalidateAffectedPoliticians, invalidateEntity } from "@/lib/cache";
import { generateAffairSlug } from "@/lib/utils";

export class AffairReassignmentConflictError extends Error {
  constructor(message = "L’affaire a changé. Rechargez l’aperçu avant de confirmer.") {
    super(message);
    this.name = "AffairReassignmentConflictError";
  }
}

export type AffairReassignmentSnapshot = {
  affairId: string;
  politicianId: string;
  slug: string;
  publicationStatus: string;
  updatedAt: string;
  stateToken: string;
};

const affairPreviewSelect = {
  id: true,
  title: true,
  slug: true,
  oldSlugs: true,
  publicationStatus: true,
  status: true,
  involvement: true,
  involvementNote: true,
  subjectLabel: true,
  subjectKind: true,
  partyAtTimeId: true,
  partyAtTime: { select: { shortName: true, name: true } },
  politicianId: true,
  updatedAt: true,
  sources: { select: { id: true, url: true, title: true, publisher: true } },
  pressArticles: { select: { id: true, articleId: true, role: true } },
  courtDecisions: { select: { courtDecisionId: true } },
  affairPoliticianDecisions: {
    select: { id: true, chosenPoliticianId: true, judgment: true, reviewedAt: true },
    orderBy: { createdAt: "desc" as const },
    take: 10,
  },
  politician: {
    select: {
      id: true,
      fullName: true,
      slug: true,
      currentParty: { select: { shortName: true, name: true } },
    },
  },
} satisfies Prisma.AffairSelect;

function stateToken(
  input: Pick<
    AffairReassignmentSnapshot,
    "affairId" | "politicianId" | "slug" | "publicationStatus" | "updatedAt"
  >
) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function makeSnapshot(affair: {
  id: string;
  politicianId: string;
  slug: string;
  publicationStatus: string;
  updatedAt: Date;
}): AffairReassignmentSnapshot {
  const base = {
    affairId: affair.id,
    politicianId: affair.politicianId,
    slug: affair.slug,
    publicationStatus: affair.publicationStatus,
    updatedAt: affair.updatedAt.toISOString(),
  };
  return { ...base, stateToken: stateToken(base) };
}

async function uniqueSlug(
  findAffair: (slug: string) => Promise<{ id: string } | null>,
  politicianSlug: string,
  title: string,
  affairId: string,
  currentSlug: string
) {
  const baseSlug = generateAffairSlug(politicianSlug, title);
  let candidate = baseSlug;
  let counter = 1;
  while (candidate !== currentSlug) {
    const existing = await findAffair(candidate);
    if (!existing || existing.id === affairId) return candidate;
    candidate = `${baseSlug}-${counter++}`;
  }
  return candidate;
}

export async function previewAffairPoliticianReassignment(affairId: string, politicianId: string) {
  const [affair, proposedPolitician] = await Promise.all([
    db.affair.findUnique({ where: { id: affairId }, select: affairPreviewSelect }),
    db.politician.findUnique({
      where: { id: politicianId },
      select: {
        id: true,
        fullName: true,
        slug: true,
        publicationStatus: true,
        currentParty: { select: { shortName: true, name: true } },
      },
    }),
  ]);
  if (!affair) throw new Error("AFFAIR_NOT_FOUND");
  if (!proposedPolitician) throw new Error("POLITICIAN_NOT_FOUND");
  if (affair.politicianId === proposedPolitician.id) throw new Error("SAME_POLITICIAN");

  const proposedSlug = await uniqueSlug(
    (slug) => db.affair.findUnique({ where: { slug }, select: { id: true } }),
    proposedPolitician.slug,
    affair.title,
    affair.id,
    affair.slug
  );
  const published = affair.publicationStatus === "PUBLISHED";
  return {
    affair,
    proposedPolitician,
    snapshot: makeSnapshot(affair),
    impact: {
      oldSlug: affair.slug,
      newSlug: proposedSlug,
      oldSlugs: affair.oldSlugs.includes(affair.slug)
        ? affair.oldSlugs
        : [...affair.oldSlugs, affair.slug],
      publicationStatus: published ? "DRAFT" : affair.publicationStatus,
      verifiedAt: published ? null : "inchangé",
      verifiedBy: published ? null : "inchangé",
      unchanged: [
        "sources",
        "articles liés",
        "décisions judiciaires",
        "implication et note d’implication",
        "parti au moment des faits",
        "décisions historiques du resolver",
      ],
      warnings: published
        ? [
            "Cette réattribution dépubliera temporairement l’affaire.",
            "Elle devra être relue puis republiée avec les contrôles habituels.",
          ]
        : ["Les champs éditoriaux et les relations existantes restent inchangés."],
    },
  };
}

export async function getAffairReassignmentContext(affairId: string) {
  const affair = await db.affair.findUnique({
    where: { id: affairId },
    select: affairPreviewSelect,
  });
  if (!affair) return null;
  return { affair, snapshot: makeSnapshot(affair) };
}

export async function reassignAffairPolitician(input: {
  affairId: string;
  politicianId: string;
  justification: string;
  confirmation: string;
  expected: AffairReassignmentSnapshot;
}) {
  let result: {
    affair: { id: string; slug: string; publicationStatus: string; updatedAt: Date };
    oldPoliticianSlug: string;
    newPoliticianSlug: string;
  };
  try {
    result = await db.$transaction(async (tx) => {
      const current = await tx.affair.findUnique({
        where: { id: input.affairId },
        select: {
          id: true,
          title: true,
          slug: true,
          oldSlugs: true,
          politicianId: true,
          publicationStatus: true,
          verifiedAt: true,
          verifiedBy: true,
          updatedAt: true,
          politician: { select: { id: true, fullName: true, slug: true } },
        },
      });
      if (!current) throw new Error("AFFAIR_NOT_FOUND");
      const actual = makeSnapshot(current);
      if (actual.stateToken !== input.expected.stateToken)
        throw new AffairReassignmentConflictError();
      if (current.politicianId === input.politicianId) throw new Error("SAME_POLITICIAN");
      const minimumJustification = current.publicationStatus === "PUBLISHED" ? 30 : 20;
      if (input.justification.trim().length < minimumJustification) {
        throw new Error("JUSTIFICATION_TOO_SHORT");
      }
      if (current.publicationStatus === "PUBLISHED" && input.confirmation !== current.title) {
        throw new Error("CONFIRMATION_REQUIRED");
      }
      const proposed = await tx.politician.findUnique({
        where: { id: input.politicianId },
        select: { id: true, fullName: true, slug: true },
      });
      if (!proposed) throw new Error("POLITICIAN_NOT_FOUND");
      const newSlug = await uniqueSlug(
        (slug) => tx.affair.findUnique({ where: { slug }, select: { id: true } }),
        proposed.slug,
        current.title,
        current.id,
        current.slug
      );
      const oldSlugs = current.oldSlugs.includes(current.slug)
        ? current.oldSlugs
        : [...current.oldSlugs, current.slug];
      const updated =
        current.publicationStatus === "PUBLISHED"
          ? await tx.affair.updateMany({
              where: { id: current.id, updatedAt: current.updatedAt },
              data: {
                politicianId: proposed.id,
                slug: newSlug,
                oldSlugs,
                publicationStatus: "DRAFT",
                verifiedAt: null,
                verifiedBy: null,
              },
            })
          : await tx.affair.updateMany({
              where: { id: current.id, updatedAt: current.updatedAt },
              data: { politicianId: proposed.id, slug: newSlug, oldSlugs },
            });
      if (updated.count !== 1) throw new AffairReassignmentConflictError();
      const affair = await tx.affair.findUnique({
        where: { id: current.id },
        select: { id: true, slug: true, publicationStatus: true, updatedAt: true },
      });
      if (!affair) throw new Error("AFFAIR_NOT_FOUND");
      await tx.auditLog.create({
        data: {
          action: "AFFAIR_POLITICIAN_REASSIGNED",
          entityType: "Affair",
          entityId: current.id,
          changes: {
            operation: "AFFAIR_POLITICIAN_REASSIGNMENT",
            justification: input.justification,
            oldPoliticianId: current.politicianId,
            newPoliticianId: proposed.id,
            oldPoliticianName: current.politician.fullName,
            newPoliticianName: proposed.fullName,
            oldSlug: current.slug,
            newSlug,
            oldPublicationStatus: current.publicationStatus,
            newPublicationStatus:
              current.publicationStatus === "PUBLISHED" ? "DRAFT" : current.publicationStatus,
            expectedState: input.expected,
            origin: "admin-relationship-workbench",
            timestamp: new Date().toISOString(),
          },
        },
      });
      return {
        affair,
        oldPoliticianSlug: current.politician.slug,
        newPoliticianSlug: proposed.slug,
      };
    });
  } catch (error) {
    if (error instanceof AffairReassignmentConflictError) throw error;
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      throw new AffairReassignmentConflictError(
        "Le nouveau slug est déjà utilisé. Rechargez l’aperçu."
      );
    }
    throw error;
  }

  invalidateEntity("affair", result.affair.slug);
  invalidateAffectedPoliticians([result.oldPoliticianSlug, result.newPoliticianSlug]);
  return result;
}
