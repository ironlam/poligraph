/**
 * User-accord-gated: auto-approve the HIGH, non-fallback DRAFT titles that pass
 * the existing eligibility guard. MEDIUM/LOW/fallback/ambiguous are never forced
 * (autoApproveBatchEligible filters confidence:HIGH + generationSource != FALLBACK
 * and the guard skips anything with blockers). minAgeHours:0 because quality was
 * reviewed on the sample. Prints stats + the approved scrutinIds (for revalidation)
 * + the DRAFT/NEEDS_REVIEW leftovers.
 */
import { autoApproveBatchEligible } from "@/services/scrutin-policy-title/approval";
import { db } from "@/lib/db";

(async () => {
  const startedAt = new Date();
  const stats = await autoApproveBatchEligible({ minAgeHours: 0, limit: 2000 });
  console.log("[approve] stats " + JSON.stringify(stats));

  const approved = await db.scrutin.findMany({
    where: { policyTitle: { is: { status: "APPROVED", updatedAt: { gte: startedAt } } } },
    select: { id: true, slug: true },
  });
  console.log(`[approve] approved this run: ${approved.length}`);
  console.log("[approve] approvedIds=" + JSON.stringify(approved.map((a) => a.id)));

  const leftover = await db.scrutinPolicyTitle.groupBy({
    by: ["status", "confidence"],
    where: { status: { in: ["DRAFT", "NEEDS_REVIEW"] } },
    _count: { _all: true },
  });
  console.log(
    "[approve] remaining DRAFT/NEEDS_REVIEW by status/confidence:",
    JSON.stringify(leftover.map((l) => ({ s: l.status, c: l.confidence, n: l._count._all })))
  );
  await db.$disconnect();
})().catch(async (e) => {
  console.error("[approve] FAILED:", e);
  try {
    await db.$disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
