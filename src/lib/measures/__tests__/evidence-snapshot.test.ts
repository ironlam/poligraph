import { describe, expect, it } from "vitest";
import {
  createV6CorrectionFingerprint,
  EvidenceSnapshotV3Schema,
  readEvidenceSnapshot,
  validateRevisionEvidence,
} from "../evidence-snapshot";
import { validEvidenceSnapshot } from "./evidence-snapshot-fixture";

describe("EvidenceSnapshotV3 persistant", () => {
  it("accepte un snapshot V3 valide et son roundtrip JSON", () => {
    const snapshot = validEvidenceSnapshot();
    const serialized = JSON.stringify(snapshot);

    expect(EvidenceSnapshotV3Schema.parse(snapshot)).toEqual(snapshot);
    expect(readEvidenceSnapshot(JSON.parse(serialized))).toEqual({ status: "VALID", snapshot });
  });

  it("refuse un hash de bundle incohérent", () => {
    const snapshot = validEvidenceSnapshot();
    snapshot.canonicalEvidenceHash = "a".repeat(64);

    expect(readEvidenceSnapshot(snapshot).status).toBe("INVALID");
  });

  it("refuse une version inconnue", () => {
    const snapshot = { ...validEvidenceSnapshot(), schemaVersion: "evidence-snapshot/v4" };

    expect(readEvidenceSnapshot(snapshot).status).toBe("INVALID");
  });

  it("refuse un anchor absent de la partition des unités", () => {
    const snapshot = validEvidenceSnapshot();
    snapshot.commitmentAnchorIds = ["pdf-99-1-u001"];

    expect(readEvidenceSnapshot(snapshot).status).toBe("INVALID");
  });

  it("refuse une unité manquante", () => {
    const snapshot = validEvidenceSnapshot();
    snapshot.units.pop();

    expect(readEvidenceSnapshot(snapshot).status).toBe("INVALID");
  });

  it("refuse une unité modifiée sans mise à jour de ses hashes", () => {
    const snapshot = validEvidenceSnapshot();
    const [unit] = snapshot.units;
    if (!unit) throw new Error("Fixture V3 sans unité");
    unit.rawExactText = "Texte remplacé après extraction.";

    expect(readEvidenceSnapshot(snapshot).status).toBe("INVALID");
  });

  it("refuse V6 sans snapshot ou avec un snapshot invalide", () => {
    expect(validateRevisionEvidence({ importEngine: "V6" })).toEqual({
      ok: false,
      reason: "MISSING_VALID_EVIDENCE_SNAPSHOT",
    });
    expect(validateRevisionEvidence({ importEngine: "V6", evidenceSnapshot: {} })).toEqual({
      ok: false,
      reason: "MISSING_VALID_EVIDENCE_SNAPSHOT",
    });
  });

  it("admet le futur chemin DRAFT V6 avec un snapshot V3 valide", () => {
    const result = validateRevisionEvidence({
      importEngine: "V6",
      evidenceSnapshot: validEvidenceSnapshot(),
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.evidenceSnapshot).toEqual(validEvidenceSnapshot());
  });

  it("préserve la compatibilité V5 et historique sans snapshot", () => {
    expect(validateRevisionEvidence({ importEngine: "V5" })).toEqual({
      ok: true,
      evidenceSnapshot: undefined,
    });
    expect(validateRevisionEvidence({})).toEqual({
      ok: true,
      evidenceSnapshot: undefined,
    });
  });

  it("refuse aussi un snapshot arbitraire fourni par un chemin non V6", () => {
    expect(validateRevisionEvidence({ importEngine: "V5", evidenceSnapshot: {} })).toEqual({
      ok: false,
      reason: "INVALID_EVIDENCE_SNAPSHOT",
    });
  });

  it("conserve le texte brut, le canonique, les pages et les rôles numériques", () => {
    const result = readEvidenceSnapshot(validEvidenceSnapshot());

    expect(result.status).toBe("VALID");
    if (result.status !== "VALID") return;
    const [unit] = result.snapshot.units;
    if (!unit) throw new Error("Snapshot V3 sans unité");
    expect(result.snapshot.pages).toEqual([12, 13]);
    expect(unit.rawExactText).not.toBe(unit.canonicalText);
    expect(unit.numbers).toEqual([
      { raw: "2", normalized: "2", role: "STRUCTURAL" },
      { raw: "67", normalized: "67", role: "CONTENT" },
    ]);
  });
});

describe("createV6CorrectionFingerprint", () => {
  it("produit une clé stable propre au texte corrigé et à sa révision source", () => {
    const first = createV6CorrectionFingerprint({
      previousRevisionId: "revision-source",
      text: "  Encadrer les loyers.  ",
    });

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(
      createV6CorrectionFingerprint({
        previousRevisionId: "revision-source",
        text: "Encadrer les loyers.",
      })
    ).toBe(first);
    expect(
      createV6CorrectionFingerprint({
        previousRevisionId: "revision-source",
        text: "Plafonner les loyers.",
      })
    ).not.toBe(first);
    expect(
      createV6CorrectionFingerprint({
        previousRevisionId: "revision-source",
        text: "Encadrer les loyers.",
        details: "Le document précise le périmètre de la mesure.",
      })
    ).not.toBe(first);
  });
});
