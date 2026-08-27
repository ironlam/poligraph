import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({ $queryRaw: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: dbMock }));

import { computeSenateParticipationAuditRows } from "@/services/senate-participation-audit";

function rawRow(recordedRows: number) {
  return {
    politicianId: `senator-${recordedRows}`,
    firstName: "Sénatrice",
    lastName: "Test",
    partyId: null,
    partyName: null,
    partyShortName: null,
    partyColor: null,
    partySlug: null,
    groupId: null,
    groupName: null,
    groupCode: null,
    groupColor: null,
    identityComplete: true,
    expressed: 3,
    nonVoting: recordedRows - 3,
    totalScrutins: 4,
    eligibleScrutins: 4,
    recordedRows,
  };
}

describe("audit en lecture seule de la participation sénatoriale", () => {
  beforeEach(() => vi.clearAllMocks());

  it("produit un candidat uniquement avec une couverture individuelle complète", async () => {
    dbMock.$queryRaw.mockResolvedValue([rawRow(4), rawRow(3)]);

    const rows = await computeSenateParticipationAuditRows();

    expect(rows[0]?.candidate).toMatchObject({
      votesCount: 3,
      eligibleScrutins: 4,
      participationRate: 75,
    });
    expect(rows[1]?.candidate).toBeNull();
  });

  it("neutralise un sénateur dont l'identité Sénat n'est pas reliée", async () => {
    dbMock.$queryRaw.mockResolvedValue([{ ...rawRow(4), identityComplete: false }]);

    const rows = await computeSenateParticipationAuditRows();

    expect(rows[0]?.candidate).toBeNull();
  });

  it("neutralise une période de mandat contenant un scrutin non vérifié", async () => {
    dbMock.$queryRaw.mockResolvedValue([{ ...rawRow(4), totalScrutins: 5 }]);

    const rows = await computeSenateParticipationAuditRows();

    expect(rows[0]?.candidate).toBeNull();
  });
});
