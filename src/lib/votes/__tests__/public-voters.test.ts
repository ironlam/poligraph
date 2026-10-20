import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { publicVotes } from "../public-voters";

const vote = (id: string, publicationStatus: string) => ({
  id,
  position: "POUR" as const,
  politician: { slug: `slug-${id}`, fullName: `Nom ${id}`, publicationStatus },
});

describe("publicVotes", () => {
  it("ne garde que les votes d'une fiche publiée", () => {
    const votes = [vote("a", "PUBLISHED"), vote("b", "DRAFT"), vote("c", "ARCHIVED")];

    expect(publicVotes(votes).map((v) => v.id)).toEqual(["a"]);
  });

  it("n'expose ni le nom ni le lien d'une fiche en brouillon", () => {
    const named = publicVotes([vote("b", "DRAFT")]);

    expect(JSON.stringify(named)).not.toContain("Nom b");
    expect(JSON.stringify(named)).not.toContain("slug-b");
  });

  it("laisse intact le tableau d'origine, utilisé pour compter la couverture", () => {
    const votes = [vote("a", "PUBLISHED"), vote("b", "DRAFT")];
    publicVotes(votes);

    expect(votes).toHaveLength(2);
  });
});

describe("page /parlement/votes/[slug]", () => {
  const source = readFileSync(
    join(process.cwd(), "src/app/parlement/votes/[slug]/page.tsx"),
    "utf8"
  )
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("nomme les votants à travers publicVotes", () => {
    expect(source).toContain("publicVotes(scrutin.votes)");
  });

  it("ne rend jamais la liste brute des votes", () => {
    expect(source).not.toMatch(/scrutin\.votes\.reduce/);
    expect(source).not.toMatch(/scrutin\.votes\.map/);
  });
});
