import { afterAll, beforeAll, expect, it } from "vitest";
import { assertDisposableTestDb, describeIfDisposableDb } from "@/test/db-guard";

let db: typeof import("@/lib/db").db;
let loadPoliticianPresidentialCandidacy: typeof import("../politician-candidacy").loadPoliticianPresidentialCandidacy;

const SLUG = "politician-candidacy";

/**
 * The reverse read of `getHubCandidacyField`. Its whole point is a split between two populations:
 * identity and status are read WITHOUT the PUBLISHED-extension filter (otherwise the notice
 * disappears from every fiche a candidacy exists for), measure counters are read WITH it (otherwise
 * the notice announces measures no page renders).
 *
 * Exercises the plain loader, not the cached wrapper: a `"use cache"` boundary throws outside a Next
 * request context, which is why the module is split this way.
 */
describeIfDisposableDb("loadPoliticianPresidentialCandidacy", () => {
  const ids: Record<string, string> = {};
  let electionId: string;

  beforeAll(async () => {
    assertDisposableTestDb();
    ({ db } = await import("@/lib/db"));
    ({ loadPoliticianPresidentialCandidacy } = await import("../politician-candidacy"));
    const { PRESIDENTIELLE_2027_SLUG } = await import("@/lib/presidentielle/themes");

    // The read under test hardcodes this slug, so the fixture cannot namespace it. The disposable DB
    // is shared across test files, so a leftover row would break the unique constraint.
    await db.candidacy.deleteMany({ where: { election: { slug: PRESIDENTIELLE_2027_SLUG } } });
    await db.election.deleteMany({ where: { slug: PRESIDENTIELLE_2027_SLUG } });

    const election = await db.election.create({
      data: {
        slug: PRESIDENTIELLE_2027_SLUG,
        type: "PRESIDENTIELLE",
        scope: "NATIONAL",
        title: "Élection présidentielle de test",
        shortTitle: "Présidentielle 2027",
        round1Date: new Date("2027-04-11T00:00:00.000Z"),
        round2Date: new Date("2027-04-25T00:00:00.000Z"),
      },
    });
    electionId = election.id;

    async function seed(
      name: string,
      data: {
        status?: "DECLARE" | "PRESSENTI" | "ENVISAGE" | "RETIRE";
        sourceUrl?: string;
        sourceLabel?: string;
      }
    ) {
      const pol = await db.politician.create({
        data: {
          slug: `${SLUG}-${name}`,
          firstName: name,
          lastName: "Fixture",
          fullName: `${name} Fixture`,
        },
      });
      ids[name] = pol.id;
      await db.candidacy.create({
        data: {
          electionId: election.id,
          politicianId: pol.id,
          candidateName: `${name} Fixture`,
          ...data,
        },
      });
    }

    await seed("declared", {
      status: "DECLARE",
      sourceUrl: "https://example.org/declared",
      sourceLabel: "Le Monde, 14 janvier 2026",
    });
    await seed("nostatus", {
      sourceUrl: "https://example.org/nostatus",
      sourceLabel: "Source",
    });
    await seed("nosource", { status: "DECLARE", sourceLabel: "Source sans URL" });
    await seed("withdrawn", {
      status: "RETIRE",
      sourceUrl: "https://example.org/withdrawn",
      sourceLabel: "Communiqué",
    });

    const orphan = await db.politician.create({
      data: {
        slug: `${SLUG}-orphan`,
        firstName: "Orphan",
        lastName: "Fixture",
        fullName: "Orphan Fixture",
      },
    });
    ids.orphan = orphan.id;
  });

  afterAll(async () => {
    await db.candidacy.deleteMany({ where: { electionId } });
    await db.politician.deleteMany({ where: { slug: { startsWith: SLUG } } });
    await db.election.deleteMany({ where: { id: electionId } });
    await db.$disconnect();
  });

  it("retourne la candidature déclarée avec son statut et sa source", async () => {
    const found = await loadPoliticianPresidentialCandidacy(ids.declared!);
    expect(found).not.toBeNull();
    expect(found?.status).toBe("DECLARE");
    expect(found?.sourceLabel).toBe("Le Monde, 14 janvier 2026");
    expect(found?.electionShortTitle).toBe("Présidentielle 2027");
  });

  it("retourne une candidature retirée : l'extension PUBLISHED n'est pas requise", async () => {
    const found = await loadPoliticianPresidentialCandidacy(ids.withdrawn!);
    expect(found?.status).toBe("RETIRE");
  });

  it("retourne null quand la candidature n'a pas de statut", async () => {
    expect(await loadPoliticianPresidentialCandidacy(ids.nostatus!)).toBeNull();
  });

  it("retourne null quand la source est incomplète", async () => {
    expect(await loadPoliticianPresidentialCandidacy(ids.nosource!)).toBeNull();
  });

  it("retourne null pour un politique sans candidature", async () => {
    expect(await loadPoliticianPresidentialCandidacy(ids.orphan!)).toBeNull();
  });

  it("compte zéro mesure publiée tant qu'aucune extension n'est publiée", async () => {
    const found = await loadPoliticianPresidentialCandidacy(ids.declared!);
    expect(found?.publishedMeasureCount).toBe(0);
    expect(found?.primarySourceMeasureCount).toBe(0);
  });
});
