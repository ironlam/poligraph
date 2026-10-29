import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");

function voteIndexColumns(map: string): string[] {
  const model = schema.match(/model Vote \{([\s\S]*?)\n\}/);
  if (!model) throw new Error("model Vote introuvable dans schema.prisma");
  const line = model[1]!.split("\n").find((l) => l.includes(`map: "${map}"`));
  if (!line) throw new Error(`index ${map} introuvable sur Vote`);
  const columns = line.match(/@@index\(\[([^\]]*)\]/);
  if (!columns) throw new Error(`colonnes de ${map} illisibles`);
  return columns[1]!.split(",").map((c) => c.trim().replace(/\(.*\)$/, ""));
}

describe("index couvrant de la répartition des positions par chambre", () => {
  // getPoliticianVotingStats groups a politician's votes by position, filtered on chamber
  // and votingDate. Without position in the index, Postgres fetches one heap page per vote
  // (1.4 s cold on a deputy with 8 600 votes).
  it("couvre le filtre et la clé de regroupement du groupBy", () => {
    expect(voteIndexColumns("Vote_politicianId_chamber_votingDate_idx")).toEqual([
      "politicianId",
      "chamber",
      "votingDate",
      "position",
    ]);
  });
});
