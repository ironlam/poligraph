import { describe, expect, it } from "vitest";
import {
  currentPresidencies,
  parseAnGroupPresidencies,
  parseSenateGroupPresidencies,
} from "@/lib/parlement/group-presidencies";
import { groupPresidencyLabel } from "@/config/labels";

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

function mandat(extra: Record<string, unknown> = {}) {
  return {
    uid: "PM846054",
    acteurRef: "PA794008",
    legislature: "17",
    typeOrgane: "GP",
    dateDebut: "2024-07-19",
    dateFin: null,
    infosQualite: {
      codeQualite: "Président",
      libQualite: "Président du",
      libQualiteSex: "Présidente du",
    },
    organes: { organeRef: "PO845439" },
    ...extra,
  };
}

function acteur(mandats: unknown) {
  return { acteur: { uid: { "#text": "PA794008" }, mandats: { mandat: mandats } } };
}

describe("parseAnGroupPresidencies", () => {
  it("reads the mandate of president of a group, with its official identifiers", () => {
    expect(parseAnGroupPresidencies(acteur([mandat()]))).toEqual({
      periods: [
        {
          externalId: "PM846054",
          personRef: "PA794008",
          groupRef: "PO845439",
          startDate: day("2024-07-19"),
          endDate: null,
        },
      ],
      invalid: [],
    });
  });

  it("accepts a single mandate given as an object rather than a list", () => {
    expect(parseAnGroupPresidencies(acteur(mandat())).periods).toHaveLength(1);
  });

  it("ignores members, apparentés and presidencies of other organs", () => {
    const result = parseAnGroupPresidencies(
      acteur([
        mandat({ infosQualite: { codeQualite: "Membre" } }),
        mandat({ infosQualite: { codeQualite: "Membre apparenté" } }),
        mandat({ typeOrgane: "COMPER" }),
        mandat({ typeOrgane: "ASSEMBLEE", infosQualite: { codeQualite: "Membre" } }),
      ])
    );
    expect(result).toEqual({ periods: [], invalid: [] });
  });

  it("reports a presidency it cannot read instead of dropping or repairing it", () => {
    const result = parseAnGroupPresidencies(
      acteur([
        mandat({ uid: "PM1", dateDebut: null }),
        mandat({ uid: "PM2", dateDebut: "2024-02-31" }),
        mandat({ uid: "PM3", organes: {} }),
      ])
    );
    expect(result.periods).toEqual([]);
    expect(result.invalid).toEqual(["PA794008 / PM1", "PA794008 / PM2", "PA794008 / PM3"]);
  });

  it("returns nothing for a file that is not an acteur", () => {
    expect(parseAnGroupPresidencies({ organe: {} })).toEqual({ periods: [], invalid: [] });
    expect(parseAnGroupPresidencies(null)).toEqual({ periods: [], invalid: [] });
  });
});

const SENATE_HEADER =
  "Matricule,Id appartenance,Id fonction occupée,Nom,Prénom,Code du groupe politique,Nom court du groupe politique,Date de début d'appartenance,Date de fin d'appartenance,Nom court fonction,Date de début de la fonction,Date de fin de la fonction";

function senateCsv(...rows: string[]) {
  return [
    '% Requête :select s.senmat "Matricule", mg.memgrppolid "Id appartenance"',
    "% from sen s, grppol g",
    "% 3749 ligne(s) de résultat",
    SENATE_HEADER,
    ...rows,
    "",
  ].join("\r\n");
}

describe("parseSenateGroupPresidencies", () => {
  it("reads the periods of president, by matricule and group code", () => {
    const result = parseSenateGroupPresidencies(
      senateCsv(
        "00001A,4093,4523,Exemple,Alix,GEX,Groupe d'exemple,2026-10-05 00:00:00.0,,Président,2026-10-05 00:00:00.0,",
        "00001A,3500,3900,Exemple,Alix,GEX,Groupe d'exemple,2023-10-03 00:00:00.0,2026-09-30 00:00:00.0,Président,2023-10-03 00:00:00.0,2026-09-30 00:00:00.0"
      )
    );
    expect(result.invalid).toEqual([]);
    expect(result.periods).toEqual([
      {
        externalId: "4523",
        personRef: "00001A",
        groupRef: "GEX",
        startDate: day("2026-10-05"),
        endDate: null,
      },
      {
        externalId: "3900",
        personRef: "00001A",
        groupRef: "GEX",
        startDate: day("2023-10-03"),
        endDate: day("2026-09-30"),
      },
    ]);
  });

  it("keeps the function named exactly Président, not its neighbours", () => {
    const result = parseSenateGroupPresidencies(
      senateCsv(
        "00002B,1,11,Un,A,GEX,Groupe,2026-10-05 00:00:00.0,,Membre,2026-10-05 00:00:00.0,",
        "00003C,2,12,Deux,B,GEX,Groupe,2026-10-05 00:00:00.0,,Vice-Président,2026-10-05 00:00:00.0,",
        "00004D,3,13,Trois,C,GEX,Groupe,2026-10-05 00:00:00.0,,Président délégué,2026-10-05 00:00:00.0,"
      )
    );
    expect(result).toEqual({ periods: [], invalid: [] });
  });

  it("reads a quoted group name holding a comma without shifting the columns", () => {
    const result = parseSenateGroupPresidencies(
      senateCsv(
        '00005E,5,15,Cinq,E,RDX,"Groupe des uns, des autres",2026-10-05 00:00:00.0,,Président,2026-10-05 00:00:00.0,'
      )
    );
    expect(result.periods[0]).toMatchObject({ externalId: "15", groupRef: "RDX" });
  });

  it("leaves out an ended period with no start date, and reports an open one", () => {
    const result = parseSenateGroupPresidencies(
      senateCsv(
        "00006F,6,16,Six,F,GEX,Groupe,,1986-10-01 00:00:00.0,Président,,1986-10-01 00:00:00.0",
        "00007G,7,17,Sept,G,GEX,Groupe,,,Président,,"
      )
    );
    expect(result.periods).toEqual([]);
    expect(result.invalid).toEqual(["00007G / 17"]);
  });

  it("throws when a column it relies on is gone, rather than reading the wrong one", () => {
    expect(() => parseSenateGroupPresidencies("Matricule,Nom\r\n00001A,Exemple")).toThrow(
      /colonne absente/
    );
  });
});

describe("currentPresidencies", () => {
  const today = day("2026-11-12");
  const period = (politicianId: string, start: string, end: string | null) => ({
    politicianId,
    startDate: day(start),
    endDate: end ? day(end) : null,
  });

  it("returns the open period with its own start", () => {
    const open = period("a", "2024-07-19", null);
    expect(currentPresidencies([open], today)).toEqual([{ period: open, since: open.startDate }]);
  });

  it("returns nothing when every period has ended", () => {
    expect(currentPresidencies([period("a", "2018-01-23", "2023-10-01")], today)).toEqual([]);
  });

  it("dates a president re-elected at each renewal from the first election", () => {
    const periods = [
      period("a", "2026-10-05", null),
      period("a", "2023-10-03", "2026-09-30"),
      period("a", "2018-01-23", "2023-10-01"),
      period("b", "2014-04-15", "2018-01-22"),
    ];
    const [current] = currentPresidencies(periods, today);
    expect(current!.period).toBe(periods[0]);
    expect(current!.since).toEqual(day("2018-01-23"));
  });

  it("does not chain across a real interruption", () => {
    const periods = [period("a", "2026-10-05", null), period("a", "2011-10-01", "2014-04-14")];
    expect(currentPresidencies(periods, today)[0]!.since).toEqual(day("2026-10-05"));
  });

  it("does not chain onto another person's period", () => {
    const periods = [period("a", "2026-10-05", null), period("b", "2023-10-03", "2026-09-30")];
    expect(currentPresidencies(periods, today)[0]!.since).toEqual(day("2026-10-05"));
  });

  it("returns every sitting president of a shared presidency, oldest first", () => {
    const periods = [period("b", "2025-01-10", null), period("a", "2024-07-19", null)];
    expect(currentPresidencies(periods, today).map((p) => p.period.politicianId)).toEqual([
      "a",
      "b",
    ]);
  });

  it("ignores a period that has not started yet", () => {
    expect(currentPresidencies([period("a", "2027-01-01", null)], today)).toEqual([]);
  });
});

describe("groupPresidencyLabel", () => {
  it("agrees with the civility, and states no gender when the base holds none", () => {
    expect(groupPresidencyLabel("Mme")).toBe("Présidente du groupe");
    expect(groupPresidencyLabel("M.")).toBe("Président du groupe");
    expect(groupPresidencyLabel(null)).toBe("Présidence du groupe");
  });
});
