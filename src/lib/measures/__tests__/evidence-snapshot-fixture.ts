import { createHash } from "node:crypto";
import type { EvidenceSnapshot } from "@/services/measures/program-import/evidence-v6";

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function validEvidenceSnapshot(): EvidenceSnapshot {
  const rawAnchor = "Proposition 2  Créer un droit aux vacances pour 67 millions de personnes.";
  const canonicalAnchor =
    "Proposition 2 Créer un droit aux vacances pour 67 millions de personnes.";
  const context = "Aujourd'hui, une partie de la population ne part pas en vacances.";

  return {
    schemaVersion: "evidence-snapshot/v3",
    programEditionId: "edition-ruffin-loisirs",
    documentUrl: "https://example.org/programme-officiel.pdf",
    documentHash: sha256("document officiel"),
    pages: [12, 13],
    relation: "LOCAL",
    units: [
      {
        unitId: "pdf-12-2-u001",
        blockId: "pdf-12-2",
        page: 12,
        order: 0,
        blockOrder: 0,
        kind: "HEADING",
        role: "COMMITMENT_ANCHOR",
        rawExactText: rawAnchor,
        canonicalText: canonicalAnchor,
        rawTextHash: sha256(rawAnchor),
        canonicalTextHash: sha256(canonicalAnchor),
        provenanceStatus: "TEXT_LAYER_TRUSTED",
        provenanceReason: null,
        speaker: "DOCUMENT_AUTHOR",
        discourseRole: "OBJECTIVE",
        discourseConfidence: 0.98,
        discourseReason: "Objectif formulé par le document.",
        numbers: [
          { raw: "2", normalized: "2", role: "STRUCTURAL" },
          { raw: "67", normalized: "67", role: "CONTENT" },
        ],
      },
      {
        unitId: "pdf-13-1-u001",
        blockId: "pdf-13-1",
        page: 13,
        order: 1,
        blockOrder: 1,
        kind: "SENTENCE",
        role: "SUPPORTING_CONTEXT",
        rawExactText: context,
        canonicalText: context,
        rawTextHash: sha256(context),
        canonicalTextHash: sha256(context),
        provenanceStatus: "TEXT_LAYER_TRUSTED",
        provenanceReason: null,
        speaker: "DOCUMENT_AUTHOR",
        discourseRole: "DIAGNOSIS",
        discourseConfidence: 0.96,
        discourseReason: "Constat décrivant la situation actuelle.",
        numbers: [],
      },
    ],
    discourseAnnotations: [
      {
        unitId: "pdf-12-2-u001",
        speaker: "DOCUMENT_AUTHOR",
        discourseRole: "OBJECTIVE",
        confidence: 0.98,
        reason: "Objectif formulé par le document.",
      },
      {
        unitId: "pdf-13-1-u001",
        speaker: "DOCUMENT_AUTHOR",
        discourseRole: "DIAGNOSIS",
        confidence: 0.96,
        reason: "Constat décrivant la situation actuelle.",
      },
    ],
    commitmentAnchorIds: ["pdf-12-2-u001"],
    supportingIds: ["pdf-13-1-u001"],
    attributionBasis: "CANDIDATE_OBJECTIVE",
    canonicalEvidenceHash: sha256(`${canonicalAnchor}\n\n${context}`),
    parserVersion: "program-document-parser/7-units-v1",
    discourseExtractorVersion: "mistral-large-latest/presidential-program-discourse-1-units-v2",
    measureExtractorVersion:
      "mistral-large-latest/presidential-program-import-7-discourse-grounded-v1",
  };
}
