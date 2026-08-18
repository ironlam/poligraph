import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MistralResponse } from "@/lib/api/mistral";

vi.mock("@/lib/api/mistral", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/api/mistral")>();
  return { ...actual, callMistral: vi.fn() };
});

import { callMistral } from "@/lib/api/mistral";
import {
  analyzeDocumentDiscourse,
  getDiscourseCacheKey,
  parseDiscoursePayload,
} from "../discourse";
import type { DocumentUnit } from "../types";
import { evaluateDiscourseDevelopment } from "./discourse-development-harness";
import {
  getRuffinDiscourseDevelopmentUnits,
  RUFFIN_DISCOURSE_DEVELOPMENT,
} from "./fixtures/ruffin-discourse-development";

function unit(id: string, order: number, text: string, kind: DocumentUnit["kind"] = "SENTENCE") {
  return {
    id,
    blockId: id.replace(/-u\d+$/u, ""),
    page: 1,
    order,
    blockOrder: order,
    text,
    kind,
    numbers: [],
    provenance: {
      status: "TEXT_LAYER_TRUSTED" as const,
      reason: null,
      extractionAllowed: true,
    },
  } satisfies DocumentUnit;
}

function response(value: unknown): MistralResponse {
  return {
    choices: [
      {
        message: { role: "assistant", content: JSON.stringify(value) },
        finish_reason: "stop",
      },
    ],
  };
}

describe("analyse du discours par unités", () => {
  beforeEach(() => vi.mocked(callMistral).mockReset());

  it("isole les annotations manquantes, dupliquées et inventées en UNRESOLVED", () => {
    const units = [
      unit("p1-b01-u001", 0, "Nous créerons une autorité."),
      unit("p1-b01-u002", 1, "Le dispositif existe depuis 2022."),
    ];
    const duplicate = {
      unitId: units[0]!.id,
      speaker: "DOCUMENT_AUTHOR",
      discourseRole: "COMMITMENT",
      confidence: 0.9,
      reason: "Action annoncée.",
    };
    const parsed = parseDiscoursePayload(
      {
        annotations: [
          duplicate,
          duplicate,
          {
            ...duplicate,
            unitId: "id-inventé",
          },
        ],
      },
      units
    );

    expect(parsed).toEqual([
      expect.objectContaining({
        unitId: units[0]!.id,
        speaker: "UNRESOLVED",
        discourseRole: "OTHER",
      }),
      expect.objectContaining({
        unitId: units[1]!.id,
        speaker: "UNRESOLVED",
        discourseRole: "OTHER",
      }),
    ]);
  });

  it("ne demande que speaker et rôle, puis réutilise le cache documentaire déterministe", async () => {
    const units = [
      unit("p11-b01-u001", 0, "Nathalie témoigne :"),
      unit("p11-b01-u002", 1, "« Nous devons travailler jusqu'à vingt heures. »", "QUOTATION"),
      unit("p11-b01-u003", 2, "Supprimer les journées hachées.", "HEADING"),
    ];
    vi.mocked(callMistral).mockResolvedValue(
      response({
        annotations: [
          {
            unitId: units[0]!.id,
            speaker: "DOCUMENT_AUTHOR",
            discourseRole: "OTHER",
            confidence: 0.94,
            reason: "Introduction d'un témoignage.",
          },
          {
            unitId: units[1]!.id,
            speaker: "QUOTED_THIRD_PARTY",
            discourseRole: "TESTIMONY",
            confidence: 0.99,
            reason: "Parole délimitée de Nathalie.",
          },
          {
            unitId: units[2]!.id,
            speaker: "DOCUMENT_AUTHOR",
            discourseRole: "COMMITMENT",
            confidence: 0.98,
            reason: "Titre d'action du document.",
          },
        ],
      })
    );
    const cacheDir = await mkdtemp(path.join(tmpdir(), "program-discourse-test-"));
    const context = {
      documentHash: "a".repeat(64),
      documentLabel: "Cahier Travail",
      documentType: "CANDIDATE_PROPOSALS_2027" as const,
      cacheDir,
    };

    const first = await analyzeDocumentDiscourse(units, context);
    const second = await analyzeDocumentDiscourse(units, context);

    expect(first).toMatchObject({ fromCache: false, modelCalls: 1 });
    expect(second).toMatchObject({ fromCache: true, modelCalls: 0 });
    expect(first.cacheKey).toBe(getDiscourseCacheKey({ documentHash: "a".repeat(64), units }));
    expect(vi.mocked(callMistral)).toHaveBeenCalledOnce();
    const prompt = vi.mocked(callMistral).mock.calls[0]![0][0]!.content;
    expect(prompt).toContain('kind="QUOTATION"');
    expect(prompt).toContain('focus="true"');
    expect(prompt).not.toContain("normalizedText");
    expect(second.discourseAnnotations[1]).toMatchObject({
      speaker: "QUOTED_THIRD_PARTY",
      discourseRole: "TESTIMONY",
    });
  });

  it("produit les deux matrices humaines séparées sur le corpus de développement consommé", () => {
    const units = getRuffinDiscourseDevelopmentUnits();
    const annotations = RUFFIN_DISCOURSE_DEVELOPMENT.map((entry, index) => ({
      unitId: units[index]!.id,
      speaker: entry.expectedSpeaker,
      discourseRole: entry.expectedRole,
      confidence: 1,
      reason: "Annotation humaine de développement.",
    }));
    const evaluation = evaluateDiscourseDevelopment(annotations);

    expect(evaluation.metrics).toEqual({
      total: 18,
      speakerCorrect: 18,
      roleCorrect: 18,
      previousErrorsFullyCorrect: 10,
      previousErrors: 10,
    });
    expect(evaluation.speakerMatrix.QUOTED_THIRD_PARTY?.QUOTED_THIRD_PARTY).toBe(2);
    expect(evaluation.roleMatrix.DIAGNOSIS?.DIAGNOSIS).toBe(4);
  });
});
