"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import type { CandidacyStatus, PublicationStatus } from "@/generated/prisma";
import { isAuthenticated } from "@/lib/auth";
import { invalidateEntity } from "@/lib/cache";
import { db } from "@/lib/db";
import { invalidatePresidentialCandidacyTags } from "@/lib/presidentielle/candidacy-cache";
import { syncPresidentialSearchDocumentsForCandidacy } from "@/lib/presidentielle/search-sync";
import { lockMeasureCandidacy } from "@/lib/measures/lock";
import { generateCandidateSynthesis } from "@/services/candidate-synthesis";

/**
 * The publication switches of a presidential candidacy.
 *
 * Two rows decide what the public sees of a candidate, and until now neither had a control in the
 * admin. `CandidacyPresidential.publicationStatus` was reachable only by hand-crafting a PATCH on
 * `/api/admin/candidats/[id]`, and `ProgramEdition.publicationStatus` had no writer at all in the
 * application: the import pipeline creates editions at their `DRAFT` default and nothing ever
 * flipped them. The result was measures fully reviewed, published, primary-sourced, and invisible,
 * with the candidate fiche stating that no programme had been identified.
 *
 * A server action is a network endpoint, not a form detail: the page guard does not protect it, so
 * each action re-checks the session as its first statement, and validates its own input.
 */

/** Business errors are returned so the moderator reads the reason on screen; auth failures throw. */
export type CandidacyActionResult =
  | { ok: true; text?: string; reviewWarning?: string }
  | { ok: false; message: string };

const publicationStatusSchema = z.enum(["DRAFT", "PUBLISHED", "ARCHIVED", "EXCLUDED", "REJECTED"]);

const candidacyPublicationSchema = z
  .object({ candidacyId: z.string().min(1), status: publicationStatusSchema })
  .strict();

const candidacyStatusSchema = z
  .object({
    candidacyId: z.string().min(1),
    status: z.enum(["DECLARE", "PRESSENTI", "ENVISAGE", "RETIRE"]),
    sourceUrl: z.string().refine((value) => {
      if (!URL.canParse(value)) return false;
      return ["http:", "https:"].includes(new URL(value).protocol);
    }),
    sourceLabel: z.string().trim().min(1),
  })
  .strict();

const programEditionPublicationSchema = z
  .object({ programEditionId: z.string().min(1), status: publicationStatusSchema })
  .strict();

const synthesisSchema = z.object({ candidacyId: z.string().min(1) }).strict();

async function assertAuthenticated(): Promise<void> {
  if (!(await isAuthenticated())) throw new Error("Non autorisé");
}

function revalidate(): void {
  revalidatePath("/admin/candidats");
}

/** Updates the sourced political status carried by the core candidacy row. */
export async function setCandidacyStatusAction(input: {
  candidacyId: string;
  status: CandidacyStatus;
  sourceUrl: string;
  sourceLabel: string;
}): Promise<CandidacyActionResult> {
  await assertAuthenticated();

  const parsed = candidacyStatusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Requête invalide." };
  const { candidacyId, status, sourceUrl, sourceLabel } = parsed.data;
  const requestHeaders = await headers();
  const forwarded = requestHeaders.get("x-forwarded-for");
  const ipAddress =
    forwarded?.split(",")[0]?.trim() || requestHeaders.get("x-real-ip") || "unknown";
  const userAgent = requestHeaders.get("user-agent") || "unknown";

  const outcome = await db.$transaction(async (tx) => {
    await lockMeasureCandidacy(tx, candidacyId);
    const candidacy = await tx.candidacy.findUnique({
      where: { id: candidacyId },
      select: {
        id: true,
        electionId: true,
        status: true,
        sourceUrl: true,
        sourceLabel: true,
        presidentialData: { select: { synthesis: true } },
      },
    });
    if (!candidacy) return { ok: false as const, message: "Candidature introuvable." };
    const mustClearSynthesis =
      status !== "DECLARE" && candidacy.presidentialData?.synthesis != null;
    if (
      candidacy.status === status &&
      candidacy.sourceUrl === sourceUrl &&
      candidacy.sourceLabel === sourceLabel &&
      !mustClearSynthesis
    ) {
      return { ok: true as const, electionId: candidacy.electionId };
    }

    await tx.candidacy.update({
      where: { id: candidacyId },
      data: { status, sourceUrl, sourceLabel },
    });
    if (mustClearSynthesis) {
      await tx.candidacyPresidential.updateMany({
        where: { candidacyId },
        data: { synthesis: null, synthesisGeneratedAt: null },
      });
    }
    await tx.auditLog.create({
      data: {
        action: "UPDATE",
        entityType: "Candidacy",
        entityId: candidacyId,
        changes: {
          status,
          sourceUrl,
          sourceLabel,
          previousStatus: candidacy.status,
          previousSourceUrl: candidacy.sourceUrl,
          previousSourceLabel: candidacy.sourceLabel,
          synthesisCleared: mustClearSynthesis,
        },
        ipAddress,
        userAgent,
      },
    });
    await syncPresidentialSearchDocumentsForCandidacy(tx, candidacyId);
    return { ok: true as const, electionId: candidacy.electionId };
  });

  if (!outcome.ok) return outcome;
  invalidateEntity("election");
  invalidatePresidentialCandidacyTags(outcome.electionId);
  revalidate();
  return { ok: true };
}

/**
 * Publishes, or withdraws, the editorial extension that gates every public presidential surface.
 *
 * The extension is UPSERTED and not updated: twelve candidacies carry no `CandidacyPresidential`
 * row at all, and without a create path a moderator facing "métadonnées absentes" has nowhere to
 * go. Creating it here writes nothing else than the status, so the row stays what it is, an
 * editorial extension, and the candidacy keeps its own columns.
 *
 * Publishing requires the candidacy to be sourced. That is not a duplicate of the fiche's own
 * check: `loadPoliticianPresidentialCandidacy` drops a candidacy whose status, source URL or source
 * label is null, so publishing an unsourced one would open the hub surfaces on a candidate whose
 * fiche redirects away. The state would be inconsistent rather than merely incomplete.
 */
export async function setCandidacyPublicationAction(input: {
  candidacyId: string;
  status: PublicationStatus;
}): Promise<CandidacyActionResult> {
  await assertAuthenticated();

  const parsed = candidacyPublicationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Requête invalide." };
  }
  const { candidacyId, status } = parsed.data;

  const outcome = await db.$transaction(async (tx) => {
    await lockMeasureCandidacy(tx, candidacyId);
    const candidacy = await tx.candidacy.findUnique({
      where: { id: candidacyId },
      select: {
        id: true,
        electionId: true,
        status: true,
        sourceUrl: true,
        sourceLabel: true,
        presidentialData: { select: { id: true, publicationStatus: true } },
      },
    });
    if (!candidacy) {
      return { ok: false as const, message: "Candidature introuvable." };
    }
    if (
      status === "PUBLISHED" &&
      (!candidacy.status || !candidacy.sourceUrl || !candidacy.sourceLabel)
    ) {
      return {
        ok: false as const,
        message:
          "La candidature doit porter un statut et une source (URL et libellé) avant publication. " +
          "Sans eux, la fiche publique renvoie vers le profil et les mesures restent invisibles.",
      };
    }

    const extension = await tx.candidacyPresidential.upsert({
      where: { candidacyId },
      create: { candidacyId, publicationStatus: status },
      update: { publicationStatus: status },
      select: { id: true },
    });

    await tx.auditLog.create({
      data: {
        action: candidacy.presidentialData ? "UPDATE" : "CREATE",
        entityType: "CandidacyPresidential",
        entityId: extension.id,
        changes: {
          candidacyId,
          publicationStatus: status,
          previousPublicationStatus: candidacy.presidentialData?.publicationStatus ?? null,
        },
      },
    });
    await syncPresidentialSearchDocumentsForCandidacy(tx, candidacyId);
    return { ok: true as const, electionId: candidacy.electionId };
  });

  if (!outcome.ok) return outcome;

  invalidateEntity("election");
  // The four hub reads, the candidate fiche and the politician notice all gate on this status and
  // carry this tag alone. `invalidateEntity("election")` purges `elections`, which none of them use.
  invalidatePresidentialCandidacyTags(outcome.electionId);
  revalidate();

  return { ok: true };
}

/**
 * Publishes, or withdraws, a programme edition.
 *
 * The edition's status does not gate a measure: a measure carries its own. What it drives is the
 * sentence the candidate fiche shows below its gate, "programme identifié" against "aucun programme
 * publié à ce jour", and the corpus nature the priorities page reads. Leaving every edition at its
 * `DRAFT` default made the fiche deny a document we had already extracted 26 measures from.
 */
export async function setProgramEditionPublicationAction(input: {
  programEditionId: string;
  status: PublicationStatus;
}): Promise<CandidacyActionResult> {
  await assertAuthenticated();

  const parsed = programEditionPublicationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Requête invalide." };
  }
  const { programEditionId, status } = parsed.data;

  const edition = await db.programEdition.findUnique({
    where: { id: programEditionId },
    select: { id: true, electionId: true, publicationStatus: true },
  });
  if (!edition) {
    return { ok: false, message: "Édition de programme introuvable." };
  }

  await db.programEdition.update({
    where: { id: programEditionId },
    data: { publicationStatus: status },
  });

  await db.auditLog.create({
    data: {
      action: "UPDATE",
      entityType: "ProgramEdition",
      entityId: programEditionId,
      changes: {
        publicationStatus: status,
        previousPublicationStatus: edition.publicationStatus,
      },
    },
  });

  invalidatePresidentialCandidacyTags(edition.electionId);
  revalidate();

  return { ok: true };
}

/**
 * Generates a synthesis proposal for one candidacy, inline, on the moderator's click.
 *
 * Inline and not queued, following `regenerateScrutinPolicyTitle`: one candidacy is one or two
 * provider calls, the moderator is watching the row, and a queue would put a job board between them
 * and a text they want to read now. The batch is the script, which is why there is no "regenerate
 * all" here — twenty candidacies inline is the request that times out.
 *
 * The generation itself, including the rule that only a DECLARED candidacy carries a synthesis,
 * belongs to `@/services/candidate-synthesis`. This action adds what an admin surface owes: the
 * session check, input validation, and a refusal the moderator can read. Cache invalidation only
 * happens later, when the moderator explicitly saves the reviewed proposal.
 */
export async function regenerateCandidateSynthesisAction(input: {
  candidacyId: string;
}): Promise<CandidacyActionResult> {
  await assertAuthenticated();

  const parsed = synthesisSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Requête invalide." };
  }
  const { candidacyId } = parsed.data;

  const candidacy = await db.candidacy.findUnique({
    where: { id: candidacyId },
    select: { electionId: true },
  });
  if (!candidacy) {
    return { ok: false, message: "Candidature introuvable." };
  }

  const result = await generateCandidateSynthesis(candidacyId, {
    persist: false,
    returnRejectedProposal: true,
  });
  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  // Nothing is written here. The moderator receives a proposal, edits it if needed, then saves it
  // through the reviewed-synthesis endpoint. This prevents a provider response from becoming
  // public solely because somebody clicked "Générer".
  return {
    ok: true,
    text: result.text,
    ...(result.reviewWarning ? { reviewWarning: result.reviewWarning } : {}),
  };
}
