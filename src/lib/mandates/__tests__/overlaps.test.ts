import { describe, expect, it } from "vitest";
import { MandateType } from "@/generated/prisma";
import {
  findOverlappingParliamentaryMandates,
  partitionMandatesForDisplay,
  type MandateInterval,
} from "../overlaps";

function mandate(
  overrides: Partial<MandateInterval> & Pick<MandateInterval, "id">
): MandateInterval {
  const { id, ...rest } = overrides;
  return {
    id,
    politicianId: "jadot",
    type: MandateType.SENATEUR,
    startDate: new Date("2023-10-01T00:00:00.000Z"),
    endDate: null,
    isCurrent: true,
    ...rest,
  };
}

describe("findOverlappingParliamentaryMandates", () => {
  it("repère l'ancien mandat sénatorial qui chevauche celui de Yannick Jadot", () => {
    const erroneous = mandate({
      id: "erroneous-2020-row",
      startDate: new Date("2020-10-01T00:00:00.000Z"),
      endDate: new Date("2026-02-15T00:00:00.000Z"),
      isCurrent: false,
    });
    const current = mandate({ id: "valid-2023-row" });

    expect(findOverlappingParliamentaryMandates([erroneous, current])).toEqual([
      { first: erroneous, second: current },
    ]);
  });

  it("ne signale pas deux mandats successifs, même avec le même identifiant officiel", () => {
    const previous = mandate({
      id: "previous-term",
      externalId: "senat-21093M",
      startDate: new Date("2020-10-01T00:00:00.000Z"),
      endDate: new Date("2026-10-01T00:00:00.000Z"),
      isCurrent: false,
    });
    const next = mandate({
      id: "next-term",
      externalId: "senat-21093M",
      startDate: new Date("2026-10-01T00:00:00.000Z"),
      endDate: null,
      isCurrent: true,
    });

    expect(findOverlappingParliamentaryMandates([previous, next])).toEqual([]);
  });

  it("ne compare pas des personnes ou des fonctions différentes", () => {
    const senator = mandate({ id: "senator" });
    const deputy = mandate({ id: "deputy", type: MandateType.DEPUTE });
    const otherPerson = mandate({ id: "other-person", politicianId: "other" });

    expect(findOverlappingParliamentaryMandates([senator, deputy, otherPerson])).toEqual([]);
  });

  it("ne présente pas une fin inconnue comme un chevauchement démontré", () => {
    const unknownEnd = mandate({ id: "closed-without-end", isCurrent: false, endDate: null });
    const current = mandate({ id: "current", startDate: new Date("2024-01-01T00:00:00.000Z") });

    expect(findOverlappingParliamentaryMandates([unknownEnd, current])).toEqual([]);
  });
});

describe("partitionMandatesForDisplay", () => {
  it("keeps the current mandate visible and separates the overlapping ended period for review", () => {
    const former = mandate({
      id: "senator-2020",
      startDate: new Date("2020-10-01T00:00:00.000Z"),
      endDate: new Date("2026-02-15T00:00:00.000Z"),
      isCurrent: false,
    });
    const current = mandate({
      id: "senator-2023",
      startDate: new Date("2023-10-01T00:00:00.000Z"),
      isCurrent: true,
    });

    expect(partitionMandatesForDisplay([former, current])).toEqual({
      displayable: [current],
      toVerify: [{ first: former, second: current }],
    });
  });

  it("withholds both overlapping ended periods when neither is current", () => {
    const first = mandate({
      id: "senator-first",
      startDate: new Date("2020-10-01T00:00:00.000Z"),
      endDate: new Date("2024-10-01T00:00:00.000Z"),
      isCurrent: false,
    });
    const second = mandate({
      id: "senator-second",
      startDate: new Date("2023-10-01T00:00:00.000Z"),
      endDate: new Date("2025-10-01T00:00:00.000Z"),
      isCurrent: false,
    });

    expect(partitionMandatesForDisplay([first, second]).displayable).toEqual([]);
  });

  it("leaves non-overlapping and non-parliamentary mandates visible", () => {
    const senator = mandate({
      id: "senator",
      startDate: new Date("2023-10-01T00:00:00.000Z"),
      isCurrent: true,
    });
    const deputy = mandate({ id: "deputy", type: MandateType.DEPUTE });
    const otherOffice = mandate({ id: "minister", type: MandateType.MINISTRE });

    expect(partitionMandatesForDisplay([senator, deputy, otherOffice])).toEqual({
      displayable: [senator, deputy, otherOffice],
      toVerify: [],
    });
  });
});

