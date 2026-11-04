// @vitest-environment node
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEBATE_PARSER_VERSION, extractSeanceFromXml } from "../debate-transcript-parse";
const h = vi.hoisted(() => ({ scrutin: vi.fn(), transcripts: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    scrutin: { findUnique: h.scrutin, findMany: vi.fn(async () => []) },
    debateTranscript: { findMany: h.transcripts },
    vote: { findMany: vi.fn(async () => []) },
  },
}));
vi.mock("@/services/scrutin-policy-title/substance-resolver", () => ({
  resolveSubstanceSources: vi.fn(async () => ({
    substanceDepth: "amendment",
    blocks: [
      {
        sourceType: "amendment",
        sourceId: "amd1",
        field: "Amendment.content",
        trust: "official",
        text: "Un crédit d’impôt pour les carburants d’aviation durables.",
      },
    ],
  })),
}));
vi.mock("@/services/scrutin-context-fetcher", () => ({
  fetchScrutinContext: vi.fn(async () => ({})),
}));
import {
  prepareCitizenImpactInput,
  citizenImpactSources,
} from "../generate-scrutin-citizen-impacts";
import { buildUserMessage } from "@/services/scrutin-citizen-impact";
const xml = readFileSync(
  new URL("./fixtures/discussion-commune-2024-11-07.xml", import.meta.url),
  "utf8"
);
const seance = extractSeanceFromXml(xml)!;
const target = {
  chamber: "AN",
  legislature: 17,
  votingDate: seance.date,
  officialSeanceRef: seance.seanceRef,
  amendmentLinks: [
    {
      role: "PRINCIPAL",
      amendmentId: "amd1",
      amendment: {
        number: "I-2697",
        texteRef: "PRJLANR5L17B0324",
        chamber: "AN",
        legislature: 17,
      },
    },
  ],
};
const scrutin = {
  ...target,
  id: "s1",
  slug: "s1",
  title: "l'amendement n° 2697",
  type: "AMENDEMENT",
  result: "REJECTED",
  votesFor: 1,
  votesAgainst: 2,
  votesAbstain: 0,
  dossierLegislatifId: null,
};
beforeEach(() => {
  vi.clearAllMocks();
  h.scrutin.mockImplementation(async ({ select }) => (select.officialSeanceRef ? target : scrutin));
  h.transcripts.mockResolvedValue([
    { ...seance, sourceHash: "hash", parserVersion: DEBATE_PARSER_VERSION },
  ]);
});
describe("citizen impact uses the real resolver's safe context", () => {
  it("never passes neighbouring or indeterminate speeches to the impact prompt or grounding sources", async () => {
    const prepared = (await prepareCitizenImpactInput("s1"))!;
    const prompt = buildUserMessage(prepared.input);
    expect(prompt).toContain("<debat>");
    expect(prompt).toContain("Argument commun à la discussion");
    expect(prompt).toContain("Ces amendements ont été rejetés en commission");
    for (const source of [prompt, ...citizenImpactSources(prepared)]) {
      expect(source).not.toContain("Mon opinion diverge");
      expect(source).not.toContain("S’agissant de l’accompagnement");
    }
  });
  it("retains the official measure but omits debate until the meeting refs are backfilled", async () => {
    h.scrutin.mockImplementation(async ({ select }) =>
      select.officialSeanceRef ? { ...target, officialSeanceRef: null } : scrutin
    );
    const prepared = (await prepareCitizenImpactInput("s1"))!;
    expect(prepared.canDescribeMeasure).toBe(true);
    expect(prepared.input.debateExcerpt).toBeNull();
    expect(buildUserMessage(prepared.input)).not.toContain("<debat>");
  });
});
