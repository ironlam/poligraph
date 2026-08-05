import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  deriveModerationState,
  MODERATION_ANOMALY_CODES,
  type ModerationMeasureRow,
  type ModerationRevisionRow,
} from "../moderation-state";

const T0 = new Date("2027-01-10T00:00:00Z");
const T1 = new Date("2027-02-10T00:00:00Z");

function revision(over: Partial<ModerationRevisionRow> = {}): ModerationRevisionRow {
  return {
    id: "rev-1",
    reviewedAt: null,
    publishedAt: null,
    supersededAt: null,
    discardedAt: null,
    sourceCount: 1,
    ...over,
  };
}

function measureRow(over: Partial<ModerationMeasureRow> = {}): ModerationMeasureRow {
  return {
    id: "m-1",
    publicationStatus: "DRAFT",
    latestRevisionId: null,
    publishedRevisionId: null,
    withdrawnAt: null,
    withdrawnSourceUrl: null,
    withdrawnSourceLabel: null,
    depublishedAt: null,
    depublicationReason: null,
    revisions: [],
    ...over,
  };
}

/** A correctly published measure: reviewed, published, not superseded, one source. */
function publishedRow(
  revisionOver: Partial<ModerationRevisionRow> = {},
  measureOver: Partial<ModerationMeasureRow> = {}
): ModerationMeasureRow {
  const published = revision({
    id: "rev-pub",
    reviewedAt: T0,
    publishedAt: T0,
    ...revisionOver,
  });
  return measureRow({
    publicationStatus: "PUBLISHED",
    publishedRevisionId: published.id,
    latestRevisionId: published.id,
    revisions: [published],
    ...measureOver,
  });
}

function codes(row: ModerationMeasureRow): string[] {
  return deriveModerationState(row).anomalies.map((a) => a.code);
}

describe("deriveModerationState : visibilité publique", () => {
  // The violation first: a measure the admin would call "published" while the public read
  // returns nothing for it. This is the failure this whole module exists to prevent.
  it("does not report a measure as publicly visible when the pointed revision has no source", () => {
    const state = deriveModerationState(publishedRow({ sourceCount: 0 }));

    expect(state.publiclyVisible).toBe(false);
    expect(state.anomalies.map((a) => a.code)).toContain("published_revision_without_source");
  });

  it("reports a correctly published measure as publicly visible, with no anomaly", () => {
    const state = deriveModerationState(publishedRow());

    expect(state.publication).toBe("PUBLISHED");
    expect(state.publiclyVisible).toBe(true);
    expect(state.anomalies).toEqual([]);
    expect(state.pendingDraft).toBeNull();
    expect(state.withdrawal).toBeNull();
    expect(state.depublication).toBeNull();
  });

  it.each([
    ["unreviewed", { reviewedAt: null }, "revision_unreviewed"],
    ["never published", { publishedAt: null }, "revision_never_published"],
    ["superseded", { supersededAt: T1 }, "revision_superseded"],
    ["discarded", { discardedAt: T1 }, "revision_discarded"],
    ["without source", { sourceCount: 0 }, "revision_without_source"],
  ])("hides a measure whose pointed revision is %s, and says why", (_label, over, blocker) => {
    const state = deriveModerationState(publishedRow(over));

    expect(state.publiclyVisible).toBe(false);
    expect(state.visibilityBlockers).toContain(blocker);
  });

  it("keeps publiclyVisible and the blocker list in agreement", () => {
    // The flag is DEFINED as "no blocker", so the two cannot disagree. This test states the
    // contract rather than the implementation, and it is what makes the blocker list safe to
    // render as the explanation of the flag.
    for (const row of [
      publishedRow(),
      publishedRow({ sourceCount: 0 }),
      measureRow(),
      publishedRow({}, { publicationStatus: "DRAFT", depublishedAt: T1 }),
    ]) {
      const state = deriveModerationState(row);
      expect(state.publiclyVisible).toBe(state.visibilityBlockers.length === 0);
    }
  });

  it("explains a depublication that carries no anomaly at all", () => {
    // A depublished measure is not broken data: nothing to report as an anomaly, and still a
    // reason the public does not see it. Two different questions, two different lists.
    const state = deriveModerationState(
      publishedRow({}, { publicationStatus: "DRAFT", depublishedAt: T1, depublicationReason: "x" })
    );

    expect(state.anomalies).toEqual([]);
    expect(state.visibilityBlockers).toEqual(["status_not_published"]);
  });

  it("explains a discarded published revision that no anomaly rule reports", () => {
    // Found while writing the moderation card. PUBLIC_MEASURE_WHERE filters on
    // `discardedAt: null` on the pointed revision, and neither measures:audit nor the anomaly
    // list has a rule for it. The narrow case is what proves the gap: with the latest pointer
    // on a separate live draft, `latest_revision_discarded` does not fire either, so the
    // measure is invisible to the public and reported as healthy.
    const published = revision({
      id: "rev-pub",
      reviewedAt: T0,
      publishedAt: T0,
      discardedAt: T1,
    });
    const draft = revision({ id: "rev-draft" });
    const state = deriveModerationState(
      measureRow({
        publicationStatus: "PUBLISHED",
        publishedRevisionId: published.id,
        latestRevisionId: draft.id,
        revisions: [published, draft],
      })
    );

    expect(state.visibilityBlockers).toEqual(["revision_discarded"]);
    expect(state.anomalies).toEqual([]);
  });

  it("carries the declared status through instead of folding it into the stage", () => {
    // The enum is shared with affairs. The measure transitions never write EXCLUDED, but a
    // direct write can, and deriving it away would show it as an ordinary draft.
    const state = deriveModerationState(publishedRow({}, { publicationStatus: "EXCLUDED" }));

    expect(state.declaredStatus).toBe("EXCLUDED");
    expect(state.publiclyVisible).toBe(false);
  });
});

describe("deriveModerationState : les étapes du cycle", () => {
  it("reports EMPTY when the measure has no revision at all", () => {
    const state = deriveModerationState(measureRow());

    expect(state.publication).toBe("EMPTY");
    expect(state.anomalies).toEqual([]);
  });

  it("reports EMPTY when the only draft was discarded and nothing was ever published", () => {
    // The state discardMeasureRevision() leaves behind: the pointer falls back to
    // publishedRevisionId, which is null here.
    const state = deriveModerationState(
      measureRow({ revisions: [revision({ discardedAt: T1 })], latestRevisionId: null })
    );

    expect(state.publication).toBe("EMPTY");
    expect(state.pendingDraft).toBeNull();
    expect(state.anomalies).toEqual([]);
  });

  it("reports DRAFT on an active draft that nobody has reviewed", () => {
    const draft = revision({ id: "rev-draft" });
    const state = deriveModerationState(
      measureRow({ revisions: [draft], latestRevisionId: draft.id })
    );

    expect(state.publication).toBe("DRAFT");
    // No pending draft: nothing is published, so this draft IS the current state and not a
    // correction waiting on top of one. Reporting both would claim two versions exist.
    expect(state.pendingDraft).toBeNull();
  });

  it("reports REVIEWED on an active draft that has been read", () => {
    const draft = revision({ id: "rev-draft", reviewedAt: T1 });
    const state = deriveModerationState(
      measureRow({ revisions: [draft], latestRevisionId: draft.id })
    );

    expect(state.publication).toBe("REVIEWED");
    expect(state.pendingDraft).toBeNull();
    expect(state.publiclyVisible).toBe(false);
  });

  it("reports DEPUBLISHED with its reason, and keeps the pointer visible", () => {
    // What depublishMeasure() writes: status DRAFT, the trace, and the published pointer
    // left in place.
    const state = deriveModerationState(
      publishedRow(
        {},
        {
          publicationStatus: "DRAFT",
          depublishedAt: T1,
          depublicationReason: "Mise en cause nominative retirée à la demande du conseil",
        }
      )
    );

    expect(state.publication).toBe("DEPUBLISHED");
    expect(state.publiclyVisible).toBe(false);
    expect(state.depublication).toEqual({
      at: T1,
      reason: "Mise en cause nominative retirée à la demande du conseil",
    });
  });

  it("still reports the depublication when its reason is missing", () => {
    // Same reasoning as the withdrawal shape: the presence of the object is the fact, and a
    // missing reason must not hide the act. Only a direct write can produce this.
    const state = deriveModerationState(
      publishedRow({}, { publicationStatus: "DRAFT", depublishedAt: T1 })
    );

    expect(state.depublication).toEqual({ at: T1, reason: null });
  });
});

describe("deriveModerationState : la correction en cours", () => {
  it("keeps a published measure at PUBLISHED while exposing its reviewed pending draft", () => {
    // The whole point of the two pointers: a correction under review changes nothing for
    // the public, and must not disappear from the moderation view either.
    const published = revision({ id: "rev-pub", reviewedAt: T0, publishedAt: T0 });
    const draft = revision({ id: "rev-draft", reviewedAt: T1 });
    const state = deriveModerationState(
      measureRow({
        publicationStatus: "PUBLISHED",
        publishedRevisionId: published.id,
        latestRevisionId: draft.id,
        revisions: [published, draft],
      })
    );

    expect(state.publication).toBe("PUBLISHED");
    expect(state.publiclyVisible).toBe(true);
    expect(state.pendingDraft).toEqual({ id: "rev-draft", reviewed: true });
    expect(state.anomalies).toEqual([]);
  });

  it("marks a pending draft as not reviewed when it has not been read", () => {
    const published = revision({ id: "rev-pub", reviewedAt: T0, publishedAt: T0 });
    const draft = revision({ id: "rev-draft" });
    const state = deriveModerationState(
      measureRow({
        publicationStatus: "PUBLISHED",
        publishedRevisionId: published.id,
        latestRevisionId: draft.id,
        revisions: [published, draft],
      })
    );

    expect(state.pendingDraft).toEqual({ id: "rev-draft", reviewed: false });
  });
});

describe("deriveModerationState : le retrait", () => {
  it("keeps a withdrawn measure published and publicly visible", () => {
    // Spec 5.2: a withdrawn measure does not disappear. It keeps its published revision and
    // its sources, and its withdrawal state is displayed.
    const state = deriveModerationState(
      publishedRow(
        {},
        {
          withdrawnAt: T1,
          withdrawnSourceUrl: "https://example.org/retrait",
          withdrawnSourceLabel: "Le Monde, 1er mars 2027",
        }
      )
    );

    expect(state.publication).toBe("PUBLISHED");
    expect(state.publiclyVisible).toBe(true);
    expect(state.withdrawal).toEqual({
      withdrawnAt: T1,
      sourceUrl: "https://example.org/retrait",
      sourceLabel: "Le Monde, 1er mars 2027",
    });
    expect(state.anomalies).toEqual([]);
  });

  it("reports an incomplete withdrawal AND still exposes the withdrawal", () => {
    // Both halves matter. Reporting the anomaly while dropping the withdrawal would hide a
    // real fact to protect a type; exposing the withdrawal without the anomaly would pass
    // an unsourced claim off as a sourced one.
    const state = deriveModerationState(publishedRow({}, { withdrawnAt: T1 }));

    expect(state.anomalies.map((a) => a.code)).toContain("withdrawn_without_source");
    expect(state.withdrawal).toEqual({ withdrawnAt: T1, sourceUrl: null, sourceLabel: null });
  });

  it("reports a withdrawal source with no date", () => {
    const state = deriveModerationState(
      publishedRow({}, { withdrawnSourceLabel: "Le Monde, 1er mars 2027" })
    );

    expect(state.anomalies.map((a) => a.code)).toContain("withdrawal_source_without_date");
    expect(state.withdrawal).toBeNull();
  });
});

describe("deriveModerationState : les anomalies, une par une", () => {
  it("detects a published pointer that designates no revision of this measure", () => {
    expect(codes(measureRow({ publishedRevisionId: "rev-ailleurs" }))).toContain(
      "published_revision_foreign"
    );
  });

  it("detects a published pointer on an unreviewed revision", () => {
    expect(codes(publishedRow({ reviewedAt: null }))).toContain("published_revision_unreviewed");
  });

  it("detects a published pointer on a revision that was never published", () => {
    expect(codes(publishedRow({ publishedAt: null }))).toContain("published_revision_unpublished");
  });

  it("detects a published pointer on a superseded revision", () => {
    expect(codes(publishedRow({ supersededAt: T1 }))).toContain("published_revision_superseded");
  });

  it("detects two published non-superseded revisions", () => {
    const first = revision({ id: "rev-a", reviewedAt: T0, publishedAt: T0 });
    const second = revision({ id: "rev-b", reviewedAt: T1, publishedAt: T1 });
    const row = measureRow({
      publicationStatus: "PUBLISHED",
      publishedRevisionId: second.id,
      latestRevisionId: second.id,
      revisions: [first, second],
    });

    expect(codes(row)).toContain("multiple_published_revisions");
  });

  it("detects an active draft that no pointer designates", () => {
    const published = revision({ id: "rev-pub", reviewedAt: T0, publishedAt: T0 });
    const orphan = revision({ id: "rev-orphan" });
    const row = measureRow({
      publicationStatus: "PUBLISHED",
      publishedRevisionId: published.id,
      latestRevisionId: published.id,
      revisions: [published, orphan],
    });

    expect(codes(row)).toContain("orphan_active_draft");
  });

  it("detects a latest pointer that designates no revision of this measure", () => {
    expect(codes(measureRow({ latestRevisionId: "rev-ailleurs" }))).toContain(
      "latest_revision_foreign"
    );
  });

  it("detects a latest pointer on a discarded draft", () => {
    const discarded = revision({ id: "rev-discarded", discardedAt: T1 });
    const row = measureRow({ revisions: [discarded], latestRevisionId: discarded.id });

    expect(codes(row)).toContain("latest_revision_discarded");
  });

  it("decides the stage of orphan drafts without depending on row order", () => {
    // Two active drafts and no pointer on either: already an anomaly, but the stage still
    // has to be decided, and "the last one in the array" would make the answer depend on
    // the ORDER BY of whatever query fed the derivation.
    const reviewed = revision({ id: "rev-a", reviewedAt: T1 });
    const plain = revision({ id: "rev-b" });

    const forward = deriveModerationState(measureRow({ revisions: [reviewed, plain] }));
    const backward = deriveModerationState(measureRow({ revisions: [plain, reviewed] }));

    expect(forward.publication).toBe(backward.publication);
    expect(forward.publication).toBe("REVIEWED");
    expect(forward.anomalies.map((a) => a.code)).toContain("orphan_active_draft");
  });

  it("reports nothing on a measure whose only draft is active and designated", () => {
    const draft = revision({ id: "rev-draft" });

    expect(codes(measureRow({ revisions: [draft], latestRevisionId: draft.id }))).toEqual([]);
  });
});

describe("MODERATION_ANOMALY_CODES", () => {
  it("n'invente aucun code absent de la commande d'audit", () => {
    // One vocabulary for the queue and for `measures:audit`. A lexical check rather than a
    // shared constant, because typing audit.ts's rules would mean reopening lot 1 code for
    // a guarantee this test already gives.
    // process.cwd() is the repo root under vitest; import.meta.url is a vite URL here, not
    // a file: one, so fileURLToPath refuses it.
    const auditSource = readFileSync(join(process.cwd(), "src/lib/measures/audit.ts"), "utf8");

    const missing = MODERATION_ANOMALY_CODES.filter((code) => !auditSource.includes(`"${code}"`));

    expect(missing).toEqual([]);
  });
});
