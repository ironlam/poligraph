import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  findScrutins: vi.fn(),
  generateOne: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: { scrutin: { findMany: h.findScrutins } } }));
vi.mock("@/services/scrutin-policy-title", () => ({ generateScrutinPolicyTitle: h.generateOne }));
vi.mock("@/config/rate-limits", () => ({ AI_RATE_LIMIT_MS: 0, AI_429_BACKOFF_MS: 0 }));

import {
  generateScrutinPolicyTitles,
  MAX_CONSECUTIVE_INVALID_OUTPUTS,
} from "../generate-scrutin-policy-titles";

const invalid = (id: string) => ({
  scrutinId: id,
  outcome: "fallback",
  warnings: [{ code: "LLM_OUTPUT_INVALID", severity: "blocker", message: "Sortie LLM invalide" }],
});
const generated = (id: string) => ({ scrutinId: id, outcome: "generated", warnings: [] });
const noSubstance = (id: string) => ({
  scrutinId: id,
  outcome: "fallback",
  warnings: [{ code: "NO_SUBSTANCE_FOUND", severity: "warn", message: "Aucune substance" }],
});

describe("generateScrutinPolicyTitles, arrêt sur sorties inutilisables", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.findScrutins.mockResolvedValue(Array.from({ length: 30 }, (_, i) => ({ id: `s${i}` })));
  });

  it("s'arrête après trois sorties invalides d'affilée au lieu de parcourir les trente", async () => {
    h.generateOne.mockImplementation(async (id: string) => invalid(id));

    const stats = await generateScrutinPolicyTitles({ limit: 30 });

    expect(MAX_CONSECUTIVE_INVALID_OUTPUTS).toBe(3);
    expect(h.generateOne).toHaveBeenCalledTimes(3);
    expect(stats).toMatchObject({ processed: 3, fallbacks: 3, aborted: "LLM_OUTPUT_INVALID" });
  });

  it("ne s'arrête pas quand un titre généré sépare deux sorties invalides", async () => {
    h.generateOne.mockImplementation(async (id: string) =>
      Number(id.slice(1)) % 3 === 2 ? generated(id) : invalid(id)
    );

    const stats = await generateScrutinPolicyTitles({ limit: 30 });

    expect(h.generateOne).toHaveBeenCalledTimes(30);
    expect(stats.aborted).toBeUndefined();
    expect(stats).toMatchObject({ processed: 30, generated: 10, fallbacks: 20 });
  });

  it("ne confond pas un scrutin sans substance avec une sortie de modèle invalide", async () => {
    h.generateOne.mockImplementation(async (id: string) => noSubstance(id));

    const stats = await generateScrutinPolicyTitles({ limit: 30 });

    expect(h.generateOne).toHaveBeenCalledTimes(30);
    expect(stats.aborted).toBeUndefined();
  });
});
