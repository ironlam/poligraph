import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import type { Prisma } from "@/generated/prisma";
import { MandateTimeline } from "@/components/politicians/MandateTimeline";
import { mandateGovernmentLink } from "@/components/governments/profile-link";
import {
  deserializeProfileDocument,
  serializeProfileDocument,
  type PoliticianProfileDocument,
} from "@/lib/politicians/profile-snapshot/document";
import type { ProfileMandateGovernment } from "@/lib/data/politician-profile-reads";

// Fictitious minister. Mandate timestamps are stored at Paris midnight (22:00 UTC in summer).
function ministerMandate(governmentData?: ProfileMandateGovernment | null) {
  return {
    id: "m-min",
    type: "MINISTRE" as const,
    isCurrent: false,
    startDate: new Date("2025-09-22T22:00:00Z"),
    endDate: new Date("2025-10-04T22:00:00Z"),
    role: null,
    title: "Ministre de l'Exemple",
    constituency: null,
    institution: null,
    officialUrl: null,
    parliamentaryData: null,
    ...(governmentData === undefined ? {} : { governmentData }),
  };
}

const published: ProfileMandateGovernment = {
  endKind: "COLLECTIVE_RESIGNATION",
  government: {
    slug: "exemple-1",
    name: "Gouvernement Exemple I",
    publicationStatus: "PUBLISHED",
    currentAffairsActId: "act-affaires-courantes",
  },
};

function renderTimeline(mandate: ReturnType<typeof ministerMandate>, enabled: boolean) {
  return render(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <MandateTimeline mandates={[mandate] as any} governmentsEnabled={enabled} />
  ).container;
}

describe("profil : lien vers le gouvernement d'une fonction ministérielle", () => {
  it("lie un gouvernement publié quand le flag est actif", () => {
    const c = renderTimeline(ministerMandate(published), true);
    const hrefs = [...c.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/politiques/gouvernements/exemple-1");
    // Collective resignation: the end day, read in Paris time (2025-10-04T22:00Z is 5 October).
    expect(hrefs).toContain("/politiques/gouvernements/exemple-1?date=2025-10-05");
    expect(c.textContent).toContain("Gouvernement Exemple I");
    expect(c.textContent).toContain("Voir la composition au 5 octobre 2025");
    expect(c.textContent).toContain("puis affaires courantes");
  });

  it("ne lie rien sans le flag", () => {
    const c = renderTimeline(ministerMandate(published), false);
    expect(c.querySelector('a[href^="/politiques/gouvernements"]')).toBeNull();
  });

  it("ne lie pas un gouvernement en brouillon", () => {
    const draft = {
      ...published,
      government: { ...published.government!, publicationStatus: "DRAFT" as const },
    };
    const c = renderTimeline(ministerMandate(draft), true);
    expect(c.querySelector('a[href^="/politiques/gouvernements"]')).toBeNull();
    // The mandate itself is still listed.
    expect(c.textContent).toContain("Ministre de l'Exemple");
  });

  it("ne dit pas « affaires courantes » si le régime n'est pas attesté par un acte", () => {
    const unattested = {
      ...published,
      government: { ...published.government!, currentAffairsActId: null },
    };
    const link = mandateGovernmentLink(ministerMandate(unattested), true);
    expect(link?.currentAffairs).toBe(false);
    expect(renderTimeline(ministerMandate(unattested), true).textContent).not.toContain(
      "affaires courantes"
    );
  });

  it("remplacement individuel : composition la veille de la fin, où la personne figure encore", () => {
    // Replaced on 5 October (Paris): on that day the successor is listed, so link the 4th.
    const link = mandateGovernmentLink(
      ministerMandate({ ...published, endKind: "INDIVIDUAL" }),
      true
    );
    expect(link?.compositionHref).toBe("/politiques/gouvernements/exemple-1?date=2025-10-04");
    expect(link?.currentAffairs).toBe(false);
  });

  it("fin individuelle le jour même du début : jamais avant le début", () => {
    const link = mandateGovernmentLink(
      {
        startDate: new Date("2025-09-22T22:00:00Z"),
        endDate: new Date("2025-09-22T22:00:00Z"),
        governmentData: { ...published, endKind: "INDIVIDUAL" },
      },
      true
    );
    expect(link?.compositionDay).toBe("2025-09-23");
  });

  it("prend le jour de début quand la fin est inconnue, sans mention d'affaires courantes", () => {
    const link = mandateGovernmentLink(
      {
        startDate: new Date("2025-09-22T22:00:00Z"),
        endDate: null,
        governmentData: { ...published, endKind: null },
      },
      true
    );
    expect(link?.compositionHref).toBe("/politiques/gouvernements/exemple-1?date=2025-09-23");
    expect(link?.currentAffairs).toBe(false);
  });

  it("tolère un document de profil stocké avant governmentData", () => {
    const stored = serializeProfileDocument({
      identity: { id: "p1", mandates: [ministerMandate()] },
      dossier: { affairs: [] },
      voteStats: null,
      mandateType: null,
    } as unknown as PoliticianProfileDocument);
    const mandate = deserializeProfileDocument(stored as Prisma.JsonValue).identity.mandates[0]!;
    expect("governmentData" in mandate).toBe(false);
    expect(mandateGovernmentLink(mandate, true)).toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = renderTimeline(mandate as any, true);
    expect(c.textContent).toContain("Ministre de l'Exemple");
    expect(c.querySelector('a[href^="/politiques/gouvernements"]')).toBeNull();
  });
});
