import { beforeEach, describe, expect, it, vi } from "vitest";
import { INVOLVEMENT_LABELS } from "@/config/labels";
import { ATTRIBUTION_ROWS } from "@/lib/affairs/__tests__/fixtures/attribution";

const mocks = vi.hoisted(() => ({ politicianFindFirst: vi.fn() }));

vi.mock("@/lib/db", () => ({
  db: { politician: { findFirst: mocks.politicianFindFirst } },
}));

import { matchPattern } from "./patterns";
import { AFFAIR_STATUS_LABELS } from "./helpers";

const witness = ATTRIBUTION_ROWS.find((r) => r.key === "indirectWitnessConvicted")!;
const accused = ATTRIBUTION_ROWS.find((r) => r.key === "directPenalMiseEnExamen")!;

const WITNESS_TITLE = "Affaire de test où il est témoin";
const ACCUSED_TITLE = "Affaire de test où il est mis en cause";
const PRESUMPTION = "bénéficie de la présomption d'innocence";

function affair(title: string, row: typeof witness) {
  return {
    title,
    status: row.status,
    involvement: row.involvement,
    description: "Faits décrits par les sources.",
    factsDate: null,
    sources: [],
  };
}

function politicianWith(affairs: ReturnType<typeof affair>[]) {
  return {
    civility: "M.",
    fullName: "Élu Test",
    slug: "elu-test",
    birthDate: null,
    deathDate: null,
    currentParty: null,
    mandates: [],
    declarations: [],
    affairs,
  };
}

/** Ligne du contexte qui porte ce titre. */
function lineOf(context: string, title: string): string {
  const line = context.split("\n").find((l) => l.includes(title));
  if (!line) throw new Error(`ligne introuvable : ${title}`);
  return line;
}

describe("chat : le statut d'une affaire n'est attribué qu'au mis en cause", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  for (const query of ["affaires de Élu Test", "qui est Élu Test"]) {
    describe(query, () => {
      it("la ligne du témoin porte son rôle, pas le statut de l'affaire", async () => {
        mocks.politicianFindFirst.mockResolvedValue(
          politicianWith([affair(ACCUSED_TITLE, accused), affair(WITNESS_TITLE, witness)])
        );

        const context = (await matchPattern(query))!;

        const witnessLine = lineOf(context, WITNESS_TITLE);
        expect(witnessLine).toContain(INVOLVEMENT_LABELS.INDIRECT);
        expect(witnessLine).not.toContain(AFFAIR_STATUS_LABELS[witness.status]!);

        const accusedLine = lineOf(context, ACCUSED_TITLE);
        expect(accusedLine).toContain(AFFAIR_STATUS_LABELS[accused.status]!);
        expect(accusedLine).not.toContain(INVOLVEMENT_LABELS.INDIRECT);
        expect(context).toContain(PRESUMPTION);
      });

      it("pas de rappel de présomption d'innocence pour un simple témoin", async () => {
        // Statut non définitif pour le témoin : l'ancien calcul déclenchait le rappel.
        mocks.politicianFindFirst.mockResolvedValue(
          politicianWith([affair(WITNESS_TITLE, { ...witness, status: "MISE_EN_EXAMEN" })])
        );

        const context = (await matchPattern(query))!;

        expect(lineOf(context, WITNESS_TITLE)).toContain(INVOLVEMENT_LABELS.INDIRECT);
        expect(context).not.toContain(PRESUMPTION);
        expect(context).not.toContain(AFFAIR_STATUS_LABELS.MISE_EN_EXAMEN!);
      });
    });
  }
});
