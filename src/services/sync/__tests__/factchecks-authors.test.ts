import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

import { keepOneHomonym, planForcedMentions } from "../factchecks";

const POLITICIANS = [
  { id: "ministre", normalizedFullName: "philippe baptiste" },
  { id: "maire", normalizedFullName: "philippe baptiste" },
  { id: "deputee", normalizedFullName: "mathilde panot" },
];

const match = (politicianId: string) => ({ politicianId, matchedName: "Nom" });

describe("keepOneHomonym", () => {
  it("garde la personne recherchée parmi ses homonymes", () => {
    const { kept, skipped } = keepOneHomonym(
      [match("ministre"), match("maire")],
      POLITICIANS,
      "ministre"
    );
    expect(kept.map((m) => m.politicianId)).toEqual(["ministre"]);
    expect(skipped).toBe(1);
  });

  it("n'en garde aucun quand la personne recherchée n'est pas parmi eux", () => {
    const { kept, skipped } = keepOneHomonym(
      [match("ministre"), match("maire"), match("deputee")],
      POLITICIANS,
      "deputee"
    );
    expect(kept.map((m) => m.politicianId)).toEqual(["deputee"]);
    expect(skipped).toBe(2);
  });

  it("laisse intacts des noms différents", () => {
    const { kept, skipped } = keepOneHomonym(
      [match("ministre"), match("deputee")],
      POLITICIANS,
      "autre"
    );
    expect(kept.map((m) => m.politicianId)).toEqual(["ministre", "deputee"]);
    expect(skipped).toBe(0);
  });
});

describe("planForcedMentions", () => {
  const stored = [
    { id: "m-corrigee", politicianId: "attal", isClaimant: false },
    { id: "m-retrouvee", politicianId: "panot", isClaimant: false },
    { id: "m-perdue", politicianId: "maire", isClaimant: true },
    { id: "m-ajoutee-admin", politicianId: "faure", isClaimant: true },
  ];

  it("ne touche à aucune mention corrigée ou ajoutée dans l'admin", () => {
    const plan = planForcedMentions(
      stored,
      [
        // The run would mark Attal as author again: the admin correction must win.
        { politicianId: "attal", matchedName: "Gabriel Attal", isClaimant: true },
        { politicianId: "panot", matchedName: "Mathilde Panot", isClaimant: true },
        { politicianId: "nouveau", matchedName: "Nouveau Nom", isClaimant: false },
      ],
      new Set(["m-corrigee", "m-ajoutee-admin"])
    );
    expect(plan.updates).toEqual([{ id: "m-retrouvee", isClaimant: true }]);
    expect(plan.deleteIds).toEqual(["m-perdue"]);
    expect(plan.creates.map((c) => c.politicianId)).toEqual(["nouveau"]);
  });

  it("recalcule et supprime normalement sans correction manuelle", () => {
    const plan = planForcedMentions(
      stored,
      [{ politicianId: "attal", matchedName: "Gabriel Attal", isClaimant: true }],
      new Set()
    );
    expect(plan.updates).toEqual([{ id: "m-corrigee", isClaimant: true }]);
    expect(plan.deleteIds).toEqual(["m-retrouvee", "m-perdue", "m-ajoutee-admin"]);
    expect(plan.creates).toEqual([]);
  });

  it("crée toutes les mentions d'un fact-check nouveau", () => {
    const wanted = [{ politicianId: "panot", matchedName: "Mathilde Panot", isClaimant: true }];
    expect(planForcedMentions([], wanted, new Set())).toEqual({
      deleteIds: [],
      updates: [],
      creates: wanted,
    });
  });
});
