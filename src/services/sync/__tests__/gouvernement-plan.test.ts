import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import type { GouvernementCSV } from "../types";
import {
  planSync,
  recordKey,
  type ExistingFunction,
  type ExistingPolitician,
  type GovernmentCorrections,
  type SyncInput,
} from "../gouvernement";
import { parisMidnight } from "@/lib/governments/dates";

const GOVS = [
  { id: "gov-bayrou", slug: "bayrou", name: "Gouvernement François Bayrou" },
  { id: "gov-l2", slug: "lecornu-2", name: "Gouvernement Sébastien Lecornu II" },
];

function row(over: Partial<GouvernementCSV> = {}): GouvernementCSV {
  return {
    id: "600",
    gouvernement: "François Bayrou",
    code_fonction: "M",
    prenom: "Anne",
    nom: "Test",
    fonction: "Ministre de test",
    date_debut_fonction: "lundi 23 décembre 2024",
    date_fin_fonction: "",
    ...over,
  };
}

function fn(over: Partial<ExistingFunction> = {}): ExistingFunction {
  return {
    id: "m1",
    type: "MINISTRE",
    title: "Ministre de test",
    institution: "Gouvernement François Bayrou",
    startDate: parisMidnight("2024-12-23"),
    endDate: null,
    isCurrent: true,
    source: "GOUVERNEMENT",
    sourceUrl: "https://www.info.gouv.fr/composition-du-gouvernement",
    officialUrl: "https://www.info.gouv.fr/composition-du-gouvernement",
    externalId: "gouv-600-M-2024-12-23",
    governmentData: {
      governmentName: "Gouvernement François Bayrou",
      governmentId: "gov-bayrou",
      startEvidence: "DATASET",
      endEvidence: null,
    },
    ...over,
  };
}

function person(over: Partial<ExistingPolitician> = {}): ExistingPolitician {
  return {
    id: "p1",
    slug: "anne-test",
    fullName: "Anne Test",
    firstName: "Anne",
    lastName: "Test",
    civility: null,
    birthDate: null,
    gouvExternalIds: ["gouv-600-M-2024-12-23"],
    mandates: [fn()],
    ...over,
  };
}

function input(over: Partial<SyncInput> = {}): SyncInput {
  return {
    currentOnly: true,
    records: [],
    sourcePublishedDay: "2025-03-13",
    governments: GOVS,
    inOffice: { slug: "lecornu-2", compositionVerifiedDay: "2025-01-01" },
    politicianByRecord: new Map(),
    currentFunctions: [],
    corrections: null,
    politiciansByFullName: new Map(),
    politicianByNewMemberSlug: new Map(),
    externalIdOwners: new Map(),
    ...over,
  };
}

describe("planSync", () => {
  it("met une fonction en cours absente de la source dans toVerify, sans la clore", () => {
    const r = row();
    const plan = planSync(
      input({
        records: [r],
        politicianByRecord: new Map([[recordKey(r), person()]]),
        currentFunctions: [
          {
            politicianId: "p-absent",
            politicianSlug: "bruno-absent",
            fullName: "Bruno Absent",
            type: "MINISTRE",
            governmentName: "Gouvernement Sébastien Lecornu II",
          },
        ],
      })
    );
    expect(plan.toVerify).toHaveLength(1);
    expect(plan.toVerify[0]).toContain("Bruno Absent");
    expect(plan.updates).toEqual([]);
  });

  it("n'écrit rien sur les fonctions en cours quand le CSV précède la composition vérifiée", () => {
    const r = row({ prenom: "Nouveau", nom: "Ministre" });
    const plan = planSync(
      input({
        records: [r],
        politicianByRecord: new Map([[recordKey(r), null]]),
        inOffice: { slug: "lecornu-2", compositionVerifiedDay: "2026-10-10" },
        currentFunctions: [
          {
            politicianId: "p9",
            politicianSlug: "x",
            fullName: "X",
            type: "MINISTRE",
            governmentName: null,
          },
        ],
      })
    );
    expect(plan.creates).toEqual([]);
    expect(plan.updates).toEqual([]);
    expect(plan.links).toEqual([]);
    expect(plan.toVerify).toEqual([]);
    expect(plan.staleSources).toHaveLength(1);
  });

  it("laisse intacte une fonction prouvée par un acte", () => {
    const r = row({ fonction: "Autre intitulé", date_debut_fonction: "mardi 24 décembre 2024" });
    const act = person({
      mandates: [
        fn({
          title: "Intitulé de l'acte",
          governmentData: {
            governmentName: "Gouvernement François Bayrou",
            governmentId: null,
            startEvidence: "ACT",
            endEvidence: null,
          },
        }),
      ],
    });
    const plan = planSync(
      input({ records: [r], politicianByRecord: new Map([[recordKey(r), act]]) })
    );
    expect(plan.skippedActVerified).toHaveLength(1);
    expect(plan.updates).toEqual([]);
    expect(plan.links).toEqual([]);
    expect(plan.creates).toEqual([]);
  });

  it("ne produit rien quand la base correspond déjà à la source (jour lu à Paris)", () => {
    const r = row();
    const plan = planSync(
      input({ records: [r], politicianByRecord: new Map([[recordKey(r), person()]]) })
    );
    expect(plan.creates).toEqual([]);
    expect(plan.updates).toEqual([]);
    expect(plan.links).toEqual([]);
  });

  it("rattache par libellé legacy ou par nom actuel, et signale un libellé inconnu", () => {
    const legacy = row({ prenom: "A", nom: "Legacy" });
    const current = row({
      prenom: "B",
      nom: "Actuel",
      gouvernement: "Sébastien Lecornu II",
      date_debut_fonction: "dimanche 12 octobre 2025",
    });
    const unknown = row({ prenom: "C", nom: "Inconnu", gouvernement: "Test Inconnu" });
    const plan = planSync(
      input({
        records: [legacy, current, unknown],
        politicianByRecord: new Map([
          [recordKey(legacy), person({ id: "p-legacy", mandates: [], gouvExternalIds: [] })],
          [recordKey(current), person({ id: "p-current", mandates: [], gouvExternalIds: [] })],
          [recordKey(unknown), person({ id: "p-unknown", mandates: [], gouvExternalIds: [] })],
        ]),
      })
    );
    const byId = Object.fromEntries(
      plan.creates.map((c) => [c.politician.kind === "existing" ? c.politician.id : "", c])
    );
    expect(byId["p-legacy"]!.mandate.governmentId).toBe("gov-bayrou");
    expect(byId["p-current"]!.mandate.governmentId).toBe("gov-l2");
    expect(byId["p-unknown"]!.mandate.governmentId).toBeNull();
    expect(plan.unresolvedLabels).toEqual(["Gouvernement Test Inconnu"]);
  });

  it("ne rouvre pas une fonction close que la source dit en cours", () => {
    const r = row();
    const closed = person({
      mandates: [fn({ endDate: parisMidnight("2025-10-12"), isCurrent: false })],
    });
    const plan = planSync(
      input({ records: [r], politicianByRecord: new Map([[recordKey(r), closed]]) })
    );
    expect(plan.updates).toEqual([]);
    expect(plan.toVerify).toHaveLength(1);
  });

  it("ne porte jamais lastConfirmedAt", () => {
    const r = row({ prenom: "Zoé", nom: "Neuve" });
    const plan = planSync(
      input({
        records: [r],
        politicianByRecord: new Map([
          [recordKey(r), person({ mandates: [], gouvExternalIds: [] })],
        ]),
      })
    );
    expect(plan.creates).toHaveLength(1);
    expect(JSON.stringify(plan)).not.toContain("lastConfirmedAt");
  });

  it("traite comme périmée une source sans gouvernement en exercice ou sans composition vérifiée", () => {
    const r = row({ date_debut_fonction: "mardi 24 décembre 2024", fonction: "Autre" });
    for (const inOffice of [null, { slug: "lecornu-2", compositionVerifiedDay: null }]) {
      const plan = planSync(
        input({
          records: [r],
          politicianByRecord: new Map([[recordKey(r), person()]]),
          inOffice,
          corrections: {
            _updated: "2026-10-11",
            updateMembers: [{ politicianName: "Anne Test", updates: { civility: "Mme" } }],
          },
          politiciansByFullName: new Map([["anne test", [person()]]]),
        })
      );
      expect(plan.creates).toEqual([]);
      expect(plan.updates).toEqual([]);
      expect(plan.links).toEqual([]);
      expect(plan.staleSources).toHaveLength(2);
    }
  });

  it("ne crée jamais une personne inconnue depuis le CSV", () => {
    const r = row({ prenom: "Zoé", nom: "Neuve" });
    const plan = planSync(
      input({ records: [r], politicianByRecord: new Map([[recordKey(r), null]]) })
    );
    expect(plan.creates).toEqual([]);
    expect(plan.toVerify).toEqual([expect.stringContaining("Zoé Neuve")]);
    expect(plan.toVerify[0]).toContain("personne inconnue, création manuelle requise");
  });

  it("ne repasse pas en cours une fonction isCurrent=false sans date de fin", () => {
    const r = row();
    const stopped = person({ mandates: [fn({ isCurrent: false, endDate: null })] });
    const plan = planSync(
      input({ records: [r], politicianByRecord: new Map([[recordKey(r), stopped]]) })
    );
    expect(plan.updates).toEqual([]);
    expect(plan.toVerify).toHaveLength(1);
  });

  it("ne réattribue pas un identifiant source détenu par une autre personne", () => {
    const r = row();
    const p = person({ gouvExternalIds: [] });
    const fresh = row({
      prenom: "Anne",
      nom: "Test",
      date_debut_fonction: "jeudi 1 mai 2025",
      id: "601",
    });
    const plan = planSync(
      input({
        records: [r, fresh],
        politicianByRecord: new Map([
          [recordKey(r), p],
          [recordKey(fresh), p],
        ]),
        externalIdOwners: new Map([
          ["gouv-600-M-2024-12-23", "p-autre"],
          ["gouv-601-M-2025-05-01", "p-autre"],
        ]),
      })
    );
    expect(plan.links.filter((l) => l.kind === "externalId")).toEqual([]);
    expect(plan.creates).toHaveLength(1);
    expect(plan.creates[0]!.externalId).toBeNull();
    expect(plan.conflicts).toHaveLength(2);
  });

  describe("corrections locales", () => {
    const base: GovernmentCorrections = { _updated: "2026-10-11" };

    it("ignore un fichier antérieur à la composition vérifiée", () => {
      const plan = planSync(
        input({
          inOffice: { slug: "lecornu-2", compositionVerifiedDay: "2026-10-10" },
          corrections: {
            _updated: "2026-02-27",
            updateMembers: [{ politicianName: "Anne Test", updates: { civility: "Mme" } }],
          },
          politiciansByFullName: new Map([["anne test", [person()]]]),
        })
      );
      expect(plan.updates).toEqual([]);
      expect(plan.staleSources.some((s) => s.startsWith("Corrections locales"))).toBe(true);
    });

    it("ne rouvre pas une fonction close listée dans newMembers", () => {
      const closed = person({
        mandates: [fn({ endDate: parisMidnight("2025-10-12"), isCurrent: false })],
      });
      const plan = planSync(
        input({
          corrections: {
            ...base,
            newMembers: [
              {
                firstName: "Anne",
                lastName: "Test",
                fullName: "Anne Test",
                mandate: {
                  type: "MINISTRE",
                  title: "Ministre de test",
                  startDate: "2024-12-23",
                  government: "François Bayrou",
                },
              },
            ],
          },
          politicianByNewMemberSlug: new Map([["anne-test", closed]]),
        })
      );
      expect(plan.conflicts).toEqual([]);
      expect(plan.updates).toEqual([]);
      expect(plan.creates).toEqual([]);
      expect(plan.toVerify).toHaveLength(1);
    });

    it("ne crée jamais une personne inconnue listée dans newMembers", () => {
      const plan = planSync(
        input({
          corrections: {
            ...base,
            newMembers: [
              {
                firstName: "Yves",
                lastName: "Inconnu",
                fullName: "Yves Inconnu",
                mandate: {
                  type: "MINISTRE",
                  title: "Ministre",
                  startDate: "2025-10-12",
                  government: "Sébastien Lecornu II",
                },
              },
            ],
          },
          politicianByNewMemberSlug: new Map([["yves-inconnu", null]]),
        })
      );
      expect(plan.creates).toEqual([]);
      expect(plan.toVerify).toEqual([
        expect.stringContaining("personne inconnue, création manuelle requise"),
      ]);
      expect(plan.toVerify[0]).toContain("Yves Inconnu");
    });

    it("ne clôt pas une fonction prouvée par un acte", () => {
      const act = person({
        mandates: [
          fn({
            governmentData: {
              governmentName: "Gouvernement François Bayrou",
              governmentId: "gov-bayrou",
              startEvidence: "ACT",
              endEvidence: null,
            },
          }),
        ],
      });
      const plan = planSync(
        input({
          corrections: {
            ...base,
            endMandates: [
              { politicianName: "Anne Test", mandateType: "MINISTRE", endDate: "2025-10-12" },
            ],
          },
          politiciansByFullName: new Map([["anne test", [act]]]),
        })
      );
      expect(plan.updates).toEqual([]);
      expect(plan.skippedActVerified).toHaveLength(1);
    });

    it("limite updateMembers aux champs d'identité", () => {
      const plan = planSync(
        input({
          corrections: {
            ...base,
            updateMembers: [
              { politicianName: "Anne Test", updates: { civility: "Mme" } },
              { politicianName: "Anne Test", updates: { slug: "pirate", civility: "M." } },
            ],
          },
          politiciansByFullName: new Map([["anne test", [person()]]]),
        })
      );
      expect(plan.updates).toEqual([
        { kind: "politician", label: "Anne Test", politicianId: "p1", data: { civility: "Mme" } },
      ]);
      expect(plan.errors).toHaveLength(1);
      expect(plan.errors[0]).toContain("slug");
    });
  });
});
