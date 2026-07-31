import { describe, it, expect } from "vitest";
import {
  buildUserMessage,
  type DescriptionEnrichmentInput,
} from "@/services/affair-description-enrichment";

/**
 * Issue #576 — this builds the PROMPT, not the published description, and that is exactly
 * why it mattered.
 *
 * The old line read `input.prisonSuspended ? " avec sursis" : " ferme"`, so an
 * unestablished split told the model « 48 mois de prison ferme ». The model then copied
 * that qualifier into the prose it wrote, and the false claim reached the page through the
 * context rather than through a concatenation.
 *
 * Exported for this test rather than mocking `callAnthropic`: it is a pure string builder,
 * so asserting on its output is simpler than intercepting a network call to inspect an
 * argument.
 */
const BASE = {
  title: "Affaire de test",
  description: "Description actuelle",
  status: "CONDAMNATION_DEFINITIVE",
  category: "PROBITE",
  involvement: "DIRECT",
  factsDate: null,
  verdictDate: null,
  court: null,
  prisonMonths: null,
  prisonFirmMonths: null,
  fineAmount: null,
  ineligibilityMonths: null,
  ineligibilityFirmMonths: null,
  communityService: null,
  otherSentence: null,
  sentence: null,
  politicianFullName: "Jean Testeur",
  politicianSlug: "jean-testeur",
  politicianCivility: null,
  currentMandates: [],
  partyAtTimeName: null,
  partyAtTimeSlug: null,
  currentPartyName: null,
  currentPartySlug: null,
  otherAffairs: [],
} satisfies DescriptionEnrichmentInput;

describe("buildUserMessage — répartition de la peine (#576)", () => {
  it("n'affirme aucune répartition quand elle n'est pas établie", () => {
    const message = buildUserMessage({ ...BASE, prisonMonths: 48, prisonFirmMonths: null });

    expect(message).toContain("48 mois de prison");
    expect(message).not.toMatch(/ferme|sursis/);
  });

  it("dit « avec sursis » quand la part ferme est nulle", () => {
    const message = buildUserMessage({ ...BASE, prisonMonths: 48, prisonFirmMonths: 0 });

    expect(message).toContain("48 mois de prison avec sursis");
    expect(message).not.toMatch(/\bferme\b/);
  });

  it("dit « ferme » seulement quand la part ferme égale le total", () => {
    const message = buildUserMessage({ ...BASE, prisonMonths: 48, prisonFirmMonths: 48 });

    expect(message).toContain("48 mois de prison ferme");
  });

  it("énonce la répartition d'une peine mixte", () => {
    const message = buildUserMessage({ ...BASE, prisonMonths: 48, prisonFirmMonths: 24 });

    expect(message).toContain("48 mois de prison dont 24 mois avec sursis");
  });

  it("n'affirme rien sur une répartition incohérente", () => {
    const message = buildUserMessage({ ...BASE, prisonMonths: 48, prisonFirmMonths: 60 });

    expect(message).toContain("48 mois de prison");
    expect(message).not.toMatch(/ferme|sursis/);
  });

  it("énonce la répartition de l'inéligibilité quand elle est établie", () => {
    const message = buildUserMessage({
      ...BASE,
      ineligibilityMonths: 45,
      ineligibilityFirmMonths: 15,
    });

    expect(message).toContain("45 mois d'inéligibilité dont 30 mois avec sursis");
  });

  it("laisse l'inéligibilité nue quand la répartition n'est pas établie", () => {
    const message = buildUserMessage({
      ...BASE,
      ineligibilityMonths: 45,
      ineligibilityFirmMonths: null,
    });

    expect(message).toContain("45 mois d'inéligibilité");
    expect(message).not.toMatch(/ferme|sursis/);
  });
});
