import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => {
  const tx = {
    affair: { findUnique: vi.fn(), update: vi.fn() },
    affairPoliticianDecision: { findMany: vi.fn() },
  };
  return {
    db: {
      ...tx,
      $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
      __tx: tx,
    },
  };
});

import { db } from "@/lib/db";
import {
  assertPublishable,
  checkPublishable,
  PublishGuardError,
  VERIFIED_BY_MODERATION,
} from "@/lib/affairs/publish-guard";

type MockTx = {
  affair: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  affairPoliticianDecision: { findMany: ReturnType<typeof vi.fn> };
};
const tx = (db as unknown as { __tx: MockTx }).__tx;

const AFFAIR = {
  id: "aff_1",
  politicianId: "pol_1",
  involvement: "DIRECT",
  involvementNote: null,
  sources: [{ url: "https://presse.example/article" }],
};

const VALID_DECISION = {
  id: "dec_ok",
  judgment: "SAME",
  reviewedAt: new Date("2026-06-01"),
  reviewedBy: "admin",
  reviewAction: "CONFIRMED",
  chosenPoliticianId: "pol_1",
};

beforeEach(() => {
  vi.clearAllMocks();
  tx.affair.findUnique.mockResolvedValue(AFFAIR);
  tx.affairPoliticianDecision.findMany.mockResolvedValue([]);
  tx.affair.update.mockResolvedValue({ id: "aff_1" });
});

describe("checkPublishable — invariant I2 (RGPD art. 10)", () => {
  it("refuse une affaire sans source", async () => {
    tx.affair.findUnique.mockResolvedValue({ ...AFFAIR, sources: [] });
    const reasons = await checkPublishable("aff_1");
    expect(reasons.map((r) => r.code)).toContain("NO_SOURCE");
  });

  it("refuse une décision SAME non revue liée par affairId", async () => {
    tx.affairPoliticianDecision.findMany.mockResolvedValue([
      { ...VALID_DECISION, reviewedAt: null, reviewedBy: null, reviewAction: null },
    ]);
    const reasons = await checkPublishable("aff_1");
    expect(reasons.map((r) => r.code)).toContain("UNREVIEWED_MATCHING_DECISION");
  });

  it("refuse une décision UNDECIDED non revue", async () => {
    tx.affairPoliticianDecision.findMany.mockResolvedValue([
      {
        ...VALID_DECISION,
        judgment: "UNDECIDED",
        reviewedAt: null,
        reviewedBy: null,
        reviewAction: null,
      },
    ]);
    const reasons = await checkPublishable("aff_1");
    expect(reasons.map((r) => r.code)).toContain("UNREVIEWED_MATCHING_DECISION");
  });

  it("reviewedAt seul sans reviewedBy ne vaut pas validation", async () => {
    tx.affairPoliticianDecision.findMany.mockResolvedValue([
      { ...VALID_DECISION, reviewedBy: null },
    ]);
    const reasons = await checkPublishable("aff_1");
    expect(reasons.map((r) => r.code)).toContain("UNREVIEWED_MATCHING_DECISION");
  });

  it("REJECTED_OUT_OF_SCOPE ne vaut pas confirmation de rattachement", async () => {
    tx.affairPoliticianDecision.findMany.mockResolvedValue([
      { ...VALID_DECISION, reviewAction: "REJECTED_OUT_OF_SCOPE" },
    ]);
    const reasons = await checkPublishable("aff_1");
    expect(reasons.map((r) => r.code)).toContain("UNREVIEWED_MATCHING_DECISION");
  });

  it("refuse si chosenPoliticianId ne correspond pas au politicien de l'affaire", async () => {
    tx.affairPoliticianDecision.findMany.mockResolvedValue([
      { ...VALID_DECISION, chosenPoliticianId: "pol_AUTRE" },
    ]);
    const reasons = await checkPublishable("aff_1");
    expect(reasons.map((r) => r.code)).toContain("UNREVIEWED_MATCHING_DECISION");
  });

  it("accepte avec une décision validée (CONFIRMED, bon politicien)", async () => {
    tx.affairPoliticianDecision.findMany.mockResolvedValue([VALID_DECISION]);
    const reasons = await checkPublishable("aff_1");
    expect(reasons).toEqual([]);
  });

  it("accepte REASSIGNED et CREATED_POLITICIAN comme confirmations", async () => {
    for (const action of ["REASSIGNED", "CREATED_POLITICIAN"]) {
      tx.affairPoliticianDecision.findMany.mockResolvedValue([
        { ...VALID_DECISION, reviewAction: action },
      ]);
      expect(await checkPublishable("aff_1")).toEqual([]);
    }
  });

  it("cherche aussi les décisions orphelines par sourceRef (fallback)", async () => {
    await checkPublishable("aff_1");
    const where = tx.affairPoliticianDecision.findMany.mock.calls[0]![0].where;
    // Le where doit couvrir les deux chemins : affairId direct OU orphelines par sourceRef
    expect(JSON.stringify(where)).toContain("aff_1");
    expect(JSON.stringify(where)).toContain("https://presse.example/article");
  });

  it("affaire introuvable → erreur explicite", async () => {
    tx.affair.findUnique.mockResolvedValue(null);
    await expect(checkPublishable("aff_inconnu")).rejects.toThrow(/introuvable/);
  });
});

describe("checkPublishable — note d'implication obligatoire hors DIRECT (I3, I5)", () => {
  it("refuse un non mis en cause sans note", async () => {
    tx.affair.findUnique.mockResolvedValue({
      ...AFFAIR,
      involvement: "VICTIM",
      involvementNote: null,
    });
    const reasons = await checkPublishable("aff_1");
    expect(reasons.map((r) => r.code)).toContain("MISSING_INVOLVEMENT_NOTE");
  });

  it("refuse une note vide ou en espaces", async () => {
    tx.affair.findUnique.mockResolvedValue({
      ...AFFAIR,
      involvement: "MENTIONED_ONLY",
      involvementNote: "   ",
    });
    const reasons = await checkPublishable("aff_1");
    expect(reasons.map((r) => r.code)).toContain("MISSING_INVOLVEMENT_NOTE");
  });

  it("accepte un non mis en cause avec note renseignée", async () => {
    tx.affair.findUnique.mockResolvedValue({
      ...AFFAIR,
      involvement: "PLAINTIFF",
      involvementNote: "À l'origine de la plainte pour violation du secret de l'enquête.",
    });
    const reasons = await checkPublishable("aff_1");
    expect(reasons.map((r) => r.code)).not.toContain("MISSING_INVOLVEMENT_NOTE");
  });

  it("n'exige pas de note pour un mis en cause (DIRECT)", async () => {
    const reasons = await checkPublishable("aff_1");
    expect(reasons.map((r) => r.code)).not.toContain("MISSING_INVOLVEMENT_NOTE");
  });

  it("assertPublishable refuse et n'écrit rien sans note (non mis en cause)", async () => {
    tx.affair.findUnique.mockResolvedValue({
      ...AFFAIR,
      involvement: "VICTIM",
      involvementNote: null,
    });
    await expect(
      assertPublishable("aff_1", { verifiedBy: VERIFIED_BY_MODERATION })
    ).rejects.toBeInstanceOf(PublishGuardError);
    expect(tx.affair.update).not.toHaveBeenCalled();
  });
});

describe("assertPublishable — écriture atomique", () => {
  it("écrit PUBLISHED + verifiedAt + verifiedBy dans la même mutation", async () => {
    await assertPublishable("aff_1", { verifiedBy: VERIFIED_BY_MODERATION });
    expect(tx.affair.update).toHaveBeenCalledTimes(1);
    const arg = tx.affair.update.mock.calls[0]![0];
    expect(arg.where).toEqual({ id: "aff_1" });
    expect(arg.data.publicationStatus).toBe("PUBLISHED");
    expect(arg.data.verifiedAt).toBeInstanceOf(Date);
    expect(arg.data.verifiedBy).toBe(VERIFIED_BY_MODERATION);
  });

  it("refuse et n'écrit RIEN si une raison de blocage existe", async () => {
    tx.affair.findUnique.mockResolvedValue({ ...AFFAIR, sources: [] });
    await expect(
      assertPublishable("aff_1", { verifiedBy: VERIFIED_BY_MODERATION })
    ).rejects.toBeInstanceOf(PublishGuardError);
    expect(tx.affair.update).not.toHaveBeenCalled();
  });

  it("la vérification et l'écriture passent par la même transaction", async () => {
    await assertPublishable("aff_1", { verifiedBy: VERIFIED_BY_MODERATION });
    expect(vi.mocked(db.$transaction)).toHaveBeenCalledTimes(1);
  });
});

/**
 * La garde annonçait « non validée(s) par un humain » et testait `reviewedBy !== null`.
 * `auto-triage` la franchissait donc : trois affaires publiées reposent sur un
 * rattachement que seule la machine a confirmé (Estrosi, Massondo, Pedehontaa, mesuré le
 * 2026-08-02, 60 confirmations automatiques au registre).
 *
 * L'assistance reste légitime, et c'est même 69 % des revues de ce registre. Ce qui ne
 * l'était pas, c'est qu'une garde promette une chose et en vérifie une autre.
 */
describe("checkPublishable — humain contre assistance", () => {
  beforeEach(() => {
    tx.affair.findUnique.mockResolvedValue(AFFAIR);
  });

  it("une confirmation par assistance ne publie pas", async () => {
    tx.affairPoliticianDecision.findMany.mockResolvedValue([
      { ...VALID_DECISION, reviewedBy: "auto-triage" },
    ]);

    const reasons = await checkPublishable("aff_1");

    expect(reasons.map((r) => r.code)).toContain("ASSISTED_MATCHING_DECISION");
  });

  // Deux situations distinctes pour le modérateur : « personne n'a regardé » demande un
  // examen, « la machine a dit oui » demande un arbitrage. Les confondre sous un seul
  // message est ce qui a rendu le blocage illisible.
  it("distingue jamais validé de validé par assistance", async () => {
    tx.affairPoliticianDecision.findMany.mockResolvedValue([
      { ...VALID_DECISION, id: "dec_auto", reviewedBy: "auto-triage" },
      { ...VALID_DECISION, id: "dec_rien", reviewedAt: null, reviewedBy: null },
    ]);

    const reasons = await checkPublishable("aff_1");
    const assisted = reasons.find((r) => r.code === "ASSISTED_MATCHING_DECISION");
    const never = reasons.find((r) => r.code === "UNREVIEWED_MATCHING_DECISION");

    expect(assisted).toBeDefined();
    expect(never).toBeDefined();
    expect(assisted!.code === "ASSISTED_MATCHING_DECISION" && assisted!.decisionIds).toEqual([
      "dec_auto",
    ]);
    expect(never!.code === "UNREVIEWED_MATCHING_DECISION" && never!.decisionIds).toEqual([
      "dec_rien",
    ]);
  });

  it("une confirmation humaine publie", async () => {
    tx.affairPoliticianDecision.findMany.mockResolvedValue([VALID_DECISION]);

    const reasons = await checkPublishable("aff_1");

    expect(reasons.map((r) => r.code)).not.toContain("ASSISTED_MATCHING_DECISION");
    expect(reasons.map((r) => r.code)).not.toContain("UNREVIEWED_MATCHING_DECISION");
  });

  // Le sens de la liste est délibéré : un réviseur automatique ajouté demain est assisté
  // par défaut, sans qu'on ait à y penser. L'inverse le laisserait publier tout seul.
  it("un réviseur inconnu est traité comme assisté, pas comme humain", async () => {
    tx.affairPoliticianDecision.findMany.mockResolvedValue([
      { ...VALID_DECISION, reviewedBy: "auto-triage-v3" },
    ]);

    const reasons = await checkPublishable("aff_1");

    expect(reasons.map((r) => r.code)).toContain("ASSISTED_MATCHING_DECISION");
  });

  it("le message ne promet plus l'humain là où il ne l'exige pas", async () => {
    tx.affairPoliticianDecision.findMany.mockResolvedValue([
      { ...VALID_DECISION, reviewedBy: "auto-triage" },
    ]);

    const [reason] = await checkPublishable("aff_1");

    expect(reason!.message).toMatch(/assistance automatique/);
    expect(reason!.message).toMatch(/à valider par un humain/);
  });
});
