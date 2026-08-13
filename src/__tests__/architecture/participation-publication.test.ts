import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("architecture de publication de la participation", () => {
  it("borne le producteur persistant de participation à l'Assemblée nationale", () => {
    const source = withoutComments(readFileSync("src/services/sync/compute-stats.ts", "utf8"));
    const producer = source.match(
      /async function computePoliticianParticipation[\s\S]*?(?=async function computeDissidenceData)/
    )?.[0];

    expect(producer).toBeDefined();
    expect(producer).toContain("m.type = 'DEPUTE'");
    expect(producer).not.toContain("SENATEUR");
  });

  it("la frontière API réutilise le service fail-closed sans recalcul local", () => {
    const source = withoutComments(
      readFileSync("src/app/api/politiques/[slug]/votes/route.ts", "utf8")
    );

    expect(source).toContain("getPoliticianVotingStats(politician.id)");
    expect(source).not.toMatch(/participationRate\s*[:=].*[\/\*+-]/);
  });
});
