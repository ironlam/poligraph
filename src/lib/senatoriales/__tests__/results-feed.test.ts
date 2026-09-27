import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { OutgoingSenateSeat } from "@/types/stats-snapshots";
import {
  FeedNotXmlError,
  matchOutgoing,
  parseIndex,
  parseResults,
  resultsUrl,
} from "../results-feed";

// Real files of the Ministry feed, fetched on 27 September 2026 at 19:40 Paris time.
const read = (name: string) => readFileSync(join(__dirname, "fixtures", name), "utf8");

describe("parseIndex", () => {
  it("lit les 64 circonscriptions de l'index T1", () => {
    const idx = parseIndex(read("INDEX1FE.xml"));
    expect(idx).toHaveLength(64);
    expect(idx.find((c) => c.code === "01")).toMatchObject({
      name: "Ain",
      resultsIn: true,
      filled: "T1",
    });
    expect(idx.some((c) => c.code === "ZZ")).toBe(true);
  });

  it("date la dernière mise à jour à l'heure de Paris", () => {
    const ain = parseIndex(read("INDEX1FE.xml")).find((c) => c.code === "01");
    // 27/09/2026 19:16:41 Paris (UTC+2) = 17:16:41 UTC
    expect(ain?.updatedAt?.toISOString()).toBe("2026-09-27T17:16:41.000Z");
  });

  it("laisse la date vide pour une circonscription sans résultats", () => {
    const idx = parseIndex(read("INDEX1FE.xml"));
    const waiting = idx.filter((c) => !c.resultsIn);
    expect(waiting.length).toBeGreaterThan(0);
    expect(waiting.every((c) => c.updatedAt === null)).toBe(true);
  });

  it("distingue une circonscription non pourvue", () => {
    const idx = parseIndex(read("INDEX1FE.xml"));
    expect(idx.filter((c) => c.filled === "NON").length).toBeGreaterThan(0);
  });
});

describe("parseResults", () => {
  it("proportionnelle (Ain) : 3 élues, voix portées par la liste", () => {
    const r = parseResults(read("R101.xml"));
    expect(r).toMatchObject({ code: "01", name: "Ain", seatsToFill: 3, seatsFilled: 3 });
    expect(r.elected.map((e) => e.lastName).sort()).toEqual([
      "BAUDE",
      "BLATRIX CONTAT",
      "GOY-CHAVENT",
    ]);
    expect(r.elected.every((e) => e.civility === "Mme" && e.round === 1)).toBe(true);
    expect(r.elected.every((e) => e.listPosition === 1)).toBe(true);
    expect(r.elected.find((e) => e.lastName === "BAUDE")).toMatchObject({
      listName: "L'Ain au coeur",
      nuanceCode: "LLR",
      listVotes: 738,
      votes: null,
      pct: null,
    });
  });

  it("majoritaire (Allier) : 2 élus au T1, pourcentage à virgule converti", () => {
    const r = parseResults(read("R103.xml"));
    expect(r.elected.map((e) => [e.firstName, e.lastName, e.votes, e.pct])).toEqual([
      ["Claude", "MALHURET", 636, 66.95],
      ["Bruno", "ROJOUAN", 643, 67.68],
    ]);
    expect(r.elected.every((e) => e.round === 1 && e.listName === null)).toBe(true);
  });

  it("second tour (Ardennes) : l'élue du T1 et l'élu du T2, jamais un qualifié", () => {
    const r = parseResults(read("R208.xml"));
    expect(r.elected.map((e) => [e.lastName, e.round])).toEqual([
      ["JOSEPH", 1],
      ["LAMÉNIE", 2],
    ]);
  });

  it("Français établis hors de France : 6 élus", () => {
    const r = parseResults(read("ZZ.xml"));
    expect(r).toMatchObject({ code: "ZZ", seatsToFill: 6, seatsFilled: 6 });
    expect(r.elected).toHaveLength(6);
  });

  it("rejette la page HTML de maintenance", () => {
    expect(() => parseResults(read("maintenance.html"))).toThrow(FeedNotXmlError);
  });
});

describe("resultsUrl", () => {
  it("construit l'URL d'un fichier de résultats", () => {
    expect(resultsUrl("08", 2)).toBe(
      "https://www.resultats-elections.interieur.gouv.fr/telechargements/SN2026/resultatsT2/08/R208.xml"
    );
  });
});

describe("matchOutgoing", () => {
  const seat = (fullName: string, departmentCode: string | null): OutgoingSenateSeat => ({
    politicianId: `id-${fullName}`,
    fullName,
    slug: fullName.toLowerCase().replace(/ /g, "-"),
    departmentCode,
    constituency: departmentCode ?? "Français établis hors de France (Série 2)",
    series: 2,
    groupCode: null,
    groupName: null,
    groupShortName: null,
  });

  it("reconnaît un sortant malgré les majuscules, accents et tirets", () => {
    const outgoing = [seat("Marc Laménie", "08"), seat("Else Joseph", "08")];
    expect(
      matchOutgoing({ constituencyCode: "08", firstName: "Marc", lastName: "LAMENIE" }, outgoing)
        ?.fullName
    ).toBe("Marc Laménie");
  });

  it("ignore un homonyme d'une autre circonscription", () => {
    const outgoing = [seat("Marc Laménie", "51")];
    expect(
      matchOutgoing({ constituencyCode: "08", firstName: "Marc", lastName: "LAMÉNIE" }, outgoing)
    ).toBeNull();
  });

  it("refuse de choisir entre deux sortants égaux", () => {
    const outgoing = [seat("Marc Laménie", "08"), seat("Marc Lamenie", "08")];
    expect(
      matchOutgoing({ constituencyCode: "08", firstName: "Marc", lastName: "LAMÉNIE" }, outgoing)
    ).toBeNull();
  });

  it("rattache ZZ aux sièges sans département", () => {
    const outgoing = [seat("Olivier Cadic", null), seat("Olivier Cadic", "75")];
    expect(
      matchOutgoing({ constituencyCode: "ZZ", firstName: "Olivier", lastName: "CADIC" }, outgoing)
        ?.departmentCode
    ).toBeNull();
  });

  it("n'accepte pas une égalité partielle", () => {
    const outgoing = [seat("Christophe-André Frassa", null)];
    expect(
      matchOutgoing(
        { constituencyCode: "ZZ", firstName: "Christophe", lastName: "FRASSA" },
        outgoing
      )
    ).toBeNull();
  });
});
