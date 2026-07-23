import { describe, it, expect, afterAll, beforeAll } from "vitest";
import type { ParsedTitle } from "@/services/sync/link-scrutins-to-amendments/types";
import { parseScrutinTitle } from "@/services/sync/link-scrutins-to-amendments/parse-title";

const describeIfDb = process.env.DATABASE_URL ? describe : describe.skip;

let db: typeof import("@/lib/db").db;
let resolveLinks: typeof import("@/services/sync/link-scrutins-to-amendments/resolve").resolveLinks;

const SCRUTIN_PFX = "TEST_LINK_S_";
const AMEND_PFX = "TEST_LINK_A_";

const parsedPotier: ParsedTitle = {
  principalNumbers: [],
  subAmendmentNumber: "2368",
  parentAmendmentNumber: "2058",
  hasIdentique: true,
  identiqueNumbers: [],
  deliberation: null,
  warnings: [],
  confidence: 0.85,
};

describeIfDb("resolveLinks", () => {
  beforeAll(async () => {
    ({ db } = await import("@/lib/db"));
    ({ resolveLinks } = await import("@/services/sync/link-scrutins-to-amendments/resolve"));
    await db.legislativeDossier.upsert({
      where: { externalId: "TEST_LINK_DLR_1" },
      create: {
        externalId: "TEST_LINK_DLR_1",
        slug: "test-link-dossier",
        title: "Test dossier",
        status: "EN_COURS",
      },
      update: {},
    });
    const dossierId = (
      await db.legislativeDossier.findUniqueOrThrow({ where: { externalId: "TEST_LINK_DLR_1" } })
    ).id;

    await db.scrutinAmendment.deleteMany({
      where: { amendment: { externalId: { startsWith: AMEND_PFX } } },
    });
    await db.amendment.deleteMany({ where: { externalId: { startsWith: AMEND_PFX } } });
    await db.amendment.createMany({
      data: [
        {
          externalId: `${AMEND_PFX}2058`,
          number: "2058",
          texteRef: "TEST_PIONANR_1",
          dossierId,
          status: "ADOPTE",
          legislature: 17,
          chamber: "AN",
          identicalGroupKey: "GRP_TEST",
        },
        {
          externalId: `${AMEND_PFX}2074`,
          number: "2074",
          texteRef: "TEST_PIONANR_1",
          dossierId,
          status: "ADOPTE",
          legislature: 17,
          chamber: "AN",
          identicalGroupKey: "GRP_TEST",
        },
        {
          externalId: `${AMEND_PFX}2368`,
          number: "2368",
          texteRef: "TEST_PIONANR_1",
          dossierId,
          status: "ADOPTE",
          legislature: 17,
          chamber: "AN",
        },
      ],
    });

    await db.scrutinAmendment.deleteMany({
      where: { scrutin: { externalId: { startsWith: SCRUTIN_PFX } } },
    });
    await db.scrutin.deleteMany({ where: { externalId: { startsWith: SCRUTIN_PFX } } });
    await db.scrutin.create({
      data: {
        externalId: `${SCRUTIN_PFX}1`,
        title:
          "le sous-amendement n° 2368 de M. Potier à l'amendement n° 2058 du Gouvernement et l'amendement identique suivant",
        votingDate: new Date("2026-05-22T10:00:00Z"),
        legislature: 17,
        chamber: "AN",
        votesFor: 287,
        votesAgainst: 222,
        votesAbstain: 14,
        result: "ADOPTED",
        dossierLegislatifId: dossierId,
      },
    });
  });

  afterAll(async () => {
    await db.scrutinAmendment.deleteMany({
      where: { scrutin: { externalId: { startsWith: SCRUTIN_PFX } } },
    });
    await db.scrutin.deleteMany({ where: { externalId: { startsWith: SCRUTIN_PFX } } });
    await db.amendment.deleteMany({ where: { externalId: { startsWith: AMEND_PFX } } });
    await db.legislativeDossier.deleteMany({ where: { externalId: "TEST_LINK_DLR_1" } });
  });

  it("resolves SUB + PARENT + IDENTICAL roles when the scrutin is dossier-scoped", async () => {
    const scrutin = await db.scrutin.findUniqueOrThrow({
      where: { externalId: `${SCRUTIN_PFX}1` },
    });
    const res = await resolveLinks(scrutin, parsedPotier);
    expect(res.scope).toBe("dossier");
    expect(res.links.map((l) => l.role).sort()).toEqual([
      "IDENTICAL",
      "PARENT_AMENDMENT",
      "SUB_AMENDMENT",
    ]);
    const amendments = await db.amendment.findMany({
      where: { externalId: { startsWith: AMEND_PFX } },
      select: { id: true, externalId: true },
    });
    const idByExt = new Map(amendments.map((a) => [a.externalId, a.id]));
    expect(res.links.find((l) => l.role === "SUB_AMENDMENT")!.amendmentId).toBe(
      idByExt.get(`${AMEND_PFX}2368`)
    );
    expect(res.links.find((l) => l.role === "PARENT_AMENDMENT")!.amendmentId).toBe(
      idByExt.get(`${AMEND_PFX}2058`)
    );
    expect(res.links.find((l) => l.role === "IDENTICAL")!.amendmentId).toBe(
      idByExt.get(`${AMEND_PFX}2074`)
    );
  });

  it("returns unscoped + no links when the scrutin has no dossier link", async () => {
    const ds = await db.scrutin.create({
      data: {
        externalId: `${SCRUTIN_PFX}orphan`,
        title: "l'amendement n° 1234 du Gouvernement",
        votingDate: new Date("2026-05-22T10:00:00Z"),
        legislature: 17,
        chamber: "AN",
        votesFor: 1,
        votesAgainst: 0,
        votesAbstain: 0,
        result: "ADOPTED",
        dossierLegislatifId: null,
      },
    });
    const res = await resolveLinks(ds, {
      ...parsedPotier,
      principalNumbers: ["1234"],
      subAmendmentNumber: null,
      parentAmendmentNumber: null,
      hasIdentique: false,
    });
    expect(res.scope).toBe("unscoped");
    expect(res.links).toHaveLength(0);
    expect(res.warnings.some((w) => w.code === "UNSCOPED")).toBe(true);
  });

  it("AMBIGUOUS_CANDIDATES writes NO link in V1 (no arbitrary first-pick)", async () => {
    const dossierId = (
      await db.legislativeDossier.findUniqueOrThrow({ where: { externalId: "TEST_LINK_DLR_1" } })
    ).id;
    await db.amendment.create({
      data: {
        externalId: `${AMEND_PFX}dup_a`,
        number: "555",
        texteRef: "TEST_PIONANR_1",
        dossierId,
        status: "DEPOSE",
        legislature: 17,
        chamber: "AN",
      },
    });
    await db.amendment.create({
      data: {
        externalId: `${AMEND_PFX}dup_b`,
        number: "555",
        texteRef: "TEST_PIONANR_2",
        dossierId,
        status: "DEPOSE",
        legislature: 17,
        chamber: "AN",
      },
    });
    const scrutin = await db.scrutin.findUniqueOrThrow({
      where: { externalId: `${SCRUTIN_PFX}1` },
    });
    const res = await resolveLinks(scrutin, {
      ...parsedPotier,
      subAmendmentNumber: null,
      parentAmendmentNumber: null,
      principalNumbers: ["555"],
      hasIdentique: false,
    });
    expect(res.warnings.some((w) => w.code === "AMBIGUOUS_CANDIDATES")).toBe(true);
    expect(res.links.filter((l) => l.role === "PRINCIPAL")).toHaveLength(0);
  });

  it("matches a rectified variant (title '600' → candidate '600 (Rect)') when unique", async () => {
    const dossierId = (
      await db.legislativeDossier.findUniqueOrThrow({ where: { externalId: "TEST_LINK_DLR_1" } })
    ).id;
    await db.amendment.create({
      data: {
        externalId: `${AMEND_PFX}rect_one`,
        number: "600 (Rect)",
        texteRef: "TEST_PIONANR_1",
        dossierId,
        status: "ADOPTE",
        legislature: 17,
        chamber: "AN",
      },
    });
    const scrutin = await db.scrutin.findUniqueOrThrow({
      where: { externalId: `${SCRUTIN_PFX}1` },
    });
    const res = await resolveLinks(scrutin, {
      ...parsedPotier,
      subAmendmentNumber: null,
      parentAmendmentNumber: null,
      principalNumbers: ["600"],
      hasIdentique: false,
    });
    const link = res.links.find((l) => l.role === "PRINCIPAL");
    expect(link).toBeDefined();
    const a = await db.amendment.findUnique({ where: { externalId: `${AMEND_PFX}rect_one` } });
    expect(link?.amendmentId).toBe(a?.id);
  });

  it("does NOT match when multiple rectified variants exist (ambiguous)", async () => {
    const dossierId = (
      await db.legislativeDossier.findUniqueOrThrow({ where: { externalId: "TEST_LINK_DLR_1" } })
    ).id;
    await db.amendment.create({
      data: {
        externalId: `${AMEND_PFX}rect_a`,
        number: "777 (Rect)",
        texteRef: "TEST_PIONANR_1",
        dossierId,
        status: "DEPOSE",
        legislature: 17,
        chamber: "AN",
      },
    });
    await db.amendment.create({
      data: {
        externalId: `${AMEND_PFX}rect_b`,
        number: "777 (Rect 2)",
        texteRef: "TEST_PIONANR_1",
        dossierId,
        status: "DEPOSE",
        legislature: 17,
        chamber: "AN",
      },
    });
    const scrutin = await db.scrutin.findUniqueOrThrow({
      where: { externalId: `${SCRUTIN_PFX}1` },
    });
    const res = await resolveLinks(scrutin, {
      ...parsedPotier,
      subAmendmentNumber: null,
      parentAmendmentNumber: null,
      principalNumbers: ["777"],
      hasIdentique: false,
    });
    expect(res.warnings.some((w) => w.code === "AMBIGUOUS_CANDIDATES")).toBe(true);
    expect(res.links.filter((l) => l.role === "PRINCIPAL")).toHaveLength(0);
  });

  it("warns CANDIDATE_NOT_FOUND when a cited number resolves to nothing in scope", async () => {
    const scrutin = await db.scrutin.findUniqueOrThrow({
      where: { externalId: `${SCRUTIN_PFX}1` },
    });
    const res = await resolveLinks(scrutin, {
      ...parsedPotier,
      subAmendmentNumber: null,
      parentAmendmentNumber: null,
      principalNumbers: ["999999"],
      hasIdentique: false,
    });
    expect(res.warnings.some((w) => w.code === "CANDIDATE_NOT_FOUND")).toBe(true);
    expect(res.links.some((l) => l.role === "PRINCIPAL")).toBe(false);
  });

  it("drops parent link and marks TARGET_SUB_AMENDMENT_NOT_FOUND when the sub target is missing", async () => {
    const scrutin = await db.scrutin.findUniqueOrThrow({
      where: { externalId: `${SCRUTIN_PFX}1` },
    });
    const res = await resolveLinks(scrutin, {
      ...parsedPotier,
      subAmendmentNumber: "999999",
      parentAmendmentNumber: "2058",
      principalNumbers: [],
      hasIdentique: false,
    });
    expect(res.warnings.some((w) => w.code === "TARGET_SUB_AMENDMENT_NOT_FOUND")).toBe(true);
    expect(res.links).toHaveLength(0);
  });
});

describeIfDb("dedupeLinks (pure)", () => {
  it("collapses the same amendment to one link with the higher-priority role", async () => {
    const { dedupeLinks } = await import("@/services/sync/link-scrutins-to-amendments/resolve");
    const out = dedupeLinks([
      {
        scrutinId: "s1",
        amendmentId: "a1",
        role: "IDENTICAL",
        parserConfidence: 0.9,
        parserWarnings: [],
      },
      {
        scrutinId: "s1",
        amendmentId: "a1",
        role: "PRINCIPAL",
        parserConfidence: 0.7,
        parserWarnings: [],
      },
      {
        scrutinId: "s1",
        amendmentId: "a2",
        role: "SUB_AMENDMENT",
        parserConfidence: 0.8,
        parserWarnings: [],
      },
    ]);
    expect(out).toHaveLength(2);
    expect(out.find((l) => l.amendmentId === "a1")!.role).toBe("PRINCIPAL");
    expect(out.find((l) => l.amendmentId === "a2")!.role).toBe("SUB_AMENDMENT");
  });
});

/**
 * Délibération-aware fallback for the ambiguous same-number case: on a dossier
 * where numbers 1 and 2 exist in BOTH première (D1) and seconde (D2)
 * délibération, a plain (dossier, number) match is ambiguous and fails closed.
 * The fallback disambiguates using the délibération cited in the title and the
 * D1/D2 marker in the amendment uid. Mirrors the V8428 / V8429 shape (no
 * externalId hardcoded — the marker is generic).
 */
describeIfDb("resolveLinks — délibération-aware fallback", () => {
  const DLR_EXT = "TEST_DELIB_DLR";
  const AMEND_PFX = "TEST_DELIB_A_";
  const SCRUTIN_PFX = "TEST_DELIB_S_";

  // externalIds carry the P0D1N / P0D2N marker the resolver reads.
  const GOV1_D1 = `${AMEND_PFX}gov1_P0D1N`;
  const GOV1_D2 = `${AMEND_PFX}gov1_P0D2N`;
  const GOULET2_D1 = `${AMEND_PFX}goulet2_P0D1N`;
  const GOULET2_D2 = `${AMEND_PFX}goulet2_P0D2N`;
  const N8A_D1 = `${AMEND_PFX}n8a_P0D1N`;
  const N8B_D1 = `${AMEND_PFX}n8b_P0D1N`;
  const N9A_D2 = `${AMEND_PFX}n9a_P0D2N`;
  const N9B_D2 = `${AMEND_PFX}n9b_P0D2N`;

  let dossierId: string;
  let idByExt: Map<string, string>;

  async function makeScrutin(suffix: string, title: string) {
    return db.scrutin.create({
      data: {
        externalId: `${SCRUTIN_PFX}${suffix}`,
        title,
        votingDate: new Date("2026-05-22T10:00:00Z"),
        legislature: 17,
        chamber: "AN",
        votesFor: 1,
        votesAgainst: 0,
        votesAbstain: 0,
        result: "ADOPTED",
        dossierLegislatifId: dossierId,
      },
    });
  }

  beforeAll(async () => {
    ({ db } = await import("@/lib/db"));
    ({ resolveLinks } = await import("@/services/sync/link-scrutins-to-amendments/resolve"));

    await db.scrutinAmendment.deleteMany({
      where: { scrutin: { externalId: { startsWith: SCRUTIN_PFX } } },
    });
    await db.scrutin.deleteMany({ where: { externalId: { startsWith: SCRUTIN_PFX } } });
    await db.amendment.deleteMany({ where: { externalId: { startsWith: AMEND_PFX } } });
    await db.legislativeDossier.deleteMany({ where: { externalId: DLR_EXT } });

    const dossier = await db.legislativeDossier.create({
      data: {
        externalId: DLR_EXT,
        slug: "test-delib-dossier",
        title: "Test délibération dossier",
        status: "EN_COURS",
      },
    });
    dossierId = dossier.id;

    await db.amendment.createMany({
      data: [
        // number 1 in D1 and D2, both Government (mirror V8429's target)
        {
          externalId: GOV1_D1,
          number: "1",
          dossierId,
          status: "ADOPTE",
          legislature: 17,
          chamber: "AN",
          authorType: "Gouvernement",
          authorName: "Gouvernement",
        },
        {
          externalId: GOV1_D2,
          number: "1",
          dossierId,
          status: "ADOPTE",
          legislature: 17,
          chamber: "AN",
          authorType: "Gouvernement",
          authorName: "Gouvernement",
        },
        // number 2 in D1 and D2, both by Mme Perrine Goulet (mirror V8428's target)
        {
          externalId: GOULET2_D1,
          number: "2",
          dossierId,
          status: "ADOPTE",
          legislature: 17,
          chamber: "AN",
          authorType: "Individuel",
          authorName: "Mme Perrine Goulet",
        },
        {
          externalId: GOULET2_D2,
          number: "2",
          dossierId,
          status: "ADOPTE",
          legislature: 17,
          chamber: "AN",
          authorType: "Individuel",
          authorName: "Mme Perrine Goulet",
        },
        // number 8 only in D1 (twice) — a seconde-délib vote for it must refuse
        {
          externalId: N8A_D1,
          number: "8",
          dossierId,
          status: "DEPOSE",
          legislature: 17,
          chamber: "AN",
          authorType: "Individuel",
          authorName: "M. A",
        },
        {
          externalId: N8B_D1,
          number: "8",
          dossierId,
          status: "DEPOSE",
          legislature: 17,
          chamber: "AN",
          authorType: "Individuel",
          authorName: "M. B",
        },
        // number 9 twice in D2 — still ambiguous after délibération filter
        {
          externalId: N9A_D2,
          number: "9",
          dossierId,
          status: "DEPOSE",
          legislature: 17,
          chamber: "AN",
          authorType: "Individuel",
          authorName: "M. C",
        },
        {
          externalId: N9B_D2,
          number: "9",
          dossierId,
          status: "DEPOSE",
          legislature: 17,
          chamber: "AN",
          authorType: "Individuel",
          authorName: "M. D",
        },
      ],
    });

    const rows = await db.amendment.findMany({
      where: { externalId: { startsWith: AMEND_PFX } },
      select: { id: true, externalId: true },
    });
    idByExt = new Map(rows.map((r) => [r.externalId, r.id]));
  });

  afterAll(async () => {
    await db.scrutinAmendment.deleteMany({
      where: { scrutin: { externalId: { startsWith: SCRUTIN_PFX } } },
    });
    await db.scrutin.deleteMany({ where: { externalId: { startsWith: SCRUTIN_PFX } } });
    await db.amendment.deleteMany({ where: { externalId: { startsWith: AMEND_PFX } } });
    await db.legislativeDossier.deleteMany({ where: { externalId: DLR_EXT } });
  });

  it("POSITIVE: a seconde-délibération Government principal resolves to the D2 amendment (V8429 shape)", async () => {
    const title =
      "l'amendement n° 1 du Gouvernement de rétablissement de l'article 11 (supprimé) (seconde délibération)";
    const scrutin = await makeScrutin("gov", title);
    const res = await resolveLinks(scrutin, parseScrutinTitle(title));

    expect(res.scope).toBe("dossier");
    const principal = res.links.filter((l) => l.role === "PRINCIPAL");
    expect(principal).toHaveLength(1);
    expect(principal[0]!.amendmentId).toBe(idByExt.get(GOV1_D2));
    expect(principal[0]!.parserWarnings.some((w) => w.code === "DELIBERATION_DISAMBIGUATED")).toBe(
      true
    );
    expect(res.warnings.some((w) => w.code === "AMBIGUOUS_CANDIDATES")).toBe(false);
  });

  it("POSITIVE: a seconde-délibération sous-amendement resolves sub + Government parent to their D2 amendments (V8428 shape)", async () => {
    const title =
      "le sous-amendement n° 2 de Mme Perrine Goulet à l'amendement n° 1 du Gouvernement de rétablissement de l'article 11 (supprimé) (seconde délibération)";
    const scrutin = await makeScrutin("sub", title);
    const res = await resolveLinks(scrutin, parseScrutinTitle(title));

    expect(res.scope).toBe("dossier");
    const sub = res.links.find((l) => l.role === "SUB_AMENDMENT");
    const parent = res.links.find((l) => l.role === "PARENT_AMENDMENT");
    expect(sub?.amendmentId).toBe(idByExt.get(GOULET2_D2));
    expect(parent?.amendmentId).toBe(idByExt.get(GOV1_D2));
    expect(res.warnings.some((w) => w.code === "AMBIGUOUS_CANDIDATES")).toBe(false);
  });

  it("NEGATIVE (a): ambiguous same-number candidates with NO délibération in the title still refuse", async () => {
    const title = "l'amendement n° 1 du Gouvernement de rétablissement de l'article 11 (supprimé)";
    const scrutin = await makeScrutin("nodelib", title);
    const parsed = parseScrutinTitle(title);
    expect(parsed.deliberation).toBeNull();

    const res = await resolveLinks(scrutin, parsed);
    expect(res.warnings.some((w) => w.code === "AMBIGUOUS_CANDIDATES")).toBe(true);
    expect(res.links.filter((l) => l.role === "PRINCIPAL")).toHaveLength(0);
  });

  it("NEGATIVE (b): a seconde-délibération vote whose D2 candidate is absent refuses (no D1 fallback)", async () => {
    const title = "l'amendement n° 8 (seconde délibération)";
    const scrutin = await makeScrutin("d2absent", title);
    const res = await resolveLinks(scrutin, parseScrutinTitle(title));

    expect(res.warnings.some((w) => w.code === "AMBIGUOUS_CANDIDATES")).toBe(true);
    expect(res.links.filter((l) => l.role === "PRINCIPAL")).toHaveLength(0);
  });

  it("NEGATIVE (c): two D2 candidates sharing the number stay ambiguous and refuse", async () => {
    const title = "l'amendement n° 9 (seconde délibération)";
    const scrutin = await makeScrutin("twoD2", title);
    const res = await resolveLinks(scrutin, parseScrutinTitle(title));

    expect(res.warnings.some((w) => w.code === "AMBIGUOUS_CANDIDATES")).toBe(true);
    expect(res.links.filter((l) => l.role === "PRINCIPAL")).toHaveLength(0);
  });
});

describeIfDb("amendmentDeliberation (pure)", () => {
  it("reads D1 / D2 from the uid marker and null when absent", async () => {
    const { amendmentDeliberation } =
      await import("@/services/sync/link-scrutins-to-amendments/resolve");
    expect(amendmentDeliberation("AMANR5L17PO838901B3018P0D2N000002")).toBe(2);
    expect(amendmentDeliberation("AMANR5L17PO838901B3018P0D1N000001")).toBe(1);
    expect(amendmentDeliberation("AMANR5L17PO838901B3018N000001")).toBeNull();
  });
});
