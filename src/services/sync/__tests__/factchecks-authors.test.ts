import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ classify: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/services/classify-theme", () => ({ classifyFactCheckTheme: mocks.classify }));

import { classifyNewFactCheck, keepOneHomonym, planForcedMentions } from "../factchecks";

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

describe("classifyNewFactCheck", () => {
  const input = { title: "Titre", claimText: "Déclaration" };
  const freshStats = () => ({ themesClassified: 0, themeErrors: 0 });

  it("enregistre un thème avec sa date de classement", async () => {
    mocks.classify.mockResolvedValue({ status: "theme", theme: "SANTE" });
    const stats = freshStats();
    const fields = await classifyNewFactCheck(input, stats);
    expect(fields.theme).toBe("SANTE");
    expect(fields.themeClassifiedAt).toBeInstanceOf(Date);
    expect(stats).toEqual({ themesClassified: 1, themeErrors: 0 });
  });

  it("enregistre l'absence de thème comme un classement fait", async () => {
    mocks.classify.mockResolvedValue({ status: "none" });
    const fields = await classifyNewFactCheck(input, freshStats());
    expect(fields.theme).toBeNull();
    expect(fields.themeClassifiedAt).toBeInstanceOf(Date);
  });

  it("laisse le fact-check non classé sur une réponse hors liste ou une panne, sans arrêter le sync", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const stats = freshStats();
    mocks.classify.mockResolvedValue({ status: "invalid" });
    expect(await classifyNewFactCheck(input, stats)).toEqual({});
    mocks.classify.mockRejectedValue(new Error("les deux fournisseurs ont échoué"));
    expect(await classifyNewFactCheck(input, stats)).toEqual({});
    expect(stats).toEqual({ themesClassified: 0, themeErrors: 2 });
  });
});
