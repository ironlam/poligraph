import type { Prisma } from "@/generated/prisma";
import { db } from "@/lib/db";
import { lockMeasureCandidacy } from "@/lib/measures/lock";
import { computeThemeCorpusFingerprint } from "./candidacy-theme-synthesis";
import { loadCandidacyThemeSynthesisCorpus } from "./candidacy-theme-synthesis-corpus";

type ReviewActor = {
  id: string;
  ipAddress: string;
  userAgent: string;
};

export type PublishThemeSynthesisResult =
  | { ok: true; electionId: string }
  | {
      ok: false;
      reason: "NOT_FOUND" | "NOT_REVIEWABLE" | "OBSOLETE";
      message: string;
    };

/**
 * Human publication gate for a generated thematic synthesis.
 *
 * The candidacy lock serializes this check with measure transitions. The stored fingerprint, the
 * fingerprint the moderator previewed and the current published corpus must all agree in the same
 * transaction. A newly published revision therefore makes the operation fail instead of exposing
 * stale prose.
 */
export async function publishCandidacyThemeSynthesis(input: {
  candidacyId: string;
  synthesisId: string;
  expectedCorpusFingerprint: string;
  actor: ReviewActor;
}): Promise<PublishThemeSynthesisResult> {
  return db.$transaction(async (extendedTx) => {
    const tx = extendedTx as unknown as Prisma.TransactionClient;
    // Regeneration takes the same lock. Taking it before any synthesis read binds the publication
    // to the exact draft that exists after every earlier writer has completed.
    await lockMeasureCandidacy(extendedTx, input.candidacyId);
    const synthesis = await tx.candidacyThemeSynthesis.findUnique({
      where: { id: input.synthesisId },
      select: {
        id: true,
        theme: true,
        status: true,
        corpusFingerprint: true,
        candidacyPresidential: { select: { candidacyId: true } },
      },
    });
    if (!synthesis) {
      return { ok: false, reason: "NOT_FOUND", message: "Synthèse introuvable." };
    }
    const candidacyId = synthesis.candidacyPresidential.candidacyId;
    if (candidacyId !== input.candidacyId) {
      return { ok: false, reason: "NOT_FOUND", message: "Synthèse introuvable." };
    }
    if (synthesis.status !== "PENDING_REVIEW") {
      return {
        ok: false,
        reason: "NOT_REVIEWABLE",
        message: "Cette synthèse n'est pas en attente de relecture.",
      };
    }
    const loaded = await loadCandidacyThemeSynthesisCorpus(tx, candidacyId, synthesis.theme);
    if (!loaded.ok) {
      return {
        ok: false,
        reason: "OBSOLETE",
        message: "Le corpus de ce thème n'est plus publiable. Régénérez la synthèse.",
      };
    }
    const currentFingerprint = computeThemeCorpusFingerprint(loaded.corpus.input);
    if (
      currentFingerprint !== synthesis.corpusFingerprint ||
      currentFingerprint !== input.expectedCorpusFingerprint
    ) {
      return {
        ok: false,
        reason: "OBSOLETE",
        message: "Les mesures publiées ont changé. Régénérez la synthèse avant validation.",
      };
    }

    const now = new Date();
    await tx.candidacyThemeSynthesis.update({
      where: { id: synthesis.id },
      data: {
        status: "PUBLISHED",
        validatedAt: now,
        validatedBy: input.actor.id,
        publishedAt: now,
      },
    });
    await tx.auditLog.create({
      data: {
        action: "PUBLISH_THEME_SYNTHESIS",
        entityType: "CandidacyThemeSynthesis",
        entityId: synthesis.id,
        changes: {
          candidacyId,
          theme: synthesis.theme,
          corpusFingerprint: currentFingerprint,
        },
        userId: input.actor.id,
        ipAddress: input.actor.ipAddress,
        userAgent: input.actor.userAgent,
      },
    });
    return { ok: true, electionId: loaded.corpus.electionId };
  });
}
