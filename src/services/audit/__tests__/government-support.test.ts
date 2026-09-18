import { describe, expect, it } from "vitest";
import { auditGovernmentSupport } from "../government-support";

// Synthetic AN-shaped sources. No DB state or current group memberships enter this audit.
function vote(numero: string, codeTypeVote: string, title = "l'ensemble du projet de loi test.") {
  return {
    scrutin: {
      uid: `VTANR5L17V${numero}`,
      numero,
      legislature: "17",
      titre: title,
      dateScrutin: "2026-01-01",
      typeVote: { codeTypeVote },
    },
  };
}
const dossier = {
  dossierParlementaire: {
    uid: "DLR5L17N1",
    titreDossier: { titre: "Projet de loi test" },
    actesLegislatifs: {
      acteLegislatif: [
        {
          "@xsi:type": "DepotInitiative_Type",
          uid: "DEP1",
          codeActe: "AN1-DEPOT",
          texteAssocie: "PRJLANR5L17B1",
          dateActe: "2025-12-01",
        },
        { voteRefs: { voteRef: ["VTANR5L17V1", "VTANR5L17V2", "VTANR5L17V3"] } },
      ],
    },
  },
};

describe("source comparison audit", () => {
  it("compares SPS without collapsing successive readings of the same dossier", () => {
    const audit = auditGovernmentSupport(
      [
        vote("1", "SPS"),
        vote("2", "SPO"),
        vote("3", "SPS", "la première partie du projet de loi test."),
      ],
      [dossier]
    );
    expect(audit.summary).toMatchObject({
      confirmedAll: 2,
      confirmedSps: 1,
      removedBySps: 1,
      confirmedDistinctDossiers: 1,
    });
    expect(audit.rows[2]?.exclusion).toBe("NOT_WHOLE_BILL");
    expect(audit.rows[0]?.groups.issues).not.toHaveLength(0);
  });
  it("fails rather than silently producing a partial report on corrupt or duplicate inputs", () => {
    expect(() => auditGovernmentSupport([{}], [dossier])).toThrow();
    expect(() => auditGovernmentSupport([vote("1", "SPS"), vote("1", "SPS")], [dossier])).toThrow(
      "dupliqué"
    );
    expect(() => auditGovernmentSupport([], [dossier, dossier])).toThrow("dupliqué");
  });
  it("does not count an unlinked vote just because its title and code look eligible", () => {
    const audit = auditGovernmentSupport([vote("4", "SPS")], [dossier]);
    expect(audit.summary.confirmedAll).toBe(0);
    expect(audit.rows[0]?.exclusion).toBe("DOSSIER_UNRESOLVED");
  });
  it("reports discrepant group totals without changing the common scrutiny population", () => {
    const scrutin = {
      ...vote("1", "SPS").scrutin,
      syntheseVote: { decompte: { pour: "10", contre: "2", abstentions: "0" } },
      ventilationVotes: {
        organe: {
          groupes: {
            groupe: {
              organeRef: "PO123",
              nombreMembresGroupe: "20",
              vote: {
                positionMajoritaire: "pour",
                decompteVoix: {
                  pour: "9",
                  contre: "2",
                  abstentions: "0",
                  nonVotants: "0",
                  nonVotantsVolontaires: "0",
                },
              },
            },
          },
        },
      },
    };
    const audit = auditGovernmentSupport([{ scrutin }], [dossier]);
    expect(audit.rows[0]?.groupConsistencyIssues).toEqual(["GROUP_TOTAL_MISMATCH:pour"]);
    expect(audit.summary.confirmedAll).toBe(1);
    expect(audit.summary.confirmedScrutinsWithGroupAnomalies).toBe(1);
    expect(audit.summary.groupSourceCoverage[0]?.completeAll).toBe(0);
  });
});
