import { describe, expect, it } from "vitest";
import {
  SENATE_VOTE_CORRECTIONS,
  type SenateVoteCorrection,
} from "@/config/senate-vote-corrections";
import { applySenateVoteCorrections } from "@/lib/votes/senate-corrections";
import { assessSenateVoteSource, type SenateSourceVote } from "@/lib/votes/senate-participation";

const votes: SenateSourceVote[] = [
  { matricule: "A", vote: "p", siege: 1 },
  { matricule: "B", vote: "c", siege: 2 },
  { matricule: "C", vote: "a", siege: 3 },
  { matricule: "D", vote: "n", siege: 4 },
  { matricule: "E", vote: "p", siege: 5 },
];

// Le fichier compte E « pour », la page officielle le compte parmi les non-participants.
const official = { voters: 3, nonVoters: 2, votesFor: 1, votesAgainst: 1, votesAbstain: 1 };

const correction = (overrides: Partial<SenateVoteCorrection> = {}): SenateVoteCorrection => ({
  scrutin: "SENAT-2025-1",
  matricule: "E",
  from: "p",
  to: "n",
  reason: "test",
  certain: true,
  ...overrides,
});

describe("corrections du fichier nominatif du Sénat", () => {
  it("change la ligne attendue et rend le scrutin conforme aux totaux officiels", () => {
    expect(assessSenateVoteSource(votes, official)).toMatchObject({
      status: "INCOMPLETE",
      reason: "totals_mismatch",
    });

    const corrected = applySenateVoteCorrections("SENAT-2025-1", votes, [correction()]);

    expect(corrected.find((vote) => vote.matricule === "E")?.vote).toBe("n");
    expect(assessSenateVoteSource(corrected, official)).toMatchObject({ status: "COMPLETE" });
  });

  it("ne touche pas aux autres lignes ni au tableau d'origine", () => {
    const corrected = applySenateVoteCorrections("SENAT-2025-1", votes, [correction()]);

    expect(corrected.filter((vote) => vote.matricule !== "E")).toEqual(votes.slice(0, 4));
    expect(votes[4]?.vote).toBe("p");
  });

  it("laisse le fichier tel quel quand le Sénat l'a corrigé", () => {
    const alreadyFixed = votes.map((vote) =>
      vote.matricule === "E" ? { ...vote, vote: "n" } : vote
    );

    expect(applySenateVoteCorrections("SENAT-2025-1", alreadyFixed, [correction()])).toEqual(
      alreadyFixed
    );
  });

  it("ne s'applique qu'au scrutin visé", () => {
    expect(applySenateVoteCorrections("SENAT-2025-2", votes, [correction()])).toBe(votes);
  });

  it("n'invente pas de ligne quand le matricule est absent du fichier", () => {
    const corrected = applySenateVoteCorrections("SENAT-2025-1", votes, [
      correction({ matricule: "Z" }),
    ]);

    expect(corrected).toEqual(votes);
  });

  it("compare le code de vote sans tenir compte de la casse", () => {
    const upper = votes.map((vote) => ({ ...vote, vote: vote.vote.toUpperCase() }));

    const corrected = applySenateVoteCorrections("SENAT-2025-1", upper, [correction()]);

    expect(corrected.find((vote) => vote.matricule === "E")?.vote).toBe("n");
  });
});

describe("table des corrections", () => {
  it("couvre 30 scrutins par 32 corrections", () => {
    expect(SENATE_VOTE_CORRECTIONS).toHaveLength(32);
    expect(new Set(SENATE_VOTE_CORRECTIONS.map((entry) => entry.scrutin)).size).toBe(30);
  });

  it("reste cohérente : une correction par ligne, matricule et codes valides", () => {
    const keys = SENATE_VOTE_CORRECTIONS.map((entry) => `${entry.scrutin}/${entry.matricule}`);
    expect(new Set(keys).size).toBe(keys.length);

    for (const entry of SENATE_VOTE_CORRECTIONS) {
      expect(entry.scrutin).toMatch(/^SENAT-20\d{2}-\d+$/);
      expect(entry.matricule).toMatch(/^\d{5}[A-Z]$/);
      expect(entry.from).not.toBe(entry.to);
      expect(["p", "c", "a", "n"]).toContain(entry.from);
      expect(["p", "c", "a", "n"]).toContain(entry.to);
      expect(entry.reason.length).toBeGreaterThan(0);
    }
  });

  it("distingue les lignes dont la page ne donne pas le motif", () => {
    const uncertain = SENATE_VOTE_CORRECTIONS.filter((entry) => !entry.certain);

    expect(uncertain.map((entry) => `${entry.scrutin}/${entry.matricule}`).sort()).toEqual([
      "SENAT-2024-196/11074Q",
      "SENAT-2024-196/20070A",
      "SENAT-2024-93/14229S",
      "SENAT-2025-293/21076L",
    ]);
  });
});
