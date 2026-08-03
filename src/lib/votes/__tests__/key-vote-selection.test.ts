import { describe, it, expect } from "vitest";
import {
  scoreKeyVote,
  buildKeyVotePool,
  rotationOffset,
  selectKeyVotes,
  type KeyVoteCandidate,
} from "@/lib/votes/key-vote-selection";

const NOW = new Date("2026-08-03T00:00:00Z");
const DAY = 86_400_000;

const base = (o: Partial<KeyVoteCandidate>): KeyVoteCandidate => ({
  id: "x",
  title: "Vote",
  votingDate: NOW,
  dossierLegislatifId: "d1",
  type: "FINAL",
  importanceScore: 75,
  ...o,
});

const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);

describe("scoreKeyVote", () => {
  it("ranks a higher importance above a lower one, all else equal", () => {
    expect(scoreKeyVote(base({ importanceScore: 90 }), NOW)).toBeGreaterThan(
      scoreKeyVote(base({ importanceScore: 70 }), NOW)
    );
  });

  it("ranks a decisive vote above an amendement at equal importance", () => {
    expect(scoreKeyVote(base({ type: "FINAL" }), NOW)).toBeGreaterThan(
      scoreKeyVote(base({ type: "AMENDEMENT" }), NOW)
    );
  });

  it("lets a strong older vote solennel beat a fresh borderline amendement", () => {
    const solennel = base({ importanceScore: 95, type: "FINAL", votingDate: daysAgo(45) });
    const amendement = base({ importanceScore: 70.4, type: "AMENDEMENT", votingDate: NOW });
    expect(scoreKeyVote(solennel, NOW)).toBeGreaterThan(scoreKeyVote(amendement, NOW));
  });

  it("still prefers the newer of two identical votes", () => {
    expect(scoreKeyVote(base({ votingDate: NOW }), NOW)).toBeGreaterThan(
      scoreKeyVote(base({ votingDate: daysAgo(120) }), NOW)
    );
  });

  it("treats a missing type as no procedural bonus", () => {
    expect(scoreKeyVote(base({ type: null }), NOW)).toBe(
      scoreKeyVote(base({ type: "AUTRE" }), NOW)
    );
  });
});

describe("buildKeyVotePool", () => {
  it("caps candidates per dossier", () => {
    const sorted = [
      base({ id: "a", dossierLegislatifId: "d1", title: "Article 1" }),
      base({ id: "b", dossierLegislatifId: "d1", title: "Article 2" }),
      base({ id: "c", dossierLegislatifId: "d1", title: "Article 3" }),
      base({ id: "d", dossierLegislatifId: "d2", title: "Autre texte" }),
    ];
    const pool = buildKeyVotePool(sorted, { size: 10, maxPerDossier: 2 });
    expect(pool.map((c) => c.id)).toEqual(["a", "b", "d"]);
  });

  it("never caps candidates without a dossier", () => {
    const sorted = [
      base({ id: "a", dossierLegislatifId: null, title: "Motion de censure" }),
      base({ id: "b", dossierLegislatifId: null, title: "Declaration de politique generale" }),
      base({ id: "c", dossierLegislatifId: null, title: "Motion referendaire" }),
    ];
    const pool = buildKeyVotePool(sorted, { size: 10, maxPerDossier: 1 });
    expect(pool).toHaveLength(3);
  });

  it("drops a near-duplicate of the same dossier on the same day", () => {
    const sorted = [
      base({ id: "a", title: "l'ensemble du projet de loi relatif a la protection des enfants" }),
      base({ id: "b", title: "l ensemble du projet de loi relatif a la protection des enfants" }),
    ];
    expect(buildKeyVotePool(sorted, { size: 10, maxPerDossier: 2 }).map((c) => c.id)).toEqual([
      "a",
    ]);
  });

  it("honors the pool size", () => {
    const sorted = Array.from({ length: 20 }, (_, i) =>
      base({ id: `s${i}`, dossierLegislatifId: `d${i}` })
    );
    expect(buildKeyVotePool(sorted, { size: 6, maxPerDossier: 2 })).toHaveLength(6);
  });
});

describe("rotationOffset", () => {
  it("advances by one per day", () => {
    const a = rotationOffset(NOW, 7);
    const b = rotationOffset(new Date(NOW.getTime() + DAY), 7);
    expect(b).toBe((a + 1) % 7);
  });

  it("stays stable within the same day", () => {
    expect(rotationOffset(new Date("2026-08-03T02:00:00Z"), 7)).toBe(
      rotationOffset(new Date("2026-08-03T22:00:00Z"), 7)
    );
  });

  it("wraps around the pool", () => {
    expect(rotationOffset(new Date(NOW.getTime() + 7 * DAY), 7)).toBe(rotationOffset(NOW, 7));
  });

  it("returns 0 on an empty pool", () => {
    expect(rotationOffset(NOW, 0)).toBe(0);
  });
});

describe("selectKeyVotes", () => {
  const opts = { now: NOW, gridCount: 5, poolSize: 12, maxPerDossier: 2 };

  const corpus = (): KeyVoteCandidate[] =>
    Array.from({ length: 12 }, (_, i) =>
      base({
        id: `s${i}`,
        dossierLegislatifId: `d${i}`,
        title: `Texte ${i}`,
        type: i % 2 === 0 ? "FINAL" : "AMENDEMENT",
        importanceScore: 90 - i,
        votingDate: daysAgo(i),
      })
    );

  it("returns an empty selection on no candidate", () => {
    expect(selectKeyVotes([], opts)).toEqual({ hero: null, grid: [] });
  });

  it("never repeats the hero in the grid", () => {
    const { hero, grid } = selectKeyVotes(corpus(), opts);
    expect(grid.map((c) => c.id)).not.toContain(hero!.id);
  });

  it("changes the selection from one day to the next", () => {
    const today = selectKeyVotes(corpus(), opts);
    const tomorrow = selectKeyVotes(corpus(), { ...opts, now: new Date(NOW.getTime() + DAY) });
    expect(tomorrow.hero!.id).not.toBe(today.hero!.id);
    expect(tomorrow.grid.map((c) => c.id)).not.toEqual(today.grid.map((c) => c.id));
  });

  it("keeps rotating when no new vote has been recorded for weeks", () => {
    // Frozen corpus, as during a recess: the surface must still move.
    const frozen = corpus().map((c) => ({ ...c, votingDate: daysAgo(30 + Number(c.id.slice(1))) }));
    const heroes = new Set(
      Array.from(
        { length: 6 },
        (_, d) =>
          selectKeyVotes(frozen, { ...opts, now: new Date(NOW.getTime() + d * DAY) }).hero!.id
      )
    );
    expect(heroes.size).toBeGreaterThan(1);
  });

  it("headlines a decisive vote even when amendements score higher", () => {
    const candidates = [
      base({ id: "amend", type: "AMENDEMENT", importanceScore: 99, dossierLegislatifId: "d1" }),
      base({ id: "final", type: "FINAL", importanceScore: 71, dossierLegislatifId: "d2" }),
    ];
    expect(selectKeyVotes(candidates, opts).hero!.id).toBe("final");
  });

  it("falls back to the best candidate when none is decisive", () => {
    const candidates = [
      base({ id: "a", type: "AMENDEMENT", importanceScore: 80, dossierLegislatifId: "d1" }),
      base({ id: "b", type: "ARTICLE", importanceScore: 75, dossierLegislatifId: "d2" }),
    ];
    expect(selectKeyVotes(candidates, opts).hero).not.toBeNull();
  });

  it("does not fill the hub with a single dossier", () => {
    const sameDossier = Array.from({ length: 20 }, (_, i) =>
      base({
        id: `s${i}`,
        dossierLegislatifId: "d1",
        title: `Amendement ${i}`,
        type: "AMENDEMENT",
        votingDate: daysAgo(i % 5),
      })
    );
    const { hero, grid } = selectKeyVotes(sameDossier, opts);
    expect([hero, ...grid].filter(Boolean)).toHaveLength(2);
  });
});
