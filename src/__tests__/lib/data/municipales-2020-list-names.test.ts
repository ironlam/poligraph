import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Regression guard for issue #941: a candidate is not a list.
 *
 * `municipales-2020.ts` wrote `listName: list.listName || candidateName`. Under 1000 inhabitants
 * the ballot is plurinominal and the CSV carries no list name, so every candidate became a list of
 * their own: the pages announced 348 593 lists where 19 342 exist. Nothing failed, the number was
 * simply false, which is why it survived.
 *
 * Two things must hold. A missing list name stays null, and the display counts only named lists
 * while still showing the people behind them.
 */

const electionFindUnique = vi.fn();
const communeFindUnique = vi.fn();
const candidacyFindMany = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    election: { findUnique: (...a: unknown[]) => electionFindUnique(...a) },
    commune: { findUnique: (...a: unknown[]) => communeFindUnique(...a) },
    candidacy: { findMany: (...a: unknown[]) => candidacyFindMany(...a) },
  },
}));
vi.mock("next/cache", () => ({ cacheTag: vi.fn(), cacheLife: vi.fn() }));

// Import AFTER mocks
import { getCommuneResults2020 } from "@/lib/data/elections";

function candidacy(listName: string | null, candidateName: string, votes = 10) {
  return {
    candidateName,
    listName,
    listPosition: null,
    partyLabel: null,
    round1Votes: votes,
    round1Pct: null,
    round1Qualified: null,
    round2Votes: null,
    round2Pct: null,
    isElected: false,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  electionFindUnique.mockResolvedValue({ id: "e2020" });
  communeFindUnique.mockResolvedValue({
    id: "86063",
    name: "Chatain",
    departmentCode: "86",
    population: 240,
    totalSeats: 11,
  });
});

describe("résultats 2020 d'une commune", () => {
  it("ne compte aucune liste sur un scrutin plurinominal", async () => {
    candidacyFindMany.mockResolvedValue([
      candidacy(null, "Odile DECELLE"),
      candidacy(null, "Bruno BOURGOIN"),
      candidacy(null, "Eliane BRUNET"),
    ]);

    const commune = await getCommuneResults2020("86063");

    expect(commune?.namedListCount).toBe(0);
  });

  it("montre quand même chaque candidat, avec ses propres voix", async () => {
    candidacyFindMany.mockResolvedValue([
      candidacy(null, "Odile DECELLE", 31),
      candidacy(null, "Bruno BOURGOIN", 28),
    ]);

    const commune = await getCommuneResults2020("86063");

    // Le panachage donne des voix par personne : les regrouper serait perdre l'information.
    expect(commune?.lists).toHaveLength(2);
    expect(commune?.lists.map((l) => l.round1Votes).sort()).toEqual([28, 31]);
    expect(commune?.lists.every((l) => l.isNamedList)).toBe(false);
  });

  it("compte les listes déclarées, et elles seules", async () => {
    candidacyFindMany.mockResolvedValue([
      candidacy("BIEN VIVRE À CHATAIN", "Odile DECELLE"),
      candidacy("CHATAIN AUTREMENT", "Bruno BOURGOIN"),
      candidacy(null, "Eliane BRUNET"),
    ]);

    const commune = await getCommuneResults2020("86063");

    expect(commune?.namedListCount).toBe(2);
    expect(commune?.lists).toHaveLength(3);
    expect(
      commune?.lists
        .filter((l) => l.isNamedList)
        .map((l) => l.listName)
        .sort()
    ).toEqual(["BIEN VIVRE À CHATAIN", "CHATAIN AUTREMENT"]);
  });

  it("rend zéro liste et zéro candidat sur une commune sans candidature", async () => {
    candidacyFindMany.mockResolvedValue([]);

    const commune = await getCommuneResults2020("86063");

    expect(commune?.namedListCount).toBe(0);
    expect(commune?.lists).toEqual([]);
  });
});

describe("garde-fou sur l'import 2020", () => {
  it("n'écrit jamais le nom du candidat en guise de nom de liste", () => {
    const source = readFileSync(
      join(process.cwd(), "src/services/sync/municipales-2020.ts"),
      "utf8"
    );

    // Le repli exact qui a produit les 354 948 fausses listes.
    expect(source).not.toMatch(/listName:\s*list\.listName\s*\|\|\s*candidateName/);
    expect(source).toMatch(/listName:\s*list\.listName\s*\|\|\s*null/);
  });
});
