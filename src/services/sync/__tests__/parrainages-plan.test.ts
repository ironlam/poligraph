import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEPARTMENTS } from "@/config/departments";
import { parseParrainagesCsv, PARRAINAGES_COLUMNS } from "../parrainages-parse";
import {
  buildParrainageDedupeKey,
  countByCandidate,
  diffCandidateTotals,
  matchCandidacy,
  planParrainages,
} from "../parrainages-plan";
import { buildTerritoryIndex } from "../parrainages-territoires";

const extrait = readFileSync(join(__dirname, "parrainages-2022-extrait.csv"), "utf8");
const parsed = parseParrainagesCsv(extrait);
const index = buildTerritoryIndex(DEPARTMENTS, [
  { id: "02524", name: "Mont-Saint-Père", departmentCode: "02" },
]);
const election = { id: "el-2022", slug: "presidentielle-2022" };
const candidacies = [
  { id: "c-arthaud", candidateName: "Nathalie Arthaud" },
  { id: "c-lepen", candidateName: "Marine Le Pen" },
];
const base = { election, sourceUrl: "https://example.org/liste.csv", index, candidacies };
const plan = planParrainages({ ...base, parsed, stored: [] });

describe("planParrainages, premier import", () => {
  it("crée une ligne par présentation, sans blocage", () => {
    expect(plan.blockers).toEqual([]);
    expect(plan.creates).toHaveLength(31);
    expect(plan.alreadyStored).toBe(0);
    expect(new Set(plan.creates.map((row) => row.dedupeKey)).size).toBe(31);
  });

  it("écrit les colonnes publiées telles quelles et les codes résolus", () => {
    expect(plan.creates[0]).toMatchObject({
      electionId: "el-2022",
      candidateName: "ARTHAUD Nathalie",
      candidacyId: "c-arthaud",
      lastName: "CORDIVAL",
      mandateLabel: "Maire",
      constituencyLabel: "Mont-Saint-Père",
      departmentLabel: "Aisne",
      communeCode: "02524",
      departmentCode: "02",
      publishedOn: new Date("2022-02-01T00:00:00Z"),
      sourceUrl: "https://example.org/liste.csv",
    });
  });

  it("laisse sans candidature un candidat absent de la base", () => {
    const hidalgo = plan.creates.find((row) => row.candidateName === "HIDALGO Anne");
    expect(hidalgo?.candidacyId).toBeNull();
    expect(plan.candidacyLinks).toContainEqual({
      candidateName: "HIDALGO Anne",
      candidacyName: null,
    });
    expect(plan.candidacyLinks).toContainEqual({
      candidateName: "LE PEN Marine",
      candidacyName: "Marine Le Pen",
    });
  });

  it("rapporte les totaux du fichier, les territoires et les dates de publication", () => {
    expect(plan.fileTotals.reduce((sum, [, count]) => sum + count, 0)).toBe(31);
    expect(plan.fileTotals[0]).toEqual(["HIDALGO Anne", 10]);
    expect(plan.territories.commune.RESOLVED).toBe(1);
    expect(plan.publications[0]).toEqual(["2022-02-01", 19]);
  });
});

describe("planParrainages, imports suivants", () => {
  const stored = plan.creates.map(({ dedupeKey, candidateName }) => ({ dedupeKey, candidateName }));

  it("ne crée rien quand tout est déjà en base", () => {
    const second = planParrainages({ ...base, parsed, stored });
    expect(second.creates).toEqual([]);
    expect(second.alreadyStored).toBe(31);
    expect(second.blockers).toEqual([]);
  });

  it("n'ajoute que les lignes d'une publication nouvelle", () => {
    const next = planParrainages({ ...base, parsed, stored: stored.slice(0, 20) });
    expect(next.creates).toHaveLength(11);
    expect(next.alreadyStored).toBe(20);
    expect(next.blockers).toEqual([]);
  });

  it("complète un code de commune resté vide, sans jamais en remplacer un", () => {
    const [first, ...rest] = plan.creates.map(({ dedupeKey, candidateName, communeCode }) => ({
      dedupeKey,
      candidateName,
      communeCode,
    }));
    expect(first!.communeCode).toBe("02524");
    const empty = planParrainages({
      ...base,
      parsed,
      stored: [{ ...first!, communeCode: null }, ...rest],
    });
    expect(empty.communeBackfills).toEqual([{ dedupeKey: first!.dedupeKey, communeCode: "02524" }]);
    expect(empty.creates).toEqual([]);

    const other = planParrainages({
      ...base,
      parsed,
      stored: [{ ...first!, communeCode: "99999" }, ...rest],
    });
    expect(other.communeBackfills).toEqual([]);
  });

  it("bloque quand une ligne en base a disparu du fichier", () => {
    const orphan = { dedupeKey: "inconnue", candidateName: "ARTHAUD Nathalie" };
    const drifted = planParrainages({ ...base, parsed, stored: [...stored, orphan] });
    expect(drifted.blockers).toHaveLength(1);
    expect(drifted.blockers[0]).toMatch(/ARTHAUD Nathalie : 3 dans le fichier, 4 en base/);
  });
});

describe("planParrainages, fichier défectueux", () => {
  const header = PARRAINAGES_COLUMNS.join(";");
  const ligne = "M.;DUPONT;Jean;Maire;Trifouillis;Ain;MARTIN Claire;01/02/2022";
  const planOf = (...lines: string[]) =>
    planParrainages({
      ...base,
      parsed: parseParrainagesCsv([header, ...lines].join("\n")),
      stored: [],
    });

  it("bloque sur une ligne rejetée, un mandat inconnu, un doublon ou un fichier vide", () => {
    expect(planOf(ligne).blockers).toEqual([]);
    expect(planOf(ligne, ligne.replace("01/02/2022", "hier")).blockers[0]).toMatch(/ligne 3/);
    expect(planOf(ligne.replace("Maire", "Maire honoraire")).blockers[0]).toMatch(/honoraire/);
    expect(planOf(ligne, ligne).blockers[0]).toMatch(/Ligne 3 : présentation publiée deux fois/);
    expect(planOf().blockers[0]).toMatch(/aucune présentation/);
  });
});

describe("buildParrainageDedupeKey", () => {
  const row = parsed.rows[0]!;

  it("ne dépend que de l'élection et des colonnes publiées", () => {
    const key = buildParrainageDedupeKey("presidentielle-2022", row);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(
      buildParrainageDedupeKey("presidentielle-2022", { ...row, line: 99, mandat: null })
    ).toBe(key);
    expect(buildParrainageDedupeKey("presidentielle-2027", row)).not.toBe(key);
    expect(
      buildParrainageDedupeKey("presidentielle-2022", { ...row, publishedOn: "2022-02-03" })
    ).not.toBe(key);
  });
});

describe("totaux et candidatures", () => {
  it("trie par nombre puis par nom", () => {
    const rows = ["B", "A", "C", "C"].map((candidateName) => ({ candidateName }));
    expect(countByCandidate(rows)).toEqual([
      ["C", 2],
      ["A", 1],
      ["B", 1],
    ]);
  });

  it("signale tout écart, dans les deux sens", () => {
    expect(diffCandidateTotals([["A", 2]], [["A", 2]])).toEqual([]);
    expect(
      diffCandidateTotals(
        [
          ["A", 2],
          ["B", 1],
        ],
        [
          ["A", 1],
          ["C", 4],
        ]
      )
    ).toEqual([
      "A : 2 dans le fichier, 1 en base",
      "B : 1 dans le fichier, 0 en base",
      "C : 0 dans le fichier, 4 en base",
    ]);
  });

  it("relie un candidat par les mots exacts de son nom, jamais à deux candidatures", () => {
    expect(matchCandidacy("LE PEN Marine", candidacies)?.id).toBe("c-lepen");
    expect(
      matchCandidacy("PÉCRESSE Valérie", [{ candidateName: "Valerie Pecresse" }])
    ).not.toBeNull();
    expect(matchCandidacy("LE PEN Jean-Marie", candidacies)).toBeNull();
    expect(matchCandidacy("PEN Marine", candidacies)).toBeNull();
    const twice = [...candidacies, { id: "c-bis", candidateName: "Marine LE PEN" }];
    expect(matchCandidacy("LE PEN Marine", twice)).toBeNull();
  });
});
