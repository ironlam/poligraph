import { describe, expect, it } from "vitest";
import {
  classifyGroupOrgans,
  parseActeur,
  parseOrgane,
  type GroupOrganRecord,
} from "../parse-amo30";
import { asGroupRef, type GroupMembershipEvidence } from "../types";
import { acteurFile, groupMandate, organeFile, seatMandate } from "../__fixtures__/official-files";

describe("parseOrgane", () => {
  it("accepts a group organ and reads the legislature written as a string", () => {
    const parsed = parseOrgane(organeFile("PO1", { abbreviation: "ABC", legislature: "17" }));
    expect(parsed.status).toBe("ACCEPTED");
    if (parsed.status !== "ACCEPTED") return;
    expect(parsed.organ).toMatchObject({
      groupRef: "PO1",
      legislature: 17,
      abbreviation: "ABC",
      startDate: "2022-06-28",
      endDate: null,
    });
  });

  it("leaves the other organ types out of scope, counted and not rejected", () => {
    expect(parseOrgane(organeFile("PO2", { codeType: "COMPER" }))).toEqual({
      status: "OUT_OF_SCOPE",
      codeType: "COMPER",
      sourceRecordId: "PO2",
    });
  });

  it.each([
    ["not an object", null, "ROOT_MISSING"],
    ["no organ key", { other: {} }, "ROOT_MISSING"],
    ["no uid", { organe: { codeType: "GP" } }, "UID_MISSING"],
    ["uid with a space", organeFile(" PO1"), "UID_MISSING"],
    ["no code type", { organe: { uid: "PO3" } }, "CODE_TYPE_MISSING"],
    [
      "legislature not a number",
      organeFile("PO4", { legislature: "seize" }),
      "LEGISLATURE_MALFORMED",
    ],
    ["legislature zero", organeFile("PO4", { legislature: "0" }), "LEGISLATURE_MALFORMED"],
    ["impossible start date", organeFile("PO5", { start: "2022-02-30" }), "START_DATE_INVALID"],
    ["time in a date", organeFile("PO5", { start: "2022-02-01T00:00:00" }), "START_DATE_INVALID"],
    ["end date invalid", organeFile("PO6", { end: "never" }), "END_DATE_INVALID"],
    [
      "start after end",
      organeFile("PO7", { start: "2023-01-02", end: "2023-01-01" }),
      "START_AFTER_END",
    ],
  ])("rejects %s with a typed reason", (_label, raw, reason) => {
    const parsed = parseOrgane(raw);
    expect(parsed.status).toBe("REJECTED");
    if (parsed.status === "REJECTED") expect(parsed.reason).toBe(reason);
  });

  it("keeps the organ id of a rejected record, so it can be listed", () => {
    const parsed = parseOrgane(organeFile("PO9", { start: "bad" }));
    expect(parsed).toEqual({
      status: "REJECTED",
      reason: "START_DATE_INVALID",
      sourceRecordId: "PO9",
    });
  });

  it("accepts an organ with no dates: a missing start stays null and is not invented", () => {
    const parsed = parseOrgane(organeFile("PO10", { start: null }));
    expect(parsed.status === "ACCEPTED" && parsed.organ.startDate).toBeNull();
  });
});

describe("parseActeur", () => {
  it("reads the typed identifier of an actor", () => {
    const parsed = parseActeur(acteurFile("PA1", null));
    expect(parsed.status === "ACCEPTED" && parsed.officialId).toBe("PA1");
  });

  it("reads the same identifier when it is a plain string", () => {
    const parsed = parseActeur(acteurFile("PA1", null, false));
    expect(parsed.status === "ACCEPTED" && parsed.officialId).toBe("PA1");
  });

  it("accepts mandats as null, as one object, and as a list, with the same counts", () => {
    const group = groupMandate("PM1", "PA1", "PO1");
    const seat = seatMandate("PM2", "PA1");
    const none = parseActeur(acteurFile("PA1", null));
    const one = parseActeur(acteurFile("PA1", group));
    const many = parseActeur(acteurFile("PA1", [group, seat]));
    expect([none, one, many].map((p) => p.status)).toEqual(["ACCEPTED", "ACCEPTED", "ACCEPTED"]);
    if (none.status !== "ACCEPTED" || one.status !== "ACCEPTED" || many.status !== "ACCEPTED")
      return;
    expect([none.mandateTotal, one.mandateTotal, many.mandateTotal]).toEqual([0, 1, 2]);
    expect(one.memberships).toHaveLength(1);
    expect(many.memberships).toHaveLength(1);
    expect(many.seats).toHaveLength(1);
  });

  it("gives every mandate exactly one outcome", () => {
    const parsed = parseActeur(
      acteurFile("PA1", [
        groupMandate("PM1", "PA1", "PO1"),
        seatMandate("PM2", "PA1"),
        {
          uid: "PM3",
          acteurRef: "PA1",
          typeOrgane: "COMPER",
          organes: { organeRef: ["PO8", "PO9"] },
        },
        groupMandate("PM4", "PA1", "PO1", { start: "nope" }),
        "not a mandate",
      ])
    );
    expect(parsed.status).toBe("ACCEPTED");
    if (parsed.status !== "ACCEPTED") return;
    expect(
      parsed.memberships.length +
        parsed.seats.length +
        parsed.outOfScopeMandates +
        parsed.rejectedMandates.length
    ).toBe(parsed.mandateTotal);
    expect(parsed.mandateTotal).toBe(5);
    expect(parsed.outOfScopeMandates).toBe(1);
    expect(parsed.rejectedMandates.map((r) => r.reason)).toEqual([
      "START_DATE_INVALID",
      "NOT_A_RECORD",
    ]);
  });

  it("never reads the organ reference of an out-of-scope mandate, even when it is a list", () => {
    const parsed = parseActeur(
      acteurFile("PA1", {
        uid: "PM3",
        acteurRef: "PA1",
        typeOrgane: "COMPER",
        organes: { organeRef: ["PO8", "PO9"] },
      })
    );
    expect(parsed.status === "ACCEPTED" && parsed.outOfScopeMandates).toBe(1);
  });

  it("rejects a group mandate that names several organs instead of picking one", () => {
    const parsed = parseActeur(acteurFile("PA1", groupMandate("PM1", "PA1", ["PO1", "PO2"])));
    expect(parsed.status === "ACCEPTED" && parsed.rejectedMandates).toEqual([
      { reason: "ORGAN_REF_NOT_SINGLE", typeOrgane: "GP", sourceRecordId: "PM1" },
    ]);
  });

  it("rejects a group mandate with no organ, and a mandate filed under another actor", () => {
    const noOrgan = { ...groupMandate("PM1", "PA1", "PO1"), organes: null };
    const other = groupMandate("PM2", "PA2", "PO1");
    const parsed = parseActeur(acteurFile("PA1", [noOrgan, other]));
    expect(parsed.status === "ACCEPTED" && parsed.rejectedMandates.map((r) => r.reason)).toEqual([
      "ORGAN_REF_MISSING",
      "ACTOR_MISMATCH",
    ]);
  });

  it.each([
    ["start after end", { start: "2023-01-02", end: "2023-01-01" }, "START_AFTER_END"],
    ["impossible end date", { end: "2023-13-01" }, "END_DATE_INVALID"],
    ["legislature not a number", { legislature: "x" }, "LEGISLATURE_MALFORMED"],
  ])("rejects a group mandate with %s", (_label, overrides, reason) => {
    const parsed = parseActeur(acteurFile("PA1", groupMandate("PM1", "PA1", "PO1", overrides)));
    expect(parsed.status === "ACCEPTED" && parsed.rejectedMandates[0]?.reason).toBe(reason);
  });

  it("keeps an open end as OPEN_AT_SNAPSHOT and a dated end as DATED", () => {
    const parsed = parseActeur(
      acteurFile("PA1", [
        groupMandate("PM1", "PA1", "PO1", { end: null }),
        groupMandate("PM2", "PA1", "PO2", { end: "2023-05-01" }),
      ])
    );
    if (parsed.status !== "ACCEPTED") throw new Error("expected acceptance");
    expect(parsed.memberships.map((m) => [m.endState, m.endDate])).toEqual([
      ["OPEN_AT_SNAPSHOT", null],
      ["DATED", "2023-05-01"],
    ]);
  });

  it("keeps a start that is absent as UNKNOWN instead of inventing a day", () => {
    const parsed = parseActeur(
      acteurFile("PA1", groupMandate("PM1", "PA1", "PO1", { start: null }))
    );
    if (parsed.status !== "ACCEPTED") throw new Error("expected acceptance");
    expect(parsed.memberships[0]).toMatchObject({ startState: "UNKNOWN", startDate: null });
  });

  it.each([
    ["no root", {}, "ROOT_MISSING"],
    ["no uid", { acteur: { mandats: null } }, "UID_MISSING"],
    ["mandats is a string", { acteur: { uid: "PA1", mandats: "x" } }, "MANDATES_MALFORMED"],
  ])("rejects an actor file with %s", (_label, raw, reason) => {
    const parsed = parseActeur(raw);
    expect(parsed.status === "REJECTED" && parsed.reason).toBe(reason);
  });

  it("reads no name: an actor with a civil status block carries none into the result", () => {
    const raw = acteurFile("PA1", groupMandate("PM1", "PA1", "PO1"));
    (raw["acteur"] as Record<string, unknown>)["etatCivil"] = {
      ident: { prenom: "Prénom", nom: "Nom" },
    };
    expect(JSON.stringify(parseActeur(raw))).not.toMatch(/Prénom|Nom"/);
  });
});

const organ = (ref: string, abbreviation: string, label: string): GroupOrganRecord => ({
  groupRef: asGroupRef(ref),
  legislature: 16,
  label,
  abbreviation,
  startDate: null,
  endDate: null,
});

function membership(ref: string, quality: string, n = 1): GroupMembershipEvidence[] {
  const parsed = parseActeur(
    acteurFile(
      "PA1",
      Array.from({ length: n }, (_, i) => groupMandate(`PM-${ref}-${i}`, "PA1", ref, { quality }))
    )
  );
  if (parsed.status !== "ACCEPTED") throw new Error("fixture");
  return parsed.memberships;
}

describe("classifyGroupOrgans: a non-registration needs two independent signals", () => {
  it("attests a non-registration when the name and the quality of every mandate agree", () => {
    const [result] = classifyGroupOrgans(
      [organ("PO1", "NI", "Non inscrit")],
      membership("PO1", "Député non-inscrit", 2)
    );
    expect(result).toMatchObject({
      kind: "NON_INSCRIT",
      diagnostic: null,
      nameSignal: "NON_INSCRIT",
      qualitySignal: "NON_INSCRIT",
    });
  });

  it("reads the older label of the same organ kind", () => {
    const [result] = classifyGroupOrgans(
      [organ("PO1", "NI", "Députés n'appartenant à aucun groupe")],
      membership("PO1", "Député non-inscrit")
    );
    expect(result?.kind).toBe("NON_INSCRIT");
  });

  it("makes a group when both signals say group, and keeps an empty organ a group", () => {
    const results = classifyGroupOrgans(
      [organ("PO1", "ABC", "Groupe ABC"), organ("PO2", "XYZ", "Groupe XYZ")],
      membership("PO1", "Membre")
    );
    expect(results.map((r) => [r.kind, r.qualitySignal])).toEqual([
      ["GROUP", "GROUP_MEMBER"],
      ["GROUP", "NO_MANDATES"],
    ]);
  });

  it("does not conclude when the name says non-registered and the mandates say member", () => {
    const [result] = classifyGroupOrgans(
      [organ("PO1", "NI", "Non inscrit")],
      membership("PO1", "Membre")
    );
    expect(result).toMatchObject({ kind: null, diagnostic: "NI_SIGNALS_CONFLICT" });
    // The source values are kept, nothing is invented.
    expect(result?.organ.abbreviation).toBe("NI");
    expect(result?.organ.label).toBe("Non inscrit");
  });

  it("does not conclude when the name says group and the mandates say non-registered", () => {
    const [result] = classifyGroupOrgans(
      [organ("PO1", "ABC", "Groupe ABC")],
      membership("PO1", "Député non-inscrit")
    );
    expect(result).toMatchObject({ kind: null, diagnostic: "NI_SIGNALS_CONFLICT" });
  });

  it("does not conclude on mixed qualities", () => {
    const mixed = [...membership("PO1", "Député non-inscrit"), ...membership("PO1", "Membre")];
    const [result] = classifyGroupOrgans([organ("PO1", "NI", "Non inscrit")], mixed);
    expect(result).toMatchObject({
      kind: null,
      diagnostic: "NI_SIGNALS_CONFLICT",
      qualitySignal: "MIXED",
    });
  });

  it("does not conclude when the abbreviation and the label disagree", () => {
    const [result] = classifyGroupOrgans(
      [organ("PO1", "NI", "Groupe ABC")],
      membership("PO1", "Député non-inscrit")
    );
    expect(result).toMatchObject({
      kind: null,
      diagnostic: "NI_SIGNALS_CONFLICT",
      nameSignal: "DISAGREE",
    });
  });

  it("does not attest a non-registration from the name alone", () => {
    const [result] = classifyGroupOrgans([organ("PO1", "NI", "Non inscrit")], []);
    expect(result).toMatchObject({ kind: null, diagnostic: "NI_SIGNAL_UNCONFIRMED" });
  });
});
