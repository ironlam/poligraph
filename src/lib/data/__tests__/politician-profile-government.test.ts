import { beforeEach, describe, expect, it, vi } from "vitest";

// The profile document is fingerprinted; a key added to every mandate would change the hash of
// every public profile and invalidate them all at once (spend cap). `governmentData` must only
// appear on a mandate of a PUBLISHED government.

const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { politician: { findUnique } } }));
vi.mock("@/services/voteStats", () => ({
  computePoliticianVotingStats: vi.fn(),
  buildPoliticianParliamentaryCard: vi.fn(),
  getPoliticianDissidence: vi.fn(),
  voteStatsService: {},
}));

import { readPoliticianIdentity } from "../politician-profile-reads";
import {
  hashSerializedDocument,
  serializeProfileDocument,
  type PoliticianProfileDocument,
} from "@/lib/politicians/profile-snapshot/document";

// Fictitious person and mandates.
function mandate(id: string, type: string, governmentData: unknown) {
  return {
    id,
    type,
    startDate: new Date("2024-07-08T00:00:00.000Z"),
    endDate: null,
    party: null,
    parliamentaryData: null,
    europeanData: null,
    localData: null,
    governmentData,
  };
}

function row(mandates: ReturnType<typeof mandate>[]) {
  return {
    id: "pol_1",
    slug: "jeanne-exemple",
    fullName: "Jeanne Exemple",
    currentParty: null,
    _count: { affairs: 0, factCheckMentions: 0 },
    mandates,
    declarations: [],
    externalIds: [],
    partyHistory: [],
  };
}

function hashOf(identity: unknown): string {
  return hashSerializedDocument(
    serializeProfileDocument({
      identity,
      dossier: { affairs: [] },
      voteStats: null,
      mandateType: null,
    } as unknown as PoliticianProfileDocument)
  );
}

/** The identity as it was read before `governmentData` existed: no such key on any mandate. */
function preChange(mandates: ReturnType<typeof mandate>[]) {
  return {
    ...row([]),
    mandates: mandates.map(({ governmentData: _omit, ...m }) => m),
  };
}

const government = (publicationStatus: string) => ({
  endKind: null,
  government: {
    slug: "exemple-1",
    name: "Gouvernement Exemple I",
    publicationStatus,
    currentAffairsActId: null,
  },
});

beforeEach(() => vi.clearAllMocks());

describe("readPoliticianIdentity : governmentData et empreinte du document", () => {
  it("laisse inchangée l'empreinte d'une fiche sans fonction ministérielle", async () => {
    const mandates = [mandate("m1", "DEPUTE", null), mandate("m2", "MAIRE", null)];
    findUnique.mockResolvedValue(row(mandates));
    const identity = await readPoliticianIdentity({ slug: "jeanne-exemple" });
    for (const m of identity!.mandates) expect("governmentData" in m).toBe(false);
    expect(hashOf(identity)).toBe(hashOf(preChange(mandates)));
  });

  it("omet la clé pour un gouvernement en brouillon", async () => {
    const mandates = [mandate("m1", "MINISTRE", government("DRAFT"))];
    findUnique.mockResolvedValue(row(mandates));
    const identity = await readPoliticianIdentity({ slug: "jeanne-exemple" });
    expect("governmentData" in identity!.mandates[0]!).toBe(false);
    expect(hashOf(identity)).toBe(hashOf(preChange(mandates)));
  });

  it("garde la clé pour un gouvernement publié", async () => {
    findUnique.mockResolvedValue(row([mandate("m1", "MINISTRE", government("PUBLISHED"))]));
    const identity = await readPoliticianIdentity({ slug: "jeanne-exemple" });
    expect(identity!.mandates[0]!.governmentData?.government?.slug).toBe("exemple-1");
  });
});
