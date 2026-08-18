import { describe, expect, it } from "vitest";
import {
  GLOSSARY,
  INSTITUTION_TERMS,
  LEGAL_TERMS,
  METRIC_TERMS,
  PARLIAMENTARY_TERMS,
} from "../glossary";

const SOURCE_BLOCKS = {
  LEGAL_TERMS,
  PARLIAMENTARY_TERMS,
  INSTITUTION_TERMS,
  METRIC_TERMS,
} as const;

describe("glossaire", () => {
  // Regression: the entry used to read "L'abstention est comptabilisée dans les
  // suffrages exprimés", which is the opposite of what the règlement du Sénat
  // (art. 52) says. It was served on every scrutin page through InfoTooltip.
  it("n'affirme pas que l'abstention entre dans les suffrages exprimés", () => {
    expect(GLOSSARY.abstention).toContain("n'entrent pas dans le décompte des suffrages exprimés");
    expect(GLOSSARY.abstention).not.toMatch(/est comptabilisée dans les suffrages exprimés/);
  });

  // Regression: "ferme" used to be glossed as "le condamné est incarcéré". Code
  // pénal art. 132-25 makes an aménagement mandatory at or below six months, so a
  // ferme sentence does not establish incarceration.
  it("ne présente pas la peine ferme comme entraînant l'incarcération", () => {
    expect(GLOSSARY.ferme).not.toMatch(/le condamné est incarcéré/);
    expect(GLOSSARY.ferme).toMatch(/n'implique pas nécessairement l'incarcération/);
  });

  // Structural guard: four HATVP keys were declared in two blocks at once, so the
  // earlier block was unreachable through GLOSSARY and its wording drifted from the
  // one actually shown. A duplicate key is always a silently shadowed definition.
  it("ne déclare aucune clé dans deux blocs à la fois", () => {
    const seen = new Map<string, string>();
    const duplicates: string[] = [];

    for (const [blockName, block] of Object.entries(SOURCE_BLOCKS)) {
      for (const key of Object.keys(block)) {
        const previous = seen.get(key);
        if (previous) {
          duplicates.push(`${key} (${previous} puis ${blockName})`);
        } else {
          seen.set(key, blockName);
        }
      }
    }

    expect(duplicates).toEqual([]);
  });

  it("expose autant de clés que la somme de ses blocs", () => {
    const declared = Object.values(SOURCE_BLOCKS).reduce(
      (total, block) => total + Object.keys(block).length,
      0
    );

    expect(Object.keys(GLOSSARY)).toHaveLength(declared);
  });

  it("ne contient aucune définition vide", () => {
    const empty = Object.entries(GLOSSARY)
      .filter(([, definition]) => definition.trim().length === 0)
      .map(([key]) => key);

    expect(empty).toEqual([]);
  });
});
