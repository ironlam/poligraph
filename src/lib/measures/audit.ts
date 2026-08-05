import { db } from "@/lib/db";

export type AuditViolation = {
  rule: string;
  measureId: string | null;
  detail: string;
};

/**
 * The invariants Prisma cannot express, checked in the database.
 *
 * Nineteen rules. Two rules of an earlier draft are deliberately absent: "orphan
 * qualification" and "orphan assessment" queried `revision: { is: null }` on a required
 * relation with cascade delete. The orphan is structurally impossible and the query is
 * meaningless.
 *
 * Partial unique indexes would give some of these guarantees, but Prisma cannot declare
 * them and `db:push` would erase them, hence a command.
 *
 * No side effect: this function reports, it never repairs. A repair would have to decide
 * which of two published revisions is the real one, and that decision belongs to a human.
 */
export async function auditMeasures(): Promise<AuditViolation[]> {
  const violations: AuditViolation[] = [];

  const measures = await db.measure.findMany({
    select: {
      id: true,
      electionId: true,
      politicianId: true,
      candidacyId: true,
      programEditionId: true,
      publicationStatus: true,
      latestRevisionId: true,
      publishedRevisionId: true,
      withdrawnAt: true,
      withdrawnSourceUrl: true,
      withdrawnSourceLabel: true,
      candidacy: { select: { politicianId: true } },
      programEdition: { select: { electionId: true } },
      publishedRevision: {
        select: {
          id: true,
          measureId: true,
          reviewedAt: true,
          publishedAt: true,
          supersededAt: true,
          _count: { select: { sources: true } },
        },
      },
      latestRevision: { select: { id: true, measureId: true, discardedAt: true } },
      revisions: {
        select: { id: true, publishedAt: true, supersededAt: true, discardedAt: true },
      },
    },
  });

  const documents = await db.searchDocument.findMany({
    where: { entityType: "MEASURE" },
    select: { entityId: true, visibility: true, sourceRevisionId: true },
  });
  const byEntity = new Map(documents.map((d) => [d.entityId, d]));

  for (const m of measures) {
    const published = m.publishedRevision;

    if (published && published.measureId !== m.id) {
      violations.push({
        rule: "published_revision_foreign",
        measureId: m.id,
        detail: published.id,
      });
    }
    if (published && !published.reviewedAt) {
      violations.push({
        rule: "published_revision_unreviewed",
        measureId: m.id,
        detail: published.id,
      });
    }
    // Distinct from the unreviewed case: a revision can be reviewed and pointed at without
    // ever having been published, and "the text in force at date D" would then select
    // something the site never displayed.
    if (published && !published.publishedAt) {
      violations.push({
        rule: "published_revision_unpublished",
        measureId: m.id,
        detail: published.id,
      });
    }
    if (published && published.supersededAt) {
      violations.push({
        rule: "published_revision_superseded",
        measureId: m.id,
        detail: published.id,
      });
    }
    if (published && published._count.sources === 0) {
      violations.push({
        rule: "published_revision_without_source",
        measureId: m.id,
        detail: published.id,
      });
    }

    // The state two concurrent publications produce without FOR UPDATE. No public call can
    // create it any more, which is exactly why the audit has to see it.
    const currentPublished = m.revisions.filter((r) => r.publishedAt && !r.supersededAt);
    if (currentPublished.length > 1) {
      violations.push({
        rule: "multiple_published_revisions",
        measureId: m.id,
        detail: currentPublished.map((r) => r.id).join(","),
      });
    }

    const activeDrafts = m.revisions.filter((r) => !r.publishedAt && !r.discardedAt);
    const orphans = activeDrafts.filter((r) => r.id !== m.latestRevisionId);
    if (orphans.length > 0) {
      violations.push({
        rule: "orphan_active_draft",
        measureId: m.id,
        detail: orphans.map((r) => r.id).join(","),
      });
    }

    if (m.latestRevision && m.latestRevision.measureId !== m.id) {
      violations.push({
        rule: "latest_revision_foreign",
        measureId: m.id,
        detail: m.latestRevision.id,
      });
    }
    if (m.latestRevision?.discardedAt) {
      violations.push({
        rule: "latest_revision_discarded",
        measureId: m.id,
        detail: m.latestRevision.id,
      });
    }

    if (m.candidacy && m.candidacy.politicianId !== m.politicianId) {
      violations.push({
        rule: "candidacy_politician_mismatch",
        measureId: m.id,
        detail: m.candidacyId ?? "",
      });
    }
    if (m.programEdition && m.programEdition.electionId !== m.electionId) {
      violations.push({
        rule: "program_edition_election_mismatch",
        measureId: m.id,
        detail: m.programEditionId ?? "",
      });
    }

    if (m.withdrawnAt && (!m.withdrawnSourceUrl || !m.withdrawnSourceLabel)) {
      violations.push({ rule: "withdrawn_without_source", measureId: m.id, detail: "" });
    }
    if (!m.withdrawnAt && (m.withdrawnSourceUrl || m.withdrawnSourceLabel)) {
      violations.push({ rule: "withdrawal_source_without_date", measureId: m.id, detail: "" });
    }

    const doc = byEntity.get(m.id);
    const shouldBePublic = m.publicationStatus === "PUBLISHED" && m.publishedRevisionId !== null;

    // A missing document is a violation, not a normal case. Without this rule the two
    // checks below never fire on a measure that was never indexed at all, because both are
    // guarded by `if (doc)`: total absence escaped the audit entirely.
    //
    // Only demanded when there IS a reference revision. A measure whose only draft was
    // discarded has nothing to represent, and syncSearchDocument deletes its row on purpose.
    const referenceRevisionId = m.publishedRevisionId ?? m.latestRevisionId;
    if (!doc && referenceRevisionId !== null) {
      violations.push({
        rule: "search_document_missing",
        measureId: m.id,
        detail: referenceRevisionId,
      });
    }

    if (doc && shouldBePublic !== (doc.visibility === "PUBLIC")) {
      violations.push({
        rule: "search_document_visibility_mismatch",
        measureId: m.id,
        detail: doc.visibility,
      });
    }
    if (doc) {
      // Staleness is measured against the reference revision of the document's visibility,
      // and NEVER against Measure.updatedAt: drafting moves updatedAt without changing the
      // public text, so the naive comparison reports every measure with a draft in progress
      // as stale.
      const reference = doc.visibility === "PUBLIC" ? m.publishedRevisionId : m.latestRevisionId;
      if (doc.sourceRevisionId !== reference) {
        violations.push({
          rule: "search_document_stale",
          measureId: m.id,
          detail: `${doc.sourceRevisionId} != ${reference}`,
        });
      }
    }
  }

  const assessments = await db.measureSimilarityAssessment.findMany({
    select: { id: true, conclusion: true, _count: { select: { matches: true } } },
  });
  for (const a of assessments) {
    const hasMatches = a._count.matches > 0;
    if ((a.conclusion === "EQUIVALENT_FOUND") !== hasMatches) {
      violations.push({ rule: "similarity_conclusion_mismatch", measureId: null, detail: a.id });
    }
  }

  const qualifications = await db.measureQualification.findMany({
    select: { id: true, sourceUrl: true, sourceLabel: true },
  });
  for (const q of qualifications) {
    if (Boolean(q.sourceUrl) !== Boolean(q.sourceLabel)) {
      violations.push({ rule: "qualification_half_source", measureId: null, detail: q.id });
    }
  }

  const editions = await db.programEdition.findMany({
    select: { id: true, ownerType: true, partyId: true, candidacyId: true },
  });
  for (const e of editions) {
    const owners = [e.partyId, e.candidacyId].filter((id) => id !== null);
    const declared = e.ownerType === "PARTY" ? e.partyId : e.candidacyId;
    if (owners.length !== 1 || declared === null) {
      violations.push({ rule: "program_edition_owner_count", measureId: null, detail: e.id });
    }
  }

  return violations;
}
