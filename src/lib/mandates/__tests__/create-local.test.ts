import { beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalMandateSchema } from "@/lib/security/schemas/mandate";

const h = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  communeFindUnique: vi.fn(),
  mandateFindFirst: vi.fn(),
  mandateCreate: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock("@/lib/db", () => {
  const tx = {
    $queryRaw: h.queryRaw,
    commune: { findUnique: h.communeFindUnique },
    mandate: { findFirst: h.mandateFindFirst, create: h.mandateCreate },
    auditLog: { create: h.auditCreate },
  };
  return { db: { $transaction: (fn: (client: typeof tx) => unknown) => fn(tx) } };
});

import { createLocalMandate } from "../create-local";

const META = { ip: "203.0.113.1", userAgent: "test-agent" };

/** A past mayor's term known to the year: the case the form exists for. */
const PAST_MAYOR = {
  type: "MAIRE",
  title: "Maire de Saint-Exemple",
  institution: "Mairie de Saint-Exemple",
  communeId: "13099",
  startDate: "2001",
  endDate: "2014-03",
  isCurrent: false,
  sourceUrl: "https://example.org/arrete",
};

function parse(body: unknown) {
  const result = createLocalMandateSchema.safeParse(body);
  if (!result.success) throw new Error(JSON.stringify(result.error.issues));
  return result.data;
}

function issuesOf(body: unknown): string[] {
  const result = createLocalMandateSchema.safeParse(body);
  return result.success ? [] : result.error.issues.map((i) => String(i.path[0]));
}

beforeEach(() => {
  vi.clearAllMocks();
  h.queryRaw.mockResolvedValue([{ id: "pol_1", slug: "camille-riviere" }]);
  h.communeFindUnique.mockResolvedValue({ id: "13099", departmentCode: "13" });
  h.mandateFindFirst.mockResolvedValue(null);
  h.mandateCreate.mockResolvedValue({ id: "man_1", publicId: "MA-1" });
  h.auditCreate.mockResolvedValue({});
});

describe("createLocalMandateSchema", () => {
  it("accepte un mandat de maire terminé, daté à l'année", () => {
    expect(issuesOf(PAST_MAYOR)).toEqual([]);
  });

  it("refuse une saisie sans source", () => {
    const { sourceUrl: _omitted, ...body } = PAST_MAYOR;
    expect(issuesOf(body)).toEqual(["sourceUrl"]);
  });

  it.each(["http://example.org/a", "javascript:alert(1)", "example.org"])(
    "refuse la source %s",
    (sourceUrl) => {
      expect(issuesOf({ ...PAST_MAYOR, sourceUrl })).toEqual(["sourceUrl"]);
    }
  );

  it("refuse un maire en cours, qui relève du répertoire des élus", () => {
    expect(issuesOf({ ...PAST_MAYOR, endDate: null, isCurrent: true })).toEqual(["isCurrent"]);
  });

  it("accepte un adjoint en cours : la règle ne vise que le maire", () => {
    expect(
      issuesOf({ ...PAST_MAYOR, type: "ADJOINT_MAIRE", endDate: null, isCurrent: true })
    ).toEqual([]);
  });

  it("exige le territoire du type, par son code", () => {
    const { communeId: _omitted, ...noCommune } = PAST_MAYOR;
    expect(issuesOf(noCommune)).toEqual(["communeId"]);
    expect(issuesOf({ ...noCommune, type: "PRESIDENT_DEPARTEMENT" })).toEqual(["departmentCode"]);
    expect(
      issuesOf({ ...noCommune, type: "PRESIDENT_DEPARTEMENT", departmentCode: "999" })
    ).toEqual(["departmentCode"]);
    expect(issuesOf({ ...noCommune, type: "PRESIDENT_DEPARTEMENT", departmentCode: "83" })).toEqual(
      []
    );
    expect(issuesOf({ ...noCommune, type: "PRESIDENT_REGION" })).toEqual(["regionCode"]);
    expect(issuesOf({ ...noCommune, type: "PRESIDENT_REGION", regionCode: "93" })).toEqual([]);
  });

  it("n'exige aucun code pour une présidence d'intercommunalité", () => {
    const { communeId: _omitted, ...body } = PAST_MAYOR;
    expect(issuesOf({ ...body, type: "PRESIDENT_INTERCOMMUNALITE" })).toEqual([]);
    expect(issuesOf({ ...body, type: "PRESIDENT_INTERCOMMUNALITE", epciSiren: "24830" })).toEqual([
      "epciSiren",
    ]);
  });

  it("refuse une date mal formée, une fin sur un mandat en cours, une fin avant le début", () => {
    expect(issuesOf({ ...PAST_MAYOR, startDate: "25/03/2001" })).toEqual(["startDate"]);
    expect(
      issuesOf({ ...PAST_MAYOR, type: "ADJOINT_MAIRE", isCurrent: true, endDate: "2014" })
    ).toEqual(["endDate"]);
    expect(issuesOf({ ...PAST_MAYOR, endDate: "1999" })).toEqual(["endDate"]);
  });

  it("refuse un type national", () => {
    expect(issuesOf({ ...PAST_MAYOR, type: "DEPUTE" })).toEqual(["type"]);
  });
});

describe("createLocalMandate", () => {
  it("écrit le mandat avec la précision saisie, sans inventer de jour", async () => {
    const result = await createLocalMandate("pol_1", parse(PAST_MAYOR), META);

    expect(result).toEqual({
      kind: "created",
      mandate: { id: "man_1", publicId: "MA-1" },
      politician: { id: "pol_1", slug: "camille-riviere" },
    });
    expect(h.mandateCreate.mock.calls[0]![0].data).toEqual({
      politicianId: "pol_1",
      type: "MAIRE",
      title: "Maire de Saint-Exemple",
      institution: "Mairie de Saint-Exemple",
      departmentCode: "13",
      startDate: new Date("2001-01-01T00:00:00Z"),
      startDatePrecision: "YEAR",
      endDate: new Date("2014-03-01T00:00:00Z"),
      endDatePrecision: "MONTH",
      isCurrent: false,
      source: "MANUAL",
      sourceUrl: "https://example.org/arrete",
      officialUrl: null,
      localData: { create: { communeId: "13099", regionCode: null, epciSiren: null } },
    });
  });

  it("garde inconnue la fin d'un mandat terminé sans date", async () => {
    await createLocalMandate("pol_1", parse({ ...PAST_MAYOR, endDate: null }), META);
    const data = h.mandateCreate.mock.calls[0]![0].data;
    expect(data.isCurrent).toBe(false);
    expect(data.endDate).toBeNull();
  });

  it("n'écrit pas d'extension locale quand le type n'a ni commune, ni région, ni SIREN", async () => {
    const { communeId: _omitted, ...body } = PAST_MAYOR;
    await createLocalMandate(
      "pol_1",
      parse({ ...body, type: "PRESIDENT_DEPARTEMENT", departmentCode: "83" }),
      META
    );
    const data = h.mandateCreate.mock.calls[0]![0].data;
    expect(data.departmentCode).toBe("83");
    expect(data.localData).toBeUndefined();
  });

  it("écrit l'audit dans la même transaction, avec les dates telles que saisies", async () => {
    await createLocalMandate("pol_1", parse(PAST_MAYOR), META);
    expect(h.auditCreate.mock.calls[0]![0].data).toMatchObject({
      action: "CREATE",
      entityType: "Mandate",
      entityId: "man_1",
      ipAddress: "203.0.113.1",
      changes: { startDate: "2001", endDate: "2014-03", communeId: "13099", source: "MANUAL" },
    });
  });

  it("verrouille la fiche avant de chercher un doublon", async () => {
    const order: string[] = [];
    h.queryRaw.mockImplementation(async () => {
      order.push("lock");
      return [{ id: "pol_1", slug: "camille-riviere" }];
    });
    h.mandateFindFirst.mockImplementation(async () => {
      order.push("duplicate-check");
      return null;
    });
    await createLocalMandate("pol_1", parse(PAST_MAYOR), META);
    expect(order).toEqual(["lock", "duplicate-check"]);
  });

  it("refuse un mandat déjà enregistré, sans rien écrire", async () => {
    h.mandateFindFirst.mockResolvedValue({ id: "man_existing" });
    const result = await createLocalMandate("pol_1", parse(PAST_MAYOR), META);

    expect(result).toEqual({ kind: "duplicate", mandateId: "man_existing" });
    expect(h.mandateFindFirst.mock.calls[0]![0].where).toEqual({
      politicianId: "pol_1",
      type: "MAIRE",
      startDate: new Date("2001-01-01T00:00:00Z"),
      departmentCode: "13",
      localData: { is: { communeId: "13099", regionCode: null, epciSiren: null } },
    });
    expect(h.mandateCreate).not.toHaveBeenCalled();
    expect(h.auditCreate).not.toHaveBeenCalled();
  });

  it("refuse une fiche ou une commune inconnue, sans rien écrire", async () => {
    h.communeFindUnique.mockResolvedValue(null);
    expect(await createLocalMandate("pol_1", parse(PAST_MAYOR), META)).toEqual({
      kind: "commune-not-found",
      communeId: "13099",
    });
    h.queryRaw.mockResolvedValue([]);
    expect(await createLocalMandate("pol_x", parse(PAST_MAYOR), META)).toEqual({
      kind: "politician-not-found",
    });
    expect(h.mandateCreate).not.toHaveBeenCalled();
  });

  it("laisse remonter l'échec de l'audit, pour que la transaction annule le mandat", async () => {
    h.auditCreate.mockRejectedValue(new Error("audit indisponible"));
    await expect(createLocalMandate("pol_1", parse(PAST_MAYOR), META)).rejects.toThrow(
      "audit indisponible"
    );
  });
});
