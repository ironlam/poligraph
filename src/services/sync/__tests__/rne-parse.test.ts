import { describe, expect, it } from "vitest";
import type { MaireRNECSV } from "../types";
import {
  buildInseeCode,
  DEFAULT_MANDATE_START,
  mandateLabels,
  mandateStartDate,
  normalizeName,
  parseFrenchDate,
  parseMaireRows,
  type ParsedMaireRow,
} from "../rne-parse";

function csvRow(overrides: Partial<MaireRNECSV> = {}): MaireRNECSV {
  return {
    "Code du département": "34",
    "Libellé du département": "Hérault",
    "Code de la collectivité à statut particulier": "",
    "Libellé de la collectivité à statut particulier": "",
    "Code de la commune": "34172",
    "Libellé de la commune": "Montpellier",
    "Nom de l'élu": "DELAFOSSE",
    "Prénom de l'élu": "MICHAËL",
    "Code sexe": "M",
    "Date de naissance": "05/03/1977",
    "Code de la catégorie socio-professionnelle": "",
    "Libellé de la catégorie socio-professionnelle": "",
    "Date de début du mandat": "03/07/2020",
    "Date de début de la fonction": "04/07/2020",
    ...overrides,
  };
}

describe("parseFrenchDate", () => {
  it("reads DD/MM/YYYY", () => {
    expect(parseFrenchDate("05/03/1977")).toEqual(new Date(1977, 2, 5));
  });

  it.each(["", "   ", "1977-03-05", "05/03", "00/03/1977", "05/03/1850", "05/03/2200"])(
    "rejects %j",
    (input) => {
      expect(parseFrenchDate(input)).toBeNull();
    }
  );
});

describe("buildInseeCode", () => {
  it("uses the commune column when it already holds five digits", () => {
    expect(buildInseeCode("34", "34172")).toBe("34172");
  });

  it("accepts a five-digit code from a neighbouring department", () => {
    // Communes nouvelles can straddle a boundary, so the prefix is not checked.
    expect(buildInseeCode("01", "71014")).toBe("71014");
  });

  it("pads a two-digit department with a three-digit suffix", () => {
    expect(buildInseeCode("34", "12")).toBe("34012");
  });

  it("pads a three-digit overseas department with a two-digit suffix", () => {
    expect(buildInseeCode("974", "1")).toBe("97401");
  });

  it("ignores surrounding whitespace", () => {
    expect(buildInseeCode(" 34 ", " 34172 ")).toBe("34172");
  });
});

describe("normalizeName", () => {
  it.each([
    ["DELAFOSSE", "Delafosse"],
    ["jean-pierre", "Jean Pierre"],
    ["MARIE  CLAIRE", "Marie Claire"],
    ["o'BRIEN", "O'brien"],
  ])("normalizes %j to %j", (input, expected) => {
    expect(normalizeName(input)).toBe(expected);
  });
});

describe("parseMaireRows", () => {
  it("builds a row from a well-formed record", () => {
    const { rows } = parseMaireRows([csvRow()], new Set(["34172"]));

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      inseeCode: "34172",
      communeId: "34172",
      communeLabel: "Montpellier",
      firstName: "Michaël",
      lastName: "Delafosse",
      fullName: "Michaël Delafosse",
      civility: "M.",
      gender: "M",
      deptCode: "34",
    });
  });

  it("leaves communeId null when the commune is not in our table", () => {
    // communeId is a foreign key; writing an unknown code would fail the insert.
    const { rows } = parseMaireRows([csvRow()], new Set());
    expect(rows[0]?.communeId).toBeNull();
    expect(rows[0]?.inseeCode).toBe("34172");
  });

  it("maps the female code to Mme", () => {
    const { rows } = parseMaireRows([csvRow({ "Code sexe": "F" })], new Set());
    expect(rows[0]).toMatchObject({ gender: "F", civility: "Mme" });
  });

  it("leaves gender and civility null on an unknown code", () => {
    const { rows } = parseMaireRows([csvRow({ "Code sexe": "X" })], new Set());
    expect(rows[0]).toMatchObject({ gender: null, civility: null });
  });

  it("reports a missing name and keeps going", () => {
    const { rows, errors } = parseMaireRows([csvRow({ "Nom de l'élu": "" }), csvRow()], new Set());

    expect(rows).toHaveLength(1);
    expect(errors).toEqual(["Row 1: missing name"]);
  });

  it("reports a missing commune code with the person's name", () => {
    const { errors } = parseMaireRows([csvRow({ "Code de la commune": "" })], new Set());
    expect(errors[0]).toBe("Row 1: missing department or commune code for MICHAËL DELAFOSSE");
  });

  it("keeps the last row when a commune appears twice", () => {
    // The RNE file repeats a commune after a change of mayor; the later row is the current one.
    const { rows, duplicatesDropped } = parseMaireRows(
      [csvRow({ "Nom de l'élu": "ANCIEN" }), csvRow({ "Nom de l'élu": "NOUVEAU" })],
      new Set()
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.lastName).toBe("Nouveau");
    expect(duplicatesDropped).toBe(1);
  });

  it("remembers every INSEE code seen, including deduplicated ones", () => {
    // Phase 3 closes mandates whose commune vanished from the file, so this set must be
    // the file's full reach and not just the surviving rows.
    const { seenCommuneIds } = parseMaireRows(
      [csvRow(), csvRow(), csvRow({ "Code de la commune": "34032" })],
      new Set()
    );

    expect([...seenCommuneIds].sort()).toEqual(["34032", "34172"]);
  });

  it("collects commune labels for the identity resolver", () => {
    const { communeNameByInsee } = parseMaireRows([csvRow()], new Set());
    expect(communeNameByInsee.get("34172")).toBe("Montpellier");
  });
});

describe("mandate shaping", () => {
  const base: ParsedMaireRow = {
    inseeCode: "34172",
    communeId: "34172",
    communeLabel: "Montpellier",
    firstName: "Michaël",
    lastName: "Delafosse",
    fullName: "Michaël Delafosse",
    civility: "M.",
    gender: "M",
    birthDate: null,
    deptCode: "34",
    mandateStart: new Date(2020, 6, 3),
    functionStart: new Date(2020, 6, 4),
  };

  it("names the mandate after the commune", () => {
    expect(mandateLabels(base)).toEqual({
      title: "Maire de Montpellier",
      constituency: "Montpellier (34172)",
    });
  });

  it("falls back to the INSEE code when the label is missing", () => {
    expect(mandateLabels({ ...base, communeLabel: null })).toEqual({
      title: "Maire (34172)",
      constituency: "34172",
    });
  });

  it("prefers the start of the function over the start of the mandate", () => {
    expect(mandateStartDate(base)).toEqual(new Date(2020, 6, 4));
  });

  it("falls back to the mandate start", () => {
    expect(mandateStartDate({ ...base, functionStart: null })).toEqual(new Date(2020, 6, 3));
  });

  it("falls back to the 2020 investiture date when the file dates nothing", () => {
    expect(mandateStartDate({ ...base, functionStart: null, mandateStart: null })).toEqual(
      DEFAULT_MANDATE_START
    );
  });
});
