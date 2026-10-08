import { describe, expect, it } from "vitest";
import type {
  Involvement,
  MonitoringDueReason,
  MonitoringFlag,
  PublicationStatus,
} from "@/generated/prisma";
import { isInScope, needsHumanReason, needsHumanWhere } from "../needs-human";

const d = (s: string) => new Date(s + "T00:00:00Z");
const today = d("2026-12-02");

function row(
  over: {
    active?: boolean;
    nextReviewAt?: Date;
    dueReason?: MonitoringDueReason;
    flaggedReason?: MonitoringFlag | null;
    publicationStatus?: PublicationStatus;
    involvement?: Involvement;
  } = {}
) {
  return {
    active: over.active ?? true,
    nextReviewAt: over.nextReviewAt ?? d("2027-01-15"),
    dueReason: over.dueReason ?? ("CADENCE" as MonitoringDueReason),
    flaggedReason: over.flaggedReason ?? null,
    affair: {
      publicationStatus: over.publicationStatus ?? ("PUBLISHED" as PublicationStatus),
      involvement: over.involvement ?? ("DIRECT" as Involvement),
    },
  };
}

describe("isInScope", () => {
  it("accepte une affaire publiée et directe", () => {
    expect(isInScope({ publicationStatus: "PUBLISHED", involvement: "DIRECT" })).toBe(true);
  });
  it("refuse un brouillon ou un rôle indirect", () => {
    expect(isInScope({ publicationStatus: "DRAFT", involvement: "DIRECT" })).toBe(false);
    expect(isInScope({ publicationStatus: "PUBLISHED", involvement: "INDIRECT" })).toBe(false);
  });
});

describe("needsHumanReason", () => {
  it("remonte un signal même avec une date future", () => {
    expect(needsHumanReason(row({ flaggedReason: "SIGNAL" }), today)).toBe("SIGNAL");
  });
  it("remonte un garde-fou", () => {
    expect(needsHumanReason(row({ flaggedReason: "GARDE_FOU" }), today)).toBe("GARDE_FOU");
  });
  it("remonte un délibéré arrivé à échéance, pas le lendemain de l'échéance", () => {
    expect(
      needsHumanReason(row({ dueReason: "DELIBERE", nextReviewAt: d("2026-12-02") }), today)
    ).toBe("DATE_ATTENDUE");
    expect(
      needsHumanReason(row({ dueReason: "DELIBERE", nextReviewAt: d("2026-12-03") }), today)
    ).toBeNull();
  });
  it("remonte une audience arrivée à échéance", () => {
    expect(
      needsHumanReason(row({ dueReason: "AUDIENCE", nextReviewAt: d("2026-12-01") }), today)
    ).toBe("DATE_ATTENDUE");
  });
  it("remonte une cadence le jour même, pas la veille de son échéance", () => {
    expect(
      needsHumanReason(row({ dueReason: "CADENCE", nextReviewAt: d("2026-12-02") }), today)
    ).toBe("ECHUE");
    expect(
      needsHumanReason(row({ dueReason: "CADENCE", nextReviewAt: d("2026-12-03") }), today)
    ).toBeNull();
  });
  it("remonte une cadence dépassée", () => {
    expect(
      needsHumanReason(row({ dueReason: "CADENCE", nextReviewAt: d("2026-11-20") }), today)
    ).toBe("ECHUE");
  });
  it("remonte un report manuel et un délai de recours le jour même", () => {
    expect(
      needsHumanReason(row({ dueReason: "MANUEL", nextReviewAt: d("2026-12-02") }), today)
    ).toBe("ECHUE");
    expect(
      needsHumanReason(row({ dueReason: "DELAI_RECOURS", nextReviewAt: d("2026-12-02") }), today)
    ).toBe("ECHUE");
  });
  it("donne la priorité au signal sur la date", () => {
    expect(
      needsHumanReason(
        row({ flaggedReason: "SIGNAL", dueReason: "DELIBERE", nextReviewAt: d("2026-11-01") }),
        today
      )
    ).toBe("SIGNAL");
  });
  it("garde DATE_ATTENDUE pour un délibéré dépassé", () => {
    expect(
      needsHumanReason(row({ dueReason: "DELIBERE", nextReviewAt: d("2026-11-01") }), today)
    ).toBe("DATE_ATTENDUE");
  });
  it("ignore un brouillon, un rôle indirect et un suivi inactif", () => {
    expect(
      needsHumanReason(row({ flaggedReason: "SIGNAL", publicationStatus: "DRAFT" }), today)
    ).toBeNull();
    expect(
      needsHumanReason(row({ flaggedReason: "SIGNAL", involvement: "INDIRECT" }), today)
    ).toBeNull();
    expect(needsHumanReason(row({ flaggedReason: "SIGNAL", active: false }), today)).toBeNull();
    expect(
      needsHumanReason(row({ nextReviewAt: d("2026-12-02"), publicationStatus: "DRAFT" }), today)
    ).toBeNull();
    expect(
      needsHumanReason(row({ nextReviewAt: d("2026-12-02"), involvement: "INDIRECT" }), today)
    ).toBeNull();
    expect(
      needsHumanReason(row({ nextReviewAt: d("2026-12-02"), active: false }), today)
    ).toBeNull();
  });
});

describe("needsHumanWhere", () => {
  it("encode le périmètre, le flag et l'échéance atteinte", () => {
    expect(needsHumanWhere(today)).toEqual({
      active: true,
      affair: { publicationStatus: "PUBLISHED", involvement: "DIRECT" },
      OR: [{ flaggedReason: { not: null } }, { nextReviewAt: { lte: today } }],
    });
  });
});
