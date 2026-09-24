import { describe, it, expect } from "vitest";
import {
  parseSeanceTimestamp,
  parseSeanceOrder,
  extractSeanceFromXml,
} from "@/services/sync/debate-transcript-parse";

describe("parseSeanceTimestamp", () => {
  it("parses the full AN timestamp YYYYMMDDHHmmss into day + start time", () => {
    const r = parseSeanceTimestamp("20260530090000000");
    expect(r).not.toBeNull();
    expect(r!.date.toISOString()).toBe("2026-05-30T00:00:00.000Z");
    expect(r!.startTime).not.toBeNull();
    // 09:00 sitting (wall-clock digits, ordering only)
    expect(r!.startTime!.getUTCHours()).toBe(9);
    expect(r!.startTime!.getUTCMinutes()).toBe(0);
  });

  it("distinguishes afternoon and evening sittings by start time", () => {
    expect(parseSeanceTimestamp("20260530150000000")!.startTime!.getUTCHours()).toBe(15);
    expect(parseSeanceTimestamp("20260530211300000")!.startTime!.getUTCHours()).toBe(21);
  });

  it("handles legacy 8-digit date-only with a null start time", () => {
    const r = parseSeanceTimestamp("20260530");
    expect(r!.date.toISOString()).toBe("2026-05-30T00:00:00.000Z");
    expect(r!.startTime).toBeNull();
  });

  it("returns null on garbage", () => {
    expect(parseSeanceTimestamp("")).toBeNull();
    expect(parseSeanceTimestamp("nope")).toBeNull();
    expect(parseSeanceTimestamp("20261332")).toBeNull(); // month 13, day 32
  });
});

describe("parseSeanceOrder", () => {
  it("maps numSeanceJour to a sitting order", () => {
    expect(parseSeanceOrder("Unique")).toBe(1);
    expect(parseSeanceOrder("1")).toBe(1);
    expect(parseSeanceOrder("2")).toBe(2);
    expect(parseSeanceOrder("3")).toBe(3);
  });

  it("returns null for empty or unexpected values", () => {
    expect(parseSeanceOrder(null)).toBeNull();
    expect(parseSeanceOrder("")).toBeNull();
    expect(parseSeanceOrder("matin")).toBeNull();
  });
});

describe("extractSeanceFromXml", () => {
  const longSpeech = "Mesdames et messieurs les députés, ".repeat(400); // > 5000 chars

  const xml = `<?xml version='1.0' encoding='UTF-8'?>
<compteRendu xmlns="http://schemas.assemblee-nationale.fr/referentiel">
  <uid>CRSANR5L17S2026O1N256</uid>
  <seanceRef>RUANR5L17S2026IDS30738</seanceRef>
  <metadonnees>
    <dateSeance>20260530150000000</dateSeance>
    <numSeanceJour>2</numSeanceJour>
  </metadonnees>
  <contenu>
    <paragraphe roledebat="orateur">
      <orateurs><orateur><nom>Mme Léchon</nom></orateur></orateurs>
      <texte>Par l'amendement no 2084, nous proposons une mesure de transparence. ${longSpeech}</texte>
    </paragraphe>
    <paragraphe roledebat="orateur">
      <orateurs><orateur><nom>M. le président</nom></orateur></orateurs>
      <texte>Sur l'amendement no 2084, je mets aux voix. FIN_DU_DEBAT_MARQUEUR</texte>
    </paragraphe>
  </contenu>
</compteRendu>`;

  it("extracts seanceRef, day, start time, sitting order and FULL untruncated content", () => {
    const r = extractSeanceFromXml(xml);
    expect(r).not.toBeNull();
    expect(r!.seanceRef).toBe("RUANR5L17S2026IDS30738");
    expect(r!.date.toISOString()).toBe("2026-05-30T00:00:00.000Z");
    expect(r!.startTime!.getUTCHours()).toBe(15);
    expect(r!.seanceOrder).toBe(2);
    // No 5000-char truncation: content is longer and keeps the closing marker.
    expect(r!.content.length).toBeGreaterThan(5000);
    expect(r!.content).toContain("FIN_DU_DEBAT_MARQUEUR");
    expect(r!.content).toContain("amendement no 2084");
  });

  it("falls back to uid as seanceRef and returns null when no usable content", () => {
    const empty = `<compteRendu><uid>CRX</uid><metadonnees><dateSeance>20260530090000000</dateSeance></metadonnees></compteRendu>`;
    expect(extractSeanceFromXml(empty)).toBeNull();
  });
});

/**
 * Le contenu d'une séance part en base puis dans un prompt. Un chevron résiduel y ouvre une
 * balise que rien n'a fermée, et le texte cesse d'être du texte.
 */
describe("balisage résiduel dans le contenu extrait", () => {
  const xml = `<?xml version='1.0' encoding='UTF-8'?>
<compteRendu>
  <uid>CRSANR5L17S2026O1N999</uid>
  <metadonnees><dateSeance>20260530150000000</dateSeance></metadonnees>
  <contenu>
    <paragraphe roledebat="orateur">
      <orateurs><orateur><nom>Mme Test</nom></orateur></orateurs>
      <texte>Un propos assez long pour passer le seuil, avec un <fragment non refermé.</texte>
    </paragraphe>
  </contenu>
</compteRendu>`;

  it("ne laisse aucun chevron dans le contenu", () => {
    const r = extractSeanceFromXml(xml);
    expect(r).not.toBeNull();
    expect(r!.content).not.toMatch(/[<>]/);
  });
});
