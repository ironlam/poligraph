import { describe, it, expect } from "vitest";
import { computeTransitions } from "../index";
import { buildDossierMaps, type ParsedDossier } from "../maps";

// computeTransitions is the pure decision core extracted from reconcileScrutinDossier,
// so the self-healing / applyClears policy is unit-testable without network or DB.

const DRONE: ParsedDossier = {
  externalId: "DRONE",
  titre: "aéronefs télépilotés cultures",
  reunionRefs: ["RU"],
  voteRefs: [],
};
const FRAUDES: ParsedDossier = {
  externalId: "FRAUDES",
  titre: "fraudes aux aides publiques",
  reunionRefs: ["RU"],
  voteRefs: [],
};
const maps = buildDossierMaps([DRONE, FRAUDES]);
const dossierIdByExt = new Map([
  ["DRONE", "d-drone"],
  ["FRAUDES", "d-fraudes"],
]);

describe("computeTransitions", () => {
  it("re-points a scrutin wrongly assigned to the drone dossier", () => {
    const t = computeTransitions(
      [
        {
          scrutinId: "s1",
          externalId: "V620",
          seanceRef: "RU",
          title: "proposition de loi contre toutes les fraudes aux aides publiques",
          previousDossierId: "d-drone",
        },
      ],
      maps,
      dossierIdByExt,
      { applyClears: false, repairRunId: "run1" }
    );
    expect(t[0]!.action).toBe("REPOINT");
    expect(t[0]!.appliedDossierId).toBe("d-fraudes");
  });

  it("creates a NEW_LINK when a scrutin has no previous dossier and resolves to one", () => {
    const t = computeTransitions(
      [
        {
          scrutinId: "s3",
          externalId: "V621",
          seanceRef: "RU",
          title: "proposition de loi contre toutes les fraudes aux aides publiques",
          previousDossierId: null,
        },
      ],
      maps,
      dossierIdByExt,
      { applyClears: false, repairRunId: "run1" }
    );
    expect(t[0]!.action).toBe("NEW_LINK");
    expect(t[0]!.appliedDossierId).toBe("d-fraudes");
  });

  it("keeps (does not clear) an ambiguous currently-linked scrutin when applyClears=false", () => {
    const ambiguous = buildDossierMaps([
      {
        externalId: "A",
        titre: "transports urbains collectifs",
        reunionRefs: ["RU2"],
        voteRefs: [],
      },
      {
        externalId: "B",
        titre: "transports urbains individuels",
        reunionRefs: ["RU2"],
        voteRefs: [],
      },
    ]);
    const t = computeTransitions(
      [
        {
          scrutinId: "s2",
          externalId: "V",
          seanceRef: "RU2",
          title: "proposition de loi transports urbains",
          previousDossierId: "d-a",
        },
      ],
      ambiguous,
      new Map([
        ["A", "d-a"],
        ["B", "d-b"],
      ]),
      { applyClears: false, repairRunId: "run1" }
    );
    expect(t[0]!.resolution).toBe("AMBIGUOUS");
    expect(t[0]!.action).toBe("KEEP");
    expect(t[0]!.appliedDossierId).toBe("d-a");
  });

  it("clears the same scrutin under applyClears=true", () => {
    const ambiguous = buildDossierMaps([
      {
        externalId: "A",
        titre: "transports urbains collectifs",
        reunionRefs: ["RU2"],
        voteRefs: [],
      },
      {
        externalId: "B",
        titre: "transports urbains individuels",
        reunionRefs: ["RU2"],
        voteRefs: [],
      },
    ]);
    const t = computeTransitions(
      [
        {
          scrutinId: "s2",
          externalId: "V",
          seanceRef: "RU2",
          title: "proposition de loi transports urbains",
          previousDossierId: "d-a",
        },
      ],
      ambiguous,
      new Map([
        ["A", "d-a"],
        ["B", "d-b"],
      ]),
      { applyClears: true, repairRunId: "run1" }
    );
    expect(t[0]!.action).toBe("CLEAR");
    expect(t[0]!.appliedDossierId).toBeNull();
  });

  it("second identical pass yields no applied transitions (idempotent)", () => {
    const t = computeTransitions(
      [
        {
          scrutinId: "s1",
          externalId: "V620",
          seanceRef: "RU",
          title: "proposition de loi contre toutes les fraudes aux aides publiques",
          previousDossierId: "d-fraudes",
        },
      ],
      maps,
      dossierIdByExt,
      { applyClears: false, repairRunId: "run1" }
    );
    expect(t[0]!.action).toBe("NOOP");
  });
});
