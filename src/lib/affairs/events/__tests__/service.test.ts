import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  db: {
    affair: { findUnique: vi.fn() },
    affairEvent: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    auditLog: { create: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({ db: h.db }));

import {
  confirmEvent,
  createDraftEvent,
  createProposalRevelationInTx,
  deleteDraftEvent,
  publishEvent,
  retractEvent,
  updateDraftEvent,
  type EventDraftInput,
} from "../service";
import type { DbTransactionClient } from "@/lib/db";

const db = h.db;
const d = (s: string) => new Date(`${s}T00:00:00Z`);
const NOW = new Date("2026-10-08T10:00:00Z");
const META = { ip: "1.2.3.4", userAgent: "vitest" };

const AFFAIR = { slug: "affaire-test", politician: { slug: "jean-testeur" } };

const draftInput: EventDraftInput = {
  type: "PROCES",
  date: new Date("2024-05-13T15:30:00Z"),
  datePrecision: "DAY",
  occurrence: "HELD",
  title: "Ouverture du procès devant le tribunal correctionnel",
  sourceUrl: "https://www.legifrance.gouv.fr/juri/id/1",
  sourceKind: "OFFICIAL",
};

function storedEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt_1",
    affairId: "aff_1",
    identityKey: null,
    type: "PROCES",
    date: d("2024-05-13"),
    datePrecision: "DAY",
    dateEnd: null,
    occurrence: "HELD",
    outcome: null,
    title: "Ouverture du procès devant le tribunal correctionnel",
    court: null,
    description: null,
    sourceUrl: "https://www.legifrance.gouv.fr/juri/id/1",
    sourceTitle: null,
    sourceKind: "OFFICIAL",
    incidental: false,
    corroborationUrl: null,
    status: "DRAFT",
    publishedAt: null,
    retractedAt: null,
    retractionReason: null,
    ...overrides,
  };
}

function expectNoWrite() {
  expect(db.affairEvent.create).not.toHaveBeenCalled();
  expect(db.affairEvent.update).not.toHaveBeenCalled();
  expect(db.affairEvent.delete).not.toHaveBeenCalled();
  expect(db.auditLog.create).not.toHaveBeenCalled();
}

function auditChanges() {
  return db.auditLog.create.mock.calls[0]![0].data.changes;
}

beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(db));
  db.$queryRaw.mockResolvedValue([{ id: "locked" }]);
  db.affair.findUnique.mockResolvedValue(AFFAIR);
  db.affairEvent.create.mockResolvedValue({ id: "evt_new" });
  db.affairEvent.update.mockResolvedValue({ id: "evt_1" });
  db.affairEvent.delete.mockResolvedValue({ id: "evt_1" });
});

describe("createDraftEvent", () => {
  it("crée un brouillon à la date normalisée et l'audite", async () => {
    const result = await createDraftEvent(
      "aff_1",
      { ...draftInput, date: new Date("2024-05-13T15:30:00Z"), datePrecision: "MONTH" },
      META
    );

    expect(result).toEqual({
      ok: true,
      eventId: "evt_new",
      affairSlug: "affaire-test",
      politicianSlug: "jean-testeur",
    });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    const data = db.affairEvent.create.mock.calls[0]![0].data;
    expect(data.affairId).toBe("aff_1");
    expect(data.status).toBe("DRAFT");
    expect(data.date).toEqual(d("2024-05-01"));
    expect(db.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "CREATE",
        entityType: "AffairEvent",
        entityId: "evt_new",
        ipAddress: "1.2.3.4",
        userAgent: "vitest",
      }),
    });
    expect(auditChanges()).toMatchObject({ op: "create", affairId: "aff_1" });
  });

  it("refuse un jugement avec une issue alors qu'il est annoncé", async () => {
    const result = await createDraftEvent(
      "aff_1",
      { ...draftInput, type: "JUGEMENT", occurrence: "SCHEDULED", outcome: "CONDAMNATION" },
      META
    );
    expect(result).toMatchObject({ ok: false, reason: "invalid" });
    expect(result.ok === false && result.messages?.length).toBeGreaterThan(0);
    expectNoWrite();
  });

  it("accepte en brouillon un jugement rendu dont l'issue n'est pas encore saisie", async () => {
    // L'issue manquante est une règle de publication (checkEventPublishable), pas de forme.
    const result = await createDraftEvent("aff_1", { ...draftInput, type: "JUGEMENT" }, META);
    expect(result).toMatchObject({ ok: true });
  });

  it("refuse une issue sur un type qui n'est pas une décision", async () => {
    const result = await createDraftEvent(
      "aff_1",
      { ...draftInput, type: "PROCES", outcome: "CONDAMNATION" },
      META
    );
    expect(result).toMatchObject({ ok: false, reason: "invalid" });
    expectNoWrite();
  });

  it("répond not_found quand l'affaire n'existe pas", async () => {
    db.$queryRaw.mockResolvedValueOnce([]);
    const result = await createDraftEvent("aff_x", draftInput, META);
    expect(result).toEqual({ ok: false, reason: "not_found" });
    expectNoWrite();
  });
});

describe("updateDraftEvent", () => {
  it("remplace tous les champs d'un brouillon", async () => {
    db.affairEvent.findUnique.mockResolvedValue(
      storedEvent({ court: "Tribunal de Paris", description: "Ancienne description" })
    );
    const result = await updateDraftEvent("aff_1", "evt_1", draftInput, META);
    expect(result).toMatchObject({ ok: true, eventId: "evt_1" });
    const call = db.affairEvent.update.mock.calls[0]![0];
    expect(call.where).toEqual({ id: "evt_1" });
    expect(call.data.court).toBeNull();
    expect(call.data.description).toBeNull();
    expect(call.data.date).toEqual(d("2024-05-13"));
    expect(auditChanges()).toMatchObject({ op: "update", affairId: "aff_1" });
  });

  it("refuse de modifier une étape publiée", async () => {
    db.affairEvent.findUnique.mockResolvedValue(storedEvent({ status: "PUBLISHED" }));
    const result = await updateDraftEvent("aff_1", "evt_1", draftInput, META);
    expect(result).toEqual({ ok: false, reason: "not_draft" });
    expectNoWrite();
  });

  it("répond not_found quand l'étape appartient à une autre affaire", async () => {
    db.$queryRaw.mockResolvedValueOnce([]);
    const result = await updateDraftEvent("aff_2", "evt_1", draftInput, META);
    expect(result).toEqual({ ok: false, reason: "not_found" });
    expectNoWrite();
  });
});

describe("deleteDraftEvent", () => {
  it("supprime un brouillon et l'audite", async () => {
    db.affairEvent.findUnique.mockResolvedValue(storedEvent());
    const result = await deleteDraftEvent("aff_1", "evt_1", META);
    expect(result).toMatchObject({ ok: true, eventId: "evt_1" });
    expect(db.affairEvent.delete).toHaveBeenCalledWith({ where: { id: "evt_1" } });
    expect(db.auditLog.create.mock.calls[0]![0].data.action).toBe("DELETE");
    expect(auditChanges()).toMatchObject({ op: "delete", affairId: "aff_1" });
  });

  it("ne supprime jamais une étape publiée", async () => {
    db.affairEvent.findUnique.mockResolvedValue(storedEvent({ status: "PUBLISHED" }));
    const result = await deleteDraftEvent("aff_1", "evt_1", META);
    expect(result).toEqual({ ok: false, reason: "not_draft" });
    expectNoWrite();
  });
});

describe("publishEvent", () => {
  it("publie un brouillon valide et pose publishedAt", async () => {
    db.affairEvent.findUnique.mockResolvedValue(storedEvent());
    const result = await publishEvent("aff_1", "evt_1", META, NOW);
    expect(result).toMatchObject({ ok: true, eventId: "evt_1", affairSlug: "affaire-test" });
    expect(db.affairEvent.update).toHaveBeenCalledWith({
      where: { id: "evt_1" },
      data: { status: "PUBLISHED", publishedAt: NOW },
    });
    expect(db.auditLog.create.mock.calls[0]![0].data.action).toBe("UPDATE");
    expect(auditChanges()).toMatchObject({ op: "publish", affairId: "aff_1" });
  });

  it("refuse un brouillon sans source, avec les raisons", async () => {
    db.affairEvent.findUnique.mockResolvedValue(storedEvent({ sourceUrl: null }));
    const result = await publishEvent("aff_1", "evt_1", META, NOW);
    expect(result).toMatchObject({ ok: false, reason: "invalid" });
    expect(result.ok === false && result.messages).toContain("La source est obligatoire.");
    expectNoWrite();
  });

  it("refuse une étape déjà publiée", async () => {
    db.affairEvent.findUnique.mockResolvedValue(storedEvent({ status: "PUBLISHED" }));
    const result = await publishEvent("aff_1", "evt_1", META, NOW);
    expect(result).toEqual({ ok: false, reason: "not_draft" });
    expectNoWrite();
  });

  it("répond not_found sans rien écrire quand le verrou est vide", async () => {
    db.$queryRaw.mockResolvedValueOnce([]);
    const result = await publishEvent("aff_2", "evt_1", META, NOW);
    expect(result).toEqual({ ok: false, reason: "not_found" });
    expect(db.affairEvent.findUnique).not.toHaveBeenCalled();
    expectNoWrite();
  });
});

describe("retractEvent", () => {
  it("retire une étape publiée avec sa raison", async () => {
    db.affairEvent.findUnique.mockResolvedValue(storedEvent({ status: "PUBLISHED" }));
    const result = await retractEvent("aff_1", "evt_1", "  Audience reportée  ", META, NOW);
    expect(result).toMatchObject({ ok: true, eventId: "evt_1" });
    expect(db.affairEvent.update).toHaveBeenCalledWith({
      where: { id: "evt_1" },
      data: { status: "RETRACTED", retractedAt: NOW, retractionReason: "Audience reportée" },
    });
    expect(auditChanges()).toMatchObject({
      op: "retract",
      affairId: "aff_1",
      reason: "Audience reportée",
    });
  });

  it("refuse un retrait sans raison", async () => {
    db.affairEvent.findUnique.mockResolvedValue(storedEvent({ status: "PUBLISHED" }));
    const result = await retractEvent("aff_1", "evt_1", "   ", META, NOW);
    expect(result).toMatchObject({ ok: false, reason: "invalid" });
    expectNoWrite();
  });

  it("refuse une raison de plus de 280 caractères", async () => {
    db.affairEvent.findUnique.mockResolvedValue(storedEvent({ status: "PUBLISHED" }));
    const result = await retractEvent("aff_1", "evt_1", "x".repeat(281), META, NOW);
    expect(result).toMatchObject({ ok: false, reason: "invalid" });
    expectNoWrite();
  });

  it("refuse de retirer un brouillon", async () => {
    db.affairEvent.findUnique.mockResolvedValue(storedEvent());
    const result = await retractEvent("aff_1", "evt_1", "Erreur de saisie", META, NOW);
    expect(result).toEqual({ ok: false, reason: "not_published" });
    expectNoWrite();
  });
});

describe("confirmEvent", () => {
  const ANNOUNCE_URL = "https://www.lemonde.fr/annonce-proces";
  const scheduled = (overrides: Record<string, unknown> = {}) =>
    storedEvent({
      status: "PUBLISHED",
      occurrence: "SCHEDULED",
      date: d("2026-10-01"),
      sourceUrl: ANNOUNCE_URL,
      sourceKind: "PRESS",
      publishedAt: d("2026-09-01"),
      ...overrides,
    });

  it("refuse une étape déjà tenue", async () => {
    db.affairEvent.findUnique.mockResolvedValue(storedEvent({ status: "PUBLISHED" }));
    const result = await confirmEvent(
      "aff_1",
      "evt_1",
      { sourceUrl: "https://www.liberation.fr/proces", sourceKind: "PRESS" },
      META,
      NOW
    );
    expect(result).toEqual({ ok: false, reason: "not_confirmable" });
    expectNoWrite();
  });

  it("refuse une étape annoncée encore à venir", async () => {
    db.affairEvent.findUnique.mockResolvedValue(scheduled({ date: d("2026-10-09") }));
    const result = await confirmEvent(
      "aff_1",
      "evt_1",
      { sourceUrl: "https://www.liberation.fr/proces", sourceKind: "PRESS" },
      META,
      NOW
    );
    expect(result).toEqual({ ok: false, reason: "not_confirmable" });
    expectNoWrite();
  });

  it("accepte une étape annoncée pour le jour même à Paris", async () => {
    db.affairEvent.findUnique.mockResolvedValue(scheduled({ date: d("2026-10-08") }));
    const result = await confirmEvent(
      "aff_1",
      "evt_1",
      { sourceUrl: "https://www.liberation.fr/proces", sourceKind: "PRESS" },
      META,
      new Date("2026-10-07T22:30:00Z")
    );
    expect(result).toMatchObject({ ok: true });
  });

  it("exige une source différente de celle de l'annonce", async () => {
    db.affairEvent.findUnique.mockResolvedValue(scheduled());
    const result = await confirmEvent(
      "aff_1",
      "evt_1",
      { sourceUrl: `  ${ANNOUNCE_URL} `, sourceKind: "PRESS" },
      META,
      NOW
    );
    expect(result).toMatchObject({ ok: false, reason: "invalid" });
    expectNoWrite();
  });

  it("exige l'issue d'un jugement confirmé", async () => {
    db.affairEvent.findUnique.mockResolvedValue(scheduled({ type: "JUGEMENT" }));
    const result = await confirmEvent(
      "aff_1",
      "evt_1",
      { sourceUrl: "https://www.liberation.fr/jugement", sourceKind: "PRESS" },
      META,
      NOW
    );
    expect(result).toMatchObject({ ok: false, reason: "invalid" });
    expect(result.ok === false && result.messages).toContain(
      "Une décision rendue doit porter son issue."
    );
    expectNoWrite();
  });

  it("passe l'étape en tenue avec la nouvelle source et garde l'ancienne dans l'audit", async () => {
    db.affairEvent.findUnique.mockResolvedValue(scheduled({ type: "JUGEMENT" }));
    const result = await confirmEvent(
      "aff_1",
      "evt_1",
      {
        sourceUrl: "https://www.liberation.fr/jugement",
        sourceTitle: "Le jugement est tombé",
        sourceKind: "PRESS",
        outcome: "CONDAMNATION",
        corroborationUrl: "https://www.lefigaro.fr/jugement",
      },
      META,
      NOW
    );
    expect(result).toMatchObject({ ok: true, eventId: "evt_1", politicianSlug: "jean-testeur" });
    expect(db.affairEvent.update).toHaveBeenCalledWith({
      where: { id: "evt_1" },
      data: {
        occurrence: "HELD",
        sourceUrl: "https://www.liberation.fr/jugement",
        sourceTitle: "Le jugement est tombé",
        sourceKind: "PRESS",
        outcome: "CONDAMNATION",
        corroborationUrl: "https://www.lefigaro.fr/jugement",
      },
    });
    expect(auditChanges()).toMatchObject({
      op: "confirm",
      affairId: "aff_1",
      previousSourceUrl: ANNOUNCE_URL,
    });
  });
});

describe("createProposalRevelationInTx", () => {
  const tx = () => db as unknown as DbTransactionClient;

  it("publie une révélation de presse en https", async () => {
    db.affairEvent.create.mockResolvedValue({ id: "evt_rev", status: "PUBLISHED" });
    const result = await createProposalRevelationInTx(
      tx(),
      "aff_1",
      {
        identityKey: "key_1",
        date: new Date("2026-10-01T18:00:00Z"),
        title: "Révélation par la presse",
        sourceUrl: "https://www.mediapart.fr/article",
      },
      NOW
    );
    expect(result).toEqual({ id: "evt_rev", status: "PUBLISHED" });
    const data = db.affairEvent.create.mock.calls[0]![0].data;
    expect(data).toMatchObject({
      affairId: "aff_1",
      identityKey: "key_1",
      type: "REVELATION",
      datePrecision: "DAY",
      occurrence: "HELD",
      sourceKind: "PRESS",
      status: "PUBLISHED",
      publishedAt: NOW,
    });
    expect(data.date).toEqual(d("2026-10-01"));
    expect(db.$queryRaw).not.toHaveBeenCalled();
    expect(db.auditLog.create).not.toHaveBeenCalled();
  });

  it("laisse en brouillon une révélation dont la source est en http", async () => {
    db.affairEvent.create.mockResolvedValue({ id: "evt_rev", status: "DRAFT" });
    await createProposalRevelationInTx(
      tx(),
      "aff_1",
      {
        identityKey: null,
        date: d("2026-10-01"),
        title: "Révélation par la presse",
        sourceUrl: "http://www.mediapart.fr/article",
      },
      NOW
    );
    const data = db.affairEvent.create.mock.calls[0]![0].data;
    expect(data.status).toBe("DRAFT");
    expect(data.publishedAt).toBeNull();
  });
});
