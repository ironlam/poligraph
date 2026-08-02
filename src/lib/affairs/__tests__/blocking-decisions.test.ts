import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  db: {
    affairPoliticianDecision: { findMany: vi.fn() },
    politician: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ db: h.db }));

import { loadBlockingDecisions } from "@/lib/affairs/blocking-decisions";

const db = h.db;

function decision(overrides: Record<string, unknown> = {}) {
  return {
    id: "dec_1",
    judgment: "SAME",
    source: "PRESSE",
    sourceRef: "https://www.lemonde.fr/article",
    candidateText: "Un juge ordonne à Gérald Darmanin de mettre fin aux violences.",
    topCandidates: [
      {
        candidateId: "pol_1",
        totalScore: 8.7,
        signals: [
          {
            signalId: "name-quality",
            logLikelihoodRatio: 5.2,
            explanation: 'Full name "Gérald Darmanin" found',
          },
          { signalId: "temporal-mandate", logLikelihoodRatio: 2 },
          { signalId: "party-context", logLikelihoodRatio: -1.5, explanation: "Party mismatch" },
          {
            signalId: "jurisdiction",
            logLikelihoodRatio: 0,
            explanation: "Neutre, ne doit pas apparaître",
          },
        ],
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.politician.findMany.mockResolvedValue([{ id: "pol_1", fullName: "Gérald Darmanin" }]);
});

/**
 * Issue UX : la garde renvoyait des `decisionIds` que la page aplatissait en phrase, et la
 * page de revue ne filtre que par onglet en paginant par 20. Le modérateur apprenait qu'une
 * décision le bloquait sans aucun moyen de l'atteindre. Ce chargeur porte de quoi juger sur
 * place, donc il doit porter le TEXTE, pas seulement des identifiants.
 */
describe("loadBlockingDecisions", () => {
  it("ne requête rien quand il n'y a rien à charger", async () => {
    expect(await loadBlockingDecisions([])).toEqual([]);
    expect(db.affairPoliticianDecision.findMany).not.toHaveBeenCalled();
  });

  it("porte le texte de presse, qui est ce qu'un humain doit juger", async () => {
    db.affairPoliticianDecision.findMany.mockResolvedValue([decision()]);

    const [d] = await loadBlockingDecisions(["dec_1"]);

    expect(d!.excerpt).toContain("Gérald Darmanin");
    expect(d!.sourceRef).toBe("https://www.lemonde.fr/article");
  });

  // Le candidat stocké ne porte qu'un cuid : sans jointure, le panneau afficherait un
  // identifiant et ne permettrait de juger rien du tout.
  it("résout le nom du candidat, absent du JSON stocké", async () => {
    db.affairPoliticianDecision.findMany.mockResolvedValue([decision()]);

    const [d] = await loadBlockingDecisions(["dec_1"]);

    expect(d!.candidates[0]!.fullName).toBe("Gérald Darmanin");
    expect(d!.candidates[0]!.score).toBe(8.7);
  });

  it("sépare ce qui plaide pour et ce qui plaide contre", async () => {
    db.affairPoliticianDecision.findMany.mockResolvedValue([decision()]);

    const [d] = await loadBlockingDecisions(["dec_1"]);

    expect(d!.candidates[0]!.supporting).toEqual([
      'Full name "Gérald Darmanin" found',
      "temporal-mandate",
    ]);
    expect(d!.candidates[0]!.opposing).toEqual(["Party mismatch"]);
  });

  // Un signal neutre n'aide pas à trancher et allonge le panneau pour rien.
  it("écarte les signaux neutres", async () => {
    db.affairPoliticianDecision.findMany.mockResolvedValue([decision()]);

    const [d] = await loadBlockingDecisions(["dec_1"]);
    const all = [...d!.candidates[0]!.supporting, ...d!.candidates[0]!.opposing];

    expect(all).not.toContain("Neutre, ne doit pas apparaître");
  });

  it("le dit quand le politicien candidat n'existe plus", async () => {
    db.affairPoliticianDecision.findMany.mockResolvedValue([decision()]);
    db.politician.findMany.mockResolvedValue([]);

    const [d] = await loadBlockingDecisions(["dec_1"]);

    expect(d!.candidates[0]!.fullName).toBe("(politicien introuvable)");
  });

  it("survit à une décision sans candidat", async () => {
    db.affairPoliticianDecision.findMany.mockResolvedValue([decision({ topCandidates: null })]);

    const [d] = await loadBlockingDecisions(["dec_1"]);

    expect(d!.candidates).toEqual([]);
  });

  it("borne l'extrait pour qu'il tienne sous un message d'erreur", async () => {
    db.affairPoliticianDecision.findMany.mockResolvedValue([
      decision({ candidateText: "mot ".repeat(500) }),
    ]);

    const [d] = await loadBlockingDecisions(["dec_1"]);

    expect(d!.excerpt.length).toBeLessThanOrEqual(600);
  });

  it("normalise les blancs du texte stocké", async () => {
    db.affairPoliticianDecision.findMany.mockResolvedValue([
      decision({ candidateText: "Un  titre\n\nsur   plusieurs\tlignes" }),
    ]);

    const [d] = await loadBlockingDecisions(["dec_1"]);

    expect(d!.excerpt).toBe("Un titre sur plusieurs lignes");
  });
});
