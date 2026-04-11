import { describe, it, expect } from "vitest";
import { scoreAffairAgainstCandidates } from "../resolver";
import type { AffairCandidateRecord, AffairScoringInput } from "../signals/types";
import { SourceType } from "@/generated/prisma";

function politician(overrides: Partial<AffairCandidateRecord>): AffairCandidateRecord {
  return {
    id: "pol",
    firstName: "Jean",
    lastName: "Dupont",
    fullName: "Jean Dupont",
    normalizedLastName: "dupont",
    birthDate: null,
    deathDate: null,
    civility: null,
    departments: [],
    mandates: [],
    parties: [],
    externalIds: {},
    ...overrides,
  };
}

describe("scoreAffairAgainstCandidates", () => {
  it("returns SAME when one candidate has strong signals and a big gap", () => {
    const input: AffairScoringInput = {
      text: "Le maire de Lyon, Jean Dupont, a été mis en examen par le tribunal de Lyon pour détournement. La cour de cassation examinera l'affaire.",
      metadata: {
        source: SourceType.PRESSE,
        court: "Tribunal de Lyon",
      },
    };

    const candidates: AffairCandidateRecord[] = [
      politician({
        id: "winner",
        mandates: [
          {
            type: "MAIRE",
            roleLabel: "Maire",
            location: "Lyon",
            startDate: new Date("2014-01-01"),
            endDate: null,
          },
        ],
      }),
      politician({
        id: "homonym",
        lastName: "Dupont",
        normalizedLastName: "dupont",
      }),
    ];

    const decision = scoreAffairAgainstCandidates(input, candidates);
    expect(decision.judgment).toBe("SAME");
    expect(decision.topCandidateId).toBe("winner");
  });

  it("returns NO_MATCH when foreign context dominates", () => {
    const input: AffairScoringInput = {
      text: "Le maire de Madrid a été interpellé par la police espagnole à Barcelone.",
      metadata: { source: SourceType.PRESSE },
    };

    const candidates: AffairCandidateRecord[] = [
      politician({ id: "pol1", lastName: "Mendez", normalizedLastName: "mendez" }),
    ];

    const decision = scoreAffairAgainstCandidates(input, candidates);
    expect(decision.judgment).toBe("NO_MATCH");
  });

  it("returns UNDECIDED when two candidates have close scores", () => {
    const input: AffairScoringInput = {
      text: "Jean Dupont aurait reçu des fonds non déclarés selon l'enquête.",
      metadata: { source: SourceType.PRESSE },
    };

    const candidates: AffairCandidateRecord[] = [
      politician({ id: "pol1" }),
      politician({ id: "pol2" }),
    ];

    const decision = scoreAffairAgainstCandidates(input, candidates);
    expect(decision.judgment).toBe("UNDECIDED");
  });
});
