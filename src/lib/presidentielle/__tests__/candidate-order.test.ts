import { describe, expect, it } from "vitest";
import {
  presidentialCandidateSortKey,
  sortPresidentialCandidatesBySurname,
  type SurnameOrdered,
} from "../candidate-order";

function candidacy(candidateName: string, lastName: string | null = null): SurnameOrdered {
  return { candidateName, politician: lastName === null ? null : { lastName } };
}

const names = (rows: SurnameOrdered[]) => rows.map((r) => r.candidateName);

describe("sortPresidentialCandidatesBySurname", () => {
  it("orders on the surname, not on the first name", () => {
    // The regression this locks: an SQL `orderBy: { candidateName: "asc" }` files "Édouard
    // Philippe" under E and "Gabriel Attal" under G, so Philippe would come first.
    const sorted = sortPresidentialCandidatesBySurname([
      candidacy("Édouard Philippe", "Philippe"),
      candidacy("Gabriel Attal", "Attal"),
    ]);

    expect(names(sorted)).toEqual(["Gabriel Attal", "Édouard Philippe"]);
  });

  it("files an accented surname with its unaccented letter, not after Z", () => {
    const sorted = sortPresidentialCandidatesBySurname([
      candidacy("Marine Zavatta", "Zavatta"),
      candidacy("Clara Égger", "Égger"),
      candidacy("Nathalie Faure", "Faure"),
    ]);

    expect(names(sorted)).toEqual(["Clara Égger", "Nathalie Faure", "Marine Zavatta"]);
  });

  it("falls back to the full name when the candidacy has no linked politician", () => {
    // Dropping such a candidacy would silently shorten the field, so it sorts on what it has.
    const sorted = sortPresidentialCandidatesBySurname([
      candidacy("Bruno Retailleau", "Retailleau"),
      candidacy("Comité de soutien"),
      candidacy("Anasse Kazib", "Kazib"),
    ]);

    expect(names(sorted)).toEqual(["Comité de soutien", "Anasse Kazib", "Bruno Retailleau"]);
  });

  it("breaks a tie between homonyms on the full name", () => {
    const sorted = sortPresidentialCandidatesBySurname([
      candidacy("Olivier Faure", "Faure"),
      candidacy("Alice Faure", "Faure"),
    ]);

    expect(names(sorted)).toEqual(["Alice Faure", "Olivier Faure"]);
  });

  it("returns a new array and leaves the caller's own order alone", () => {
    const rows = [candidacy("Édouard Philippe", "Philippe"), candidacy("Gabriel Attal", "Attal")];
    const sorted = sortPresidentialCandidatesBySurname(rows);

    expect(sorted).not.toBe(rows);
    expect(names(rows)).toEqual(["Édouard Philippe", "Gabriel Attal"]);
  });

  it("exposes the key it sorts on", () => {
    expect(presidentialCandidateSortKey(candidacy("Édouard Philippe", "Philippe"))).toBe(
      "Philippe"
    );
    expect(presidentialCandidateSortKey(candidacy("Comité de soutien"))).toBe("Comité de soutien");
  });
});
