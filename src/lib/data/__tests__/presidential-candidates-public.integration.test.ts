import { afterAll, beforeAll, expect, it } from "vitest";
import { assertDisposableTestDb, describeIfDisposableDb } from "@/test/db-guard";

// Deferred so the file skips cleanly without the container: @/lib/db throws at module load when
// DATABASE_URL is unset, and describe.skip does not undo a static import.
let db: typeof import("@/lib/db").db;
let getPublicPresidentialCandidates: typeof import("@/lib/data/presidential-candidates-public").getPublicPresidentialCandidates;

const SLUG = "presidentielle-test-cand-public";

/**
 * The sensitive invariant of this authority: a candidacy whose presidential extension is missing or
 * DRAFT never surfaces publicly. The test builds the violation (a DRAFT candidacy and one with no
 * extension both exist alongside a published one) and asserts only the published one comes back.
 */
describeIfDisposableDb("autorité de lecture publique des candidatures présidentielles", () => {
  let electionId: string;

  beforeAll(async () => {
    assertDisposableTestDb();
    ({ db } = await import("@/lib/db"));
    ({ getPublicPresidentialCandidates } =
      await import("@/lib/data/presidential-candidates-public"));

    const election = await db.election.create({
      data: {
        slug: SLUG,
        type: "PRESIDENTIELLE",
        scope: "NATIONAL",
        title: "Test candidatures publiques",
      },
    });
    electionId = election.id;

    // Deux partis colorés : celui qu'Alix porte réellement, et celui dont Dana est encartée mais
    // sous lequel elle ne se présente pas.
    const partiAlix = await db.party.create({
      data: { name: `${SLUG} Parti A`, shortName: `${SLUG}-PA`, color: "#cc2443" },
    });
    const partiDana = await db.party.create({
      data: { name: `${SLUG} Parti D`, shortName: `${SLUG}-PD`, color: "#0d378a" },
    });

    const polPub = await db.politician.create({
      data: {
        slug: `${SLUG}-a`,
        firstName: "Alix",
        lastName: "Publiee",
        fullName: "Alix Publiee",
        currentPartyId: partiAlix.id,
      },
    });
    const polDraft = await db.politician.create({
      data: { slug: `${SLUG}-b`, firstName: "Bo", lastName: "Brouillon", fullName: "Bo Brouillon" },
    });
    const polNoExt = await db.politician.create({
      data: { slug: `${SLUG}-c`, firstName: "Cam", lastName: "Sansext", fullName: "Cam Sansext" },
    });

    const candPub = await db.candidacy.create({
      data: {
        electionId,
        politicianId: polPub.id,
        candidateName: "Alix Publiee",
        status: "DECLARE",
        sourceUrl: "https://example.org/a",
        sourceLabel: "Source A",
        // Étiquette texte sans `partyId`, l'état réel des candidatures semées : la couleur ne peut
        // venir que du parti actuel de la personne, et seulement parce que l'étiquette le nomme.
        partyLabel: `${SLUG}-PA`,
      },
    });
    await db.candidacyPresidential.create({
      data: { candidacyId: candPub.id, publicationStatus: "PUBLISHED", slogan: "Slogan A" },
    });

    // Dana se présente sous une autre bannière que le parti dont elle est encartée.
    const polDivergente = await db.politician.create({
      data: {
        slug: `${SLUG}-d`,
        firstName: "Dana",
        lastName: "Divergente",
        fullName: "Dana Divergente",
        currentPartyId: partiDana.id,
      },
    });
    const candDivergente = await db.candidacy.create({
      data: {
        electionId,
        politicianId: polDivergente.id,
        candidateName: "Dana Divergente",
        status: "DECLARE",
        partyLabel: "Mouvement local",
      },
    });
    await db.candidacyPresidential.create({
      data: { candidacyId: candDivergente.id, publicationStatus: "PUBLISHED" },
    });

    const candDraft = await db.candidacy.create({
      data: {
        electionId,
        politicianId: polDraft.id,
        candidateName: "Bo Brouillon",
        status: "DECLARE",
      },
    });
    await db.candidacyPresidential.create({
      data: { candidacyId: candDraft.id, publicationStatus: "DRAFT" },
    });

    // Une candidature sans extension éditoriale du tout : elle ne doit jamais sortir non plus.
    await db.candidacy.create({
      data: {
        electionId,
        politicianId: polNoExt.id,
        candidateName: "Cam Sansext",
        status: "DECLARE",
      },
    });
  });

  afterAll(async () => {
    await db.candidacy.deleteMany({ where: { electionId } });
    await db.politician.deleteMany({ where: { slug: { startsWith: SLUG } } });
    await db.election.deleteMany({ where: { slug: SLUG } });
    await db.party.deleteMany({ where: { shortName: { startsWith: SLUG } } });
    await db.$disconnect();
  });

  it("ne renvoie que les candidatures dont l'extension est PUBLISHED", async () => {
    const result = await getPublicPresidentialCandidates(SLUG);
    // Par nom de famille : Divergente avant Publiee.
    expect(result.map((c) => c.candidateName)).toEqual(["Dana Divergente", "Alix Publiee"]);
  });

  it("expose slogan et source, jamais un brouillon ni une candidature sans extension", async () => {
    const result = await getPublicPresidentialCandidates(SLUG);
    const alix = result.find((c) => c.candidateName === "Alix Publiee");
    expect(alix?.slogan).toBe("Slogan A");
    expect(alix?.sourceLabel).toBe("Source A");
    expect(alix?.status).toBe("DECLARE");
  });

  it("résout la couleur de la candidature, sans emprunter celle d'un parti qu'elle ne porte pas", async () => {
    const result = await getPublicPresidentialCandidates(SLUG);

    // Étiquette texte seule : la couleur vient du parti actuel, parce que l'étiquette le nomme.
    expect(result.find((c) => c.candidateName === "Alix Publiee")?.accentColor).toBe("#cc2443");
    // Étiquette divergente : rien plutôt qu'une couleur fausse.
    expect(result.find((c) => c.candidateName === "Dana Divergente")?.accentColor).toBeNull();
  });
});
