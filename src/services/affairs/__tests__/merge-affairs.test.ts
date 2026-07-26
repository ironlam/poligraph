import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Issue #525 — merging deletes a row, which frees its slug. Every URL form the
 * absorbed affair served has to survive on the survivor, and nothing the
 * survivor already states may be overwritten.
 */

type TxRecorder = {
  affair: {
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  source: { findMany: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  affairEvent: { findMany: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  pressArticleAffair: { findMany: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  publicIdRedirect: { upsert: ReturnType<typeof vi.fn> };
  affairPairDecision: { upsert: ReturnType<typeof vi.fn> };
  affairCourtDecision: {
    findMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  dismissedDuplicate: { deleteMany: ReturnType<typeof vi.fn> };
  auditLog: { create: ReturnType<typeof vi.fn> };
};

const tx: TxRecorder = {
  affair: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
  source: { findMany: vi.fn(), update: vi.fn() },
  affairEvent: { findMany: vi.fn(), update: vi.fn() },
  pressArticleAffair: { findMany: vi.fn(), update: vi.fn() },
  publicIdRedirect: { upsert: vi.fn() },
  affairPairDecision: { upsert: vi.fn() },
  affairCourtDecision: { findMany: vi.fn(), update: vi.fn() },
  dismissedDuplicate: { deleteMany: vi.fn() },
  auditLog: { create: vi.fn() },
};

vi.mock("@/lib/db", () => ({
  db: {
    $transaction: (fn: (t: TxRecorder) => unknown) => fn(tx),
    affair: { findMany: vi.fn() },
    dismissedDuplicate: { findMany: vi.fn(), upsert: vi.fn() },
    affairPairDecision: { findMany: vi.fn(), upsert: vi.fn() },
  },
}));

vi.mock("../matching", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../matching")>();
  return { ...actual, findMatchingAffairs: vi.fn() };
});

import { computePreservedSlugs, mergeAffairs } from "../reconciliation";
import { buildPublicAffairLookupWheres } from "@/lib/affairs/affair-lookup";

function affair(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "keep",
    title: "Affaire conservée",
    politicianId: "p1",
    slug: "affaire-conservee",
    publicId: "AF-000001",
    oldSlugs: [],
    court: null,
    caseNumber: null,
    publicationStatus: "DRAFT",
    ...overrides,
  };
}

/** Wires the survivor/absorbed pair and empty relation sets by default. */
function stub(keep: Record<string, unknown>, remove: Record<string, unknown>) {
  tx.affair.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
    Promise.resolve(where.id === keep.id ? keep : remove)
  );
  tx.source.findMany.mockResolvedValue([]);
  tx.affairEvent.findMany.mockResolvedValue([]);
  tx.pressArticleAffair.findMany.mockResolvedValue([]);
  tx.affairCourtDecision.findMany.mockResolvedValue([]);
}

/** The payload of the single additive update, or null when nothing was written. */
function updatePayload(): Record<string, unknown> | null {
  const call = tx.affair.update.mock.calls[0];
  return call ? (call[0].data as Record<string, unknown>) : null;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("computePreservedSlugs — issue #525", () => {
  it("carries the absorbed slug and its former slugs", () => {
    expect(
      computePreservedSlugs({
        keepSlug: "gardee",
        keepOldSlugs: [],
        removeSlug: "absorbee",
        removeOldSlugs: ["absorbee-ancien"],
      })
    ).toEqual(["absorbee", "absorbee-ancien"]);
  });

  it("never lists the survivor's own canonical slug", () => {
    // Two affairs cannot share a canonical slug (unique), but the absorbed one
    // may have answered to what is now the survivor's slug.
    expect(
      computePreservedSlugs({
        keepSlug: "gardee",
        keepOldSlugs: [],
        removeSlug: "absorbee",
        removeOldSlugs: ["gardee"],
      })
    ).toEqual(["absorbee"]);
  });

  it("does not repeat what the survivor already answers to", () => {
    expect(
      computePreservedSlugs({
        keepSlug: "gardee",
        keepOldSlugs: ["absorbee"],
        removeSlug: "absorbee",
        removeOldSlugs: [],
      })
    ).toEqual([]);
  });

  it("deduplicates", () => {
    expect(
      computePreservedSlugs({
        keepSlug: "gardee",
        keepOldSlugs: [],
        removeSlug: "absorbee",
        removeOldSlugs: ["absorbee", "absorbee"],
      })
    ).toEqual(["absorbee"]);
  });
});

describe("mergeAffairs — URLs survive the merge (issue #525)", () => {
  it("appends the absorbed slugs to the survivor without dropping its own", async () => {
    stub(
      affair({ id: "keep", slug: "gardee", oldSlugs: ["gardee-v1"] }),
      affair({ id: "remove", slug: "absorbee", publicId: "AF-000002", oldSlugs: ["absorbee-v1"] })
    );

    const result = await mergeAffairs("keep", "remove");

    expect(updatePayload()?.oldSlugs).toEqual(["gardee-v1", "absorbee", "absorbee-v1"]);
    expect(result.slugsPreserved).toEqual(["absorbee", "absorbee-v1"]);
  });

  it("makes the absorbed slug resolve to the survivor", async () => {
    stub(
      affair({ id: "keep", slug: "gardee" }),
      affair({ id: "remove", slug: "absorbee", publicId: "AF-000002" })
    );

    await mergeAffairs("keep", "remove");
    const survivorOldSlugs = updatePayload()?.oldSlugs as string[];

    // The public resolver looks the retired slug up in oldSlugs, restricted to
    // published affairs. Together with the write above, the old URL resolves.
    const [, byOldSlug] = buildPublicAffairLookupWheres("absorbee");
    expect(byOldSlug).toEqual({
      oldSlugs: { has: "absorbee" },
      publicationStatus: "PUBLISHED",
    });
    expect(survivorOldSlugs).toContain("absorbee");
  });

  it("keeps the retired publicId redirect", async () => {
    stub(
      affair({ id: "keep", publicId: "AF-000001" }),
      affair({ id: "remove", slug: "absorbee", publicId: "AF-000002" })
    );

    await mergeAffairs("keep", "remove");

    expect(tx.publicIdRedirect.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { fromPublicId: "AF-000002" },
        create: expect.objectContaining({ toPublicId: "AF-000001", reason: "merged" }),
      })
    );
  });

  it("deletes the absorbed affair inside the same transaction", async () => {
    stub(affair({ id: "keep" }), affair({ id: "remove", slug: "absorbee" }));

    await mergeAffairs("keep", "remove");

    expect(tx.affair.delete).toHaveBeenCalledWith({ where: { id: "remove" } });
  });
});

describe("mergeAffairs — additive only (issue #525)", () => {
  it("fills an editorial field the survivor is missing", async () => {
    stub(
      affair({ id: "keep", court: null, caseNumber: null }),
      affair({
        id: "remove",
        slug: "absorbee",
        court: "Cour d'appel de Paris",
        caseNumber: "2023/12345",
      })
    );

    const result = await mergeAffairs("keep", "remove");

    expect(updatePayload()).toMatchObject({
      court: "Cour d'appel de Paris",
      caseNumber: "2023/12345",
    });
    expect(result.identifiersMerged).toEqual(expect.arrayContaining(["court", "caseNumber"]));
  });

  it("ne remplit plus aucun identifiant de décision (#545)", async () => {
    // Ils vivent sur CourtDecision, et les liaisons de l'absorbée sont transférées :
    // le survivant continue de citer les mêmes décisions, sans copie de colonne.
    stub(affair({ id: "keep" }), affair({ id: "remove", slug: "absorbee" }));

    await mergeAffairs("keep", "remove");

    const payload = updatePayload() ?? {};
    for (const field of ["ecli", "pourvoiNumber", "chamber", "caseNumbers"]) {
      expect(payload).not.toHaveProperty(field);
    }
  });

  it("never overwrites a judicial field the survivor already states", async () => {
    stub(
      affair({ id: "keep", court: "Tribunal de Paris", caseNumber: "2023/111" }),
      affair({
        id: "remove",
        slug: "absorbee",
        court: "Cour d'appel de Lyon",
        caseNumber: "2023/999",
      })
    );

    const result = await mergeAffairs("keep", "remove");

    const payload = updatePayload() ?? {};
    expect(payload).not.toHaveProperty("court");
    expect(payload).not.toHaveProperty("ecli");
    expect(result.identifiersMerged).toEqual([]);
  });

  it("leaves editorial fields alone", async () => {
    stub(affair({ id: "keep" }), affair({ id: "remove", slug: "absorbee" }));

    await mergeAffairs("keep", "remove");

    const payload = updatePayload() ?? {};
    for (const field of [
      "title",
      "description",
      "status",
      "verdictDate",
      "factsDate",
      "category",
      "involvement",
      "publicationStatus",
      "sentence",
    ]) {
      expect(payload).not.toHaveProperty(field);
    }
  });
});

describe("mergeAffairs — transfers deduplicate (issue #525)", () => {
  it("skips a source whose URL the survivor already carries", async () => {
    stub(affair({ id: "keep" }), affair({ id: "remove", slug: "absorbee" }));
    tx.source.findMany
      .mockResolvedValueOnce([{ url: "https://example.org/a" }]) // survivor
      .mockResolvedValueOnce([
        { id: "s1", url: "https://example.org/a" },
        { id: "s2", url: "https://example.org/b" },
      ]);

    const result = await mergeAffairs("keep", "remove");

    expect(result.sourcesMoved).toBe(1);
    expect(tx.source.update).toHaveBeenCalledTimes(1);
    expect(tx.source.update).toHaveBeenCalledWith({
      where: { id: "s2" },
      data: { affairId: "keep" },
    });
  });

  it("skips an event the survivor already records", async () => {
    // AffairEvent has no unique constraint, so identity is (date, type, title).
    const date = new Date("2024-03-01T00:00:00Z");
    stub(affair({ id: "keep" }), affair({ id: "remove", slug: "absorbee" }));
    tx.affairEvent.findMany
      .mockResolvedValueOnce([{ date, type: "CONDAMNATION", title: "Jugement" }])
      .mockResolvedValueOnce([
        { id: "e1", date, type: "CONDAMNATION", title: "Jugement" },
        { id: "e2", date, type: "APPEL", title: "Appel interjeté" },
      ]);

    const result = await mergeAffairs("keep", "remove");

    expect(result.eventsMoved).toBe(1);
    expect(tx.affairEvent.update).toHaveBeenCalledWith({
      where: { id: "e2" },
      data: { affairId: "keep" },
    });
  });

  it("skips a press link that would break the article uniqueness constraint", async () => {
    stub(affair({ id: "keep" }), affair({ id: "remove", slug: "absorbee" }));
    tx.pressArticleAffair.findMany
      .mockResolvedValueOnce([{ articleId: "art1" }])
      .mockResolvedValueOnce([
        { id: "l1", articleId: "art1" },
        { id: "l2", articleId: "art2" },
      ]);

    const result = await mergeAffairs("keep", "remove");

    expect(result.articlesMoved).toBe(1);
    expect(tx.pressArticleAffair.update).toHaveBeenCalledWith({
      where: { id: "l2" },
      data: { affairId: "keep" },
    });
  });
});

describe("mergeAffairs — bookkeeping (issue #525)", () => {
  it("records what moved in the audit trail", async () => {
    stub(
      affair({ id: "keep" }),
      affair({ id: "remove", title: "Affaire absorbée", slug: "absorbee", publicId: "AF-000002" })
    );

    await mergeAffairs("keep", "remove", {
      audit: { ipAddress: "203.0.113.1", userAgent: "test" },
    });

    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "MERGE",
        entityId: "keep",
        ipAddress: "203.0.113.1",
        changes: expect.objectContaining({
          mergedFrom: "remove",
          mergedFromTitle: "Affaire absorbée",
          slugsPreserved: ["absorbee"],
        }),
      }),
    });
  });

  it("clears dismissals that referenced the absorbed affair", async () => {
    stub(affair({ id: "keep" }), affair({ id: "remove", slug: "absorbee" }));

    await mergeAffairs("keep", "remove");

    expect(tx.dismissedDuplicate.deleteMany).toHaveBeenCalledWith({
      where: { OR: [{ affairIdA: "remove" }, { affairIdB: "remove" }] },
    });
  });

  it("refuses to merge when an affair is missing", async () => {
    tx.affair.findUnique.mockResolvedValue(null);

    await expect(mergeAffairs("keep", "remove")).rejects.toThrow("Affair to keep not found");
    expect(tx.affair.delete).not.toHaveBeenCalled();
  });
});

// Review of #526 — the invariants lived only in the admin routes, but the cron
// calls the service directly. Both cases below deleted an affair outright.
describe("mergeAffairs — invariants du service (#525)", () => {
  it("refuse de fusionner une affaire avec elle-même, sans rien supprimer", async () => {
    // Sans ce garde : les transferts sont tous ignorés (mêmes URL, mêmes clés),
    // aucune redirection n'est écrite puisque les publicId sont égaux, puis la
    // ligne est supprimée. Perte totale.
    const same = affair({ id: "keep", slug: "gardee", publicId: "AF-000001" });
    stub(same, same);

    await expect(mergeAffairs("keep", "keep")).rejects.toThrow(/elle-même/i);

    expect(tx.affair.delete).not.toHaveBeenCalled();
    expect(tx.affair.update).not.toHaveBeenCalled();
    expect(tx.source.update).not.toHaveBeenCalled();
    expect(tx.affairEvent.update).not.toHaveBeenCalled();
    expect(tx.pressArticleAffair.update).not.toHaveBeenCalled();
    expect(tx.publicIdRedirect.upsert).not.toHaveBeenCalled();
  });

  it("refuse de fusionner deux affaires de personnalités différentes", async () => {
    // Affair est 1:1 avec Politician : une telle fusion déplacerait les sources
    // d'une personne vers la fiche d'une autre, puis supprimerait la ligne.
    stub(
      affair({ id: "keep", politicianId: "p1" }),
      affair({ id: "remove", slug: "absorbee", politicianId: "p2" })
    );

    await expect(mergeAffairs("keep", "remove")).rejects.toThrow(/personnalités différentes/i);

    expect(tx.affair.delete).not.toHaveBeenCalled();
    expect(tx.affair.update).not.toHaveBeenCalled();
    expect(tx.source.update).not.toHaveBeenCalled();
    expect(tx.affairEvent.update).not.toHaveBeenCalled();
    expect(tx.pressArticleAffair.update).not.toHaveBeenCalled();
  });
});

describe("mergeAffairs — la déduplication ne doit rien perdre (#525)", () => {
  it("transfère deux événements qui ne diffèrent que par leur source", async () => {
    const date = new Date("2024-03-01T00:00:00Z");
    stub(affair({ id: "keep" }), affair({ id: "remove", slug: "absorbee" }));
    tx.affairEvent.findMany
      .mockResolvedValueOnce([
        {
          date,
          type: "CONDAMNATION",
          title: "Jugement",
          description: "Première instance",
          sourceUrl: "https://example.org/a",
          sourceTitle: "Le Monde",
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "e1",
          date,
          type: "CONDAMNATION",
          title: "Jugement",
          description: "Première instance",
          sourceUrl: "https://example.org/b",
          sourceTitle: "AFP",
        },
      ]);

    const result = await mergeAffairs("keep", "remove");

    // Même date, même type, même titre : l'ancienne clé les confondait et
    // l'événement absorbé disparaissait avec sa source.
    expect(result.eventsMoved).toBe(1);
    expect(tx.affairEvent.update).toHaveBeenCalledWith({
      where: { id: "e1" },
      data: { affairId: "keep" },
    });
  });

  it("ignore un événement identique sur tous ses champs", async () => {
    const date = new Date("2024-03-01T00:00:00Z");
    const event = {
      date,
      type: "CONDAMNATION",
      title: "Jugement",
      description: "Première instance",
      sourceUrl: "https://example.org/a",
      sourceTitle: "Le Monde",
    };
    stub(affair({ id: "keep" }), affair({ id: "remove", slug: "absorbee" }));
    tx.affairEvent.findMany
      .mockResolvedValueOnce([event])
      .mockResolvedValueOnce([{ id: "e1", ...event }]);

    const result = await mergeAffairs("keep", "remove");

    expect(result.eventsMoved).toBe(0);
    expect(tx.affairEvent.update).not.toHaveBeenCalled();
  });

  it("complète l'extrait et l'archive d'une source de même URL", async () => {
    stub(affair({ id: "keep" }), affair({ id: "remove", slug: "absorbee" }));
    tx.source.findMany
      .mockResolvedValueOnce([
        { id: "s0", url: "https://example.org/a", excerpt: null, archivedUrl: null },
      ])
      .mockResolvedValueOnce([
        {
          id: "s1",
          url: "https://example.org/a",
          excerpt: "Extrait clé",
          archivedUrl: "https://archive.org/x",
        },
      ]);

    const result = await mergeAffairs("keep", "remove");

    // La source n'est pas déplacée (l'URL existe déjà) mais ce qu'elle apportait
    // ne disparaît pas avec la ligne supprimée.
    expect(result.sourcesMoved).toBe(0);
    expect(result.sourcesEnriched).toBe(1);
    expect(tx.source.update).toHaveBeenCalledWith({
      where: { id: "s0" },
      data: { excerpt: "Extrait clé", archivedUrl: "https://archive.org/x" },
    });
  });

  it("ne remplace pas un extrait déjà présent sur la source conservée", async () => {
    stub(affair({ id: "keep" }), affair({ id: "remove", slug: "absorbee" }));
    tx.source.findMany
      .mockResolvedValueOnce([
        {
          id: "s0",
          url: "https://example.org/a",
          excerpt: "Extrait retenu",
          archivedUrl: "https://archive.org/keep",
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "s1",
          url: "https://example.org/a",
          excerpt: "Autre extrait",
          archivedUrl: "https://archive.org/other",
        },
      ]);

    const result = await mergeAffairs("keep", "remove");

    expect(result.sourcesEnriched).toBe(0);
    expect(tx.source.update).not.toHaveBeenCalled();
  });
});

// Review of #531 — the published guard lived only in the route. A row can be
// published between a caller's precheck and this write, and a merge deletes it.
describe("mergeAffairs — refus transactionnel d'absorber une affaire publiée (#525)", () => {
  it("refuse quand l'affaire à absorber est publiée à la lecture transactionnelle", async () => {
    // Le précontrôle de la route l'avait lue en DRAFT ; elle est publiée depuis.
    stub(
      affair({ id: "keep", publicationStatus: "PUBLISHED" }),
      affair({ id: "remove", slug: "absorbee", publicationStatus: "PUBLISHED" })
    );

    await expect(
      mergeAffairs("keep", "remove", { removeMustNotBePublished: true })
    ).rejects.toThrow(/publiée/i);

    expect(tx.affair.delete).not.toHaveBeenCalled();
    expect(tx.affair.update).not.toHaveBeenCalled();
    expect(tx.source.update).not.toHaveBeenCalled();
    expect(tx.affairEvent.update).not.toHaveBeenCalled();
    expect(tx.pressArticleAffair.update).not.toHaveBeenCalled();
    expect(tx.publicIdRedirect.upsert).not.toHaveBeenCalled();
    expect(tx.affairPairDecision.upsert).not.toHaveBeenCalled();
  });

  it("laisse passer l'absorption d'un brouillon", async () => {
    stub(
      affair({ id: "keep", publicationStatus: "PUBLISHED" }),
      affair({ id: "remove", slug: "absorbee", publicationStatus: "DRAFT" })
    );

    await expect(
      mergeAffairs("keep", "remove", { removeMustNotBePublished: true })
    ).resolves.toBeDefined();

    expect(tx.affair.delete).toHaveBeenCalledWith({ where: { id: "remove" } });
  });

  it("ne contrôle rien sans l'option, pour ne pas changer les appels existants", async () => {
    stub(
      affair({ id: "keep", publicationStatus: "PUBLISHED" }),
      affair({ id: "remove", slug: "absorbee", publicationStatus: "PUBLISHED" })
    );

    await expect(mergeAffairs("keep", "remove")).resolves.toBeDefined();
  });
});

// Issue #536 — a merge deletes the absorbed affair, and the cascade on
// AffairCourtDecision would take its links with it. A merge of affairs must never
// destroy a decision, nor a decision's reach across fiches.
describe("mergeAffairs — transfert des liaisons de décision (#536)", () => {
  /** Wires the survivor's links, then the absorbed affair's. */
  function stubDecisionLinks(
    kept: Array<{ courtDecisionId: string; notes: string | null }>,
    absorbed: Array<{ courtDecisionId: string; notes: string | null }>
  ) {
    tx.affairCourtDecision.findMany.mockResolvedValueOnce(kept).mockResolvedValueOnce(absorbed);
  }

  it("transfère une liaison unique vers le survivant", async () => {
    stub(affair({ id: "keep" }), affair({ id: "remove", slug: "absorbee" }));
    stubDecisionLinks([], [{ courtDecisionId: "dec_1", notes: null }]);

    const result = await mergeAffairs("keep", "remove");

    expect(result.decisionLinksMoved).toBe(1);
    expect(result.decisionLinksDeduplicated).toBe(0);
    expect(tx.affairCourtDecision.update).toHaveBeenCalledWith({
      where: { affairId_courtDecisionId: { affairId: "remove", courtDecisionId: "dec_1" } },
      data: { affairId: "keep" },
    });
  });

  it("transfère plusieurs décisions distinctes", async () => {
    stub(affair({ id: "keep" }), affair({ id: "remove", slug: "absorbee" }));
    stubDecisionLinks(
      [],
      [
        { courtDecisionId: "dec_1", notes: null },
        { courtDecisionId: "dec_2", notes: null },
      ]
    );

    const result = await mergeAffairs("keep", "remove");

    expect(result.decisionLinksMoved).toBe(2);
    const moved = tx.affairCourtDecision.update.mock.calls.map(
      (c) => c[0].where.affairId_courtDecisionId.courtDecisionId
    );
    expect(moved).toEqual(["dec_1", "dec_2"]);
  });

  it("déduplique quand les deux affaires citent déjà la même décision", async () => {
    stub(affair({ id: "keep" }), affair({ id: "remove", slug: "absorbee" }));
    stubDecisionLinks(
      [{ courtDecisionId: "dec_1", notes: "note du survivant" }],
      [{ courtDecisionId: "dec_1", notes: "note absorbée" }]
    );

    const result = await mergeAffairs("keep", "remove");

    expect(result.decisionLinksMoved).toBe(0);
    expect(result.decisionLinksDeduplicated).toBe(1);
    // La note du survivant existe : rien n'est réécrit, rien n'est concaténé.
    expect(tx.affairCourtDecision.update).not.toHaveBeenCalled();
  });

  it("reprend la note absorbée quand le survivant n'en a pas", async () => {
    stub(affair({ id: "keep" }), affair({ id: "remove", slug: "absorbee" }));
    stubDecisionLinks(
      [{ courtDecisionId: "dec_1", notes: null }],
      [{ courtDecisionId: "dec_1", notes: "deux chefs d'un même arrêt" }]
    );

    const result = await mergeAffairs("keep", "remove");

    expect(result.decisionLinksDeduplicated).toBe(1);
    expect(tx.affairCourtDecision.update).toHaveBeenCalledWith({
      where: { affairId_courtDecisionId: { affairId: "keep", courtDecisionId: "dec_1" } },
      data: { notes: "deux chefs d'un même arrêt" },
    });
  });

  it("ne concatène jamais deux notes différentes en silence", async () => {
    stub(affair({ id: "keep" }), affair({ id: "remove", slug: "absorbee" }));
    stubDecisionLinks(
      [{ courtDecisionId: "dec_1", notes: "texte A" }],
      [{ courtDecisionId: "dec_1", notes: "texte B" }]
    );

    await mergeAffairs("keep", "remove");

    const writes = tx.affairCourtDecision.update.mock.calls.map((c) => c[0].data);
    for (const w of writes) {
      expect(String(w.notes ?? "")).not.toContain("texte A");
    }
    // Le cas est tracé dans la piste d'audit plutôt que résolu en silence.
    const changes = tx.auditLog.create.mock.calls[0]![0].data.changes;
    expect(changes.decisionLinksDeduplicatedIds).toEqual(["dec_1"]);
  });

  it("ne supprime aucune décision", async () => {
    stub(affair({ id: "keep" }), affair({ id: "remove", slug: "absorbee" }));
    stubDecisionLinks([], [{ courtDecisionId: "dec_1", notes: null }]);

    await mergeAffairs("keep", "remove");

    // Le faux client de transaction n'expose aucune suppression de décision : si le
    // service en tentait une, l'appel échouerait.
    expect(tx).not.toHaveProperty("courtDecision");
  });

  it("consigne les compteurs et les identifiants dans la piste d'audit", async () => {
    stub(affair({ id: "keep" }), affair({ id: "remove", slug: "absorbee" }));
    stubDecisionLinks(
      [{ courtDecisionId: "dec_shared", notes: "gardée" }],
      [
        { courtDecisionId: "dec_shared", notes: "absorbée" },
        { courtDecisionId: "dec_new", notes: null },
      ]
    );

    await mergeAffairs("keep", "remove");

    const changes = tx.auditLog.create.mock.calls[0]![0].data.changes;
    expect(changes).toMatchObject({
      decisionLinksMoved: 1,
      decisionLinksDeduplicated: 1,
      decisionLinksMovedIds: ["dec_new"],
      decisionLinksDeduplicatedIds: ["dec_shared"],
    });
  });

  it("annule tout si le transfert d'une liaison échoue", async () => {
    stub(affair({ id: "keep" }), affair({ id: "remove", slug: "absorbee" }));
    stubDecisionLinks([], [{ courtDecisionId: "dec_1", notes: null }]);
    tx.affairCourtDecision.update.mockRejectedValue(new Error("link transfer failed"));

    await expect(mergeAffairs("keep", "remove")).rejects.toThrow("link transfer failed");

    expect(tx.affair.delete).not.toHaveBeenCalled();
    expect(tx.publicIdRedirect.upsert).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("annule le transfert si la suppression de l'affaire échoue", async () => {
    stub(affair({ id: "keep" }), affair({ id: "remove", slug: "absorbee" }));
    stubDecisionLinks([], [{ courtDecisionId: "dec_1", notes: null }]);
    // clearAllMocks efface les appels, pas les implémentations : le rejet posé par
    // le test précédent doit être explicitement levé.
    tx.affairCourtDecision.update.mockResolvedValue({});
    tx.affair.delete.mockRejectedValue(new Error("delete failed"));

    await expect(mergeAffairs("keep", "remove")).rejects.toThrow("delete failed");

    // Le transfert a bien été tenté ; la transaction l'annule.
    expect(tx.affairCourtDecision.update).toHaveBeenCalled();
  });

  it("transfère les liaisons avant la suppression de l'affaire", async () => {
    const order: string[] = [];
    stub(affair({ id: "keep" }), affair({ id: "remove", slug: "absorbee" }));
    stubDecisionLinks([], [{ courtDecisionId: "dec_1", notes: null }]);
    tx.affairCourtDecision.update.mockImplementation(async () => {
      order.push("transfer");
      return {};
    });
    tx.affair.delete.mockImplementation(async () => {
      order.push("delete");
      return {};
    });

    await mergeAffairs("keep", "remove");

    expect(order).toEqual(["transfer", "delete"]);
  });
});
