import { describe, it, expect } from "vitest";
import { DEPARTMENT_LOCATIVE, getDepartmentLocative } from "../department-prepositions";
import { DEPARTMENTS } from "../departments";

describe("DEPARTMENT_LOCATIVE", () => {
  it("couvre exactement les départements de DEPARTMENTS", () => {
    expect(Object.keys(DEPARTMENT_LOCATIVE).sort()).toEqual(Object.keys(DEPARTMENTS).sort());
  });

  it("contient le nom du département dans sa forme locative", () => {
    for (const [code, { name }] of Object.entries(DEPARTMENTS)) {
      expect(DEPARTMENT_LOCATIVE[code], `${code} (${name})`).toContain(name);
    }
  });

  it("commence toujours par une préposition connue", () => {
    for (const [code, locative] of Object.entries(DEPARTMENT_LOCATIVE)) {
      expect(locative, code).toMatch(/^(en |à |dans le |dans la |dans les |dans l')/);
    }
  });

  // Les quatre pièges que « en » + libellé produirait : « en Nord », « en Paris »,
  // « en Yvelines », « en Ain ».
  it("emploie la bonne préposition sur les cas qui cassent une règle naïve", () => {
    expect(DEPARTMENT_LOCATIVE["75"]).toBe("à Paris");
    expect(DEPARTMENT_LOCATIVE["59"]).toBe("dans le Nord");
    expect(DEPARTMENT_LOCATIVE["78"]).toBe("dans les Yvelines");
    expect(DEPARTMENT_LOCATIVE["01"]).toBe("dans l'Ain");
    expect(DEPARTMENT_LOCATIVE["33"]).toBe("en Gironde");
    expect(DEPARTMENT_LOCATIVE["974"]).toBe("à La Réunion");
  });

  it("élide devant une voyelle", () => {
    for (const code of [
      "01",
      "02",
      "03",
      "10",
      "11",
      "12",
      "27",
      "34",
      "36",
      "60",
      "61",
      "89",
      "91",
    ]) {
      expect(DEPARTMENT_LOCATIVE[code], code).toMatch(/^dans l'/);
    }
  });
});

describe("getDepartmentLocative", () => {
  it("renvoie la forme locative d'un code connu", () => {
    expect(getDepartmentLocative("33")).toBe("en Gironde");
  });

  // Un repli « en » + libellé produirait « en Nord » : mieux vaut rendre la main
  // à l'appelant pour qu'il reformule la phrase entière.
  it("renvoie null sur un code inconnu plutôt qu'une forme fabriquée", () => {
    expect(getDepartmentLocative("999")).toBeNull();
    expect(getDepartmentLocative(null)).toBeNull();
    expect(getDepartmentLocative(undefined)).toBeNull();
    expect(getDepartmentLocative("")).toBeNull();
  });
});
