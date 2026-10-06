import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { CERTAINTY_LABELS } from "@/config/certainty";
import { ATTRIBUTION_ROWS } from "@/lib/affairs/__tests__/fixtures/attribution";

vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/components/motion/FadeIn", () => ({
  FadeIn: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import type { WeeklyRecapData } from "@/lib/data/recap";
import { RecapView } from "../RecapView";

const witness = ATTRIBUTION_ROWS.find((r) => r.key === "indirectWitnessConvicted")!;
const WEEK_START = new Date("2026-08-10T00:00:00.000Z");

function recapWithWitnessOnly(): WeeklyRecapData {
  return {
    weekStart: WEEK_START,
    weekEnd: new Date("2026-08-17T00:00:00.000Z"),
    votes: { scrutins: [], adopted: 0, rejected: 0, total: 0 },
    activity: { topVoters: [] },
    affairs: {
      newAffairs: [
        {
          slug: "affaire-temoin",
          title: "Affaire de test témoin",
          involvement: witness.involvement,
          certaintyLevel: null,
          politicianName: "Élu de test",
          politicianSlug: "elu-de-test",
        },
      ],
      total: 1,
    },
    factChecks: { total: 0, trueCount: 0, falseCount: 0, mixedCount: 0, topPoliticians: [] },
    press: {
      articleCount: 0,
      topPoliticians: [],
      storiesOfTheWeek: [],
      byPolitician: [],
      byAffair: [],
    },
    platformUpdates: { updates: [], total: 0 },
  };
}

describe("RecapView : un témoin n'est pas présenté comme mis en cause", () => {
  it("affiche le rôle du témoin et aucun libellé de certitude", () => {
    const { container } = render(
      <RecapView weekStart={WEEK_START} data={recapWithWitnessOnly()} />
    );
    const text = container.textContent ?? "";
    expect(text).toContain("Affaire de test témoin");
    expect(text).toContain("Témoin/Secondaire");
    for (const label of Object.values(CERTAINTY_LABELS)) expect(text).not.toContain(label);
  });
});
