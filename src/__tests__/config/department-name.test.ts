import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { getDepartmentName, formatDepartment } from "@/config/departments";

/**
 * `Commune.departmentName` holds the CODE, on all 34 969 rows.
 *
 * Reading it printed "86 (86)" where "Vienne (86)" was meant, on every commune page, every
 * department listing, the shared OG cards and three public API fields. Nothing failed: the sentence
 * simply said something false, which is why it survived from February to September 2026.
 *
 * The fix is a resolver, and the guard below is what keeps it: no query may select that column
 * again, because selecting it is the only way to display it.
 */

describe("résolution du nom d'un département", () => {
  it("rend le nom derrière un code", () => {
    expect(getDepartmentName("86")).toBe("Vienne");
    expect(getDepartmentName("75")).toBe("Paris");
  });

  it("gère les codes corses, qui ne sont pas numériques", () => {
    expect(getDepartmentName("2A")).toBe("Corse-du-Sud");
    expect(getDepartmentName("2B")).toBe("Haute-Corse");
  });

  it("gère les codes d'outre-mer à trois chiffres", () => {
    expect(getDepartmentName("971")).toBe("Guadeloupe");
    expect(getDepartmentName("974")).toBe("La Réunion");
  });

  it("rend null pour les territoires qui ne sont pas des départements", () => {
    // TAAF et Clipperton : 6 communes en base, aucun département derrière.
    expect(getDepartmentName("984")).toBeNull();
    expect(getDepartmentName("989")).toBeNull();
  });

  it("rend null plutôt que de deviner sur une entrée vide", () => {
    expect(getDepartmentName("")).toBeNull();
    expect(getDepartmentName(null)).toBeNull();
    expect(getDepartmentName(undefined)).toBeNull();
    expect(getDepartmentName("42424")).toBeNull();
  });
});

describe("affichage d'un département", () => {
  it("écrit le nom suivi du code", () => {
    expect(formatDepartment("86")).toBe("Vienne (86)");
    expect(formatDepartment("2B")).toBe("Haute-Corse (2B)");
  });

  it("écrit le code seul quand aucun nom n'existe, sans le doubler", () => {
    // "984 (984)" se lirait comme un bug, et les TAAF n'ont pas de nom à donner.
    expect(formatDepartment("984")).toBe("984");
    expect(formatDepartment("989")).toBe("989");
  });

  it("rend une chaîne vide sur une entrée vide, jamais « undefined »", () => {
    expect(formatDepartment(null)).toBe("");
    expect(formatDepartment(undefined)).toBe("");
  });
});

describe("garde-fou : la colonne trompeuse n'est plus lue", () => {
  /** Every .ts/.tsx under src, minus the generated Prisma client and the tests themselves. */
  function sourceFiles(): string[] {
    return readdirSync(join(process.cwd(), "src"), { recursive: true })
      .map(String)
      .filter((f) => /\.(ts|tsx)$/.test(f))
      .filter((f) => !f.startsWith("generated"))
      .filter((f) => !f.includes("__tests__") && !f.includes(".test."))
      .map((f) => join("src", f));
  }

  it("aucune requête ne sélectionne Commune.departmentName", () => {
    const files = sourceFiles();
    expect(files.length, "aucun fichier lu, le garde-fou lirait le vide").toBeGreaterThan(200);

    // Les trois façons de demander la colonne : un select Prisma, et deux alias SQL bruts.
    const motifs = /departmentName:\s*true|"departmentName"\s+AS|(?:co|c)\."departmentName"/;

    const fautifs = files.filter((f) => motifs.test(readFileSync(join(process.cwd(), f), "utf8")));

    expect(
      fautifs,
      "cette colonne contient le code du département, pas son nom : passer par getDepartmentName"
    ).toEqual([]);
  });
});
