import { afterAll, beforeAll, expect, it } from "vitest";
import { assertDisposableTestDb, describeIfDisposableDb } from "@/test/db-guard";
import { seedPolitician, uniqueSlug } from "@/lib/measures/__tests__/helpers";

// Deferred: these modules import @/lib/db as a value.
let db: typeof import("@/lib/db").db;
let listPresidentialCandidacies: typeof import("../candidacies-query").listPresidentialCandidacies;
let assertHubMeasureCandidacy: typeof import("../candidacy-eligibility").assertHubMeasureCandidacy;

const HUB_SLUG = "presidentielle-2027";

/**
 * The 2027-hub candidacy scope (#660), proven on both sides: the selector and the server gate. Both
 * must accept only a 2027 + DECLARE + sourced candidacy. The other three candidacies are the violations
 * built first: unsourced DECLARE, sourced PRESSENTI, and a DECLARE on another presidential election.
 */
describeIfDisposableDb("périmètre des candidatures du hub 2027", () => {
  let hubElectionId: string;
  let otherElectionId: string;
  const politicianIds: string[] = [];
  const ids: Record<"declSourced" | "declUnsourced" | "pressenti" | "otherElection", string> = {
    declSourced: "",
    declUnsourced: "",
    pressenti: "",
    otherElection: "",
  };

  beforeAll(async () => {
    assertDisposableTestDb();
    ({ db } = await import("@/lib/db"));
    ({ listPresidentialCandidacies } = await import("../candidacies-query"));
    ({ assertHubMeasureCandidacy } = await import("../candidacy-eligibility"));

    const hub = await db.election.create({
      data: {
        slug: HUB_SLUG,
        type: "PRESIDENTIELLE",
        scope: "NATIONAL",
        title: "Présidentielle 2027",
      },
    });
    hubElectionId = hub.id;
    const other = await db.election.create({
      data: {
        slug: uniqueSlug("presidentielle-autre"),
        type: "PRESIDENTIELLE",
        scope: "NATIONAL",
        title: "Présidentielle antérieure",
      },
    });
    otherElectionId = other.id;

    async function candidacy(
      key: keyof typeof ids,
      electionId: string,
      status: "DECLARE" | "PRESSENTI",
      sourced: boolean
    ): Promise<void> {
      const politicianId = await seedPolitician();
      politicianIds.push(politicianId);
      const row = await db.candidacy.create({
        data: {
          electionId,
          politicianId,
          candidateName: `Candidat ${key}`,
          status,
          sourceUrl: sourced ? "https://example.org/source" : null,
          sourceLabel: sourced ? "Source" : null,
        },
      });
      ids[key] = row.id;
    }

    await candidacy("declSourced", hubElectionId, "DECLARE", true);
    await candidacy("declUnsourced", hubElectionId, "DECLARE", false);
    await candidacy("pressenti", hubElectionId, "PRESSENTI", true);
    await candidacy("otherElection", otherElectionId, "DECLARE", true);
  });

  afterAll(async () => {
    await db.candidacy.deleteMany({
      where: { electionId: { in: [hubElectionId, otherElectionId] } },
    });
    await db.politician.deleteMany({ where: { id: { in: politicianIds } } });
    await db.election.deleteMany({ where: { id: { in: [hubElectionId, otherElectionId] } } });
    await db.$disconnect();
  });

  it("le sélecteur ne propose que la candidature 2027 DECLARE et sourcée", async () => {
    const offered = new Set((await listPresidentialCandidacies()).map((c) => c.id));
    expect(offered.has(ids.declSourced)).toBe(true);
    expect(offered.has(ids.declUnsourced)).toBe(false);
    expect(offered.has(ids.pressenti)).toBe(false);
    expect(offered.has(ids.otherElection)).toBe(false);
  });

  it("la garde accepte la candidature éligible et rend son élection et son politicien", async () => {
    const result = await assertHubMeasureCandidacy(ids.declSourced);
    expect(result.electionId).toBe(hubElectionId);
    expect(politicianIds).toContain(result.politicianId);
  });

  it("la garde refuse une candidature DECLARE non sourcée", async () => {
    await expect(assertHubMeasureCandidacy(ids.declUnsourced)).rejects.toThrow(/sourcée/);
  });

  it("la garde refuse une candidature seulement pressentie", async () => {
    await expect(assertHubMeasureCandidacy(ids.pressenti)).rejects.toThrow(/déclarée/);
  });

  it("la garde refuse une candidature d'une autre élection présidentielle", async () => {
    await expect(assertHubMeasureCandidacy(ids.otherElection)).rejects.toThrow(
      /présidentielle 2027/
    );
  });

  it("la garde refuse un identifiant inconnu", async () => {
    await expect(assertHubMeasureCandidacy("inexistant")).rejects.toThrow(/introuvable/);
  });
});
