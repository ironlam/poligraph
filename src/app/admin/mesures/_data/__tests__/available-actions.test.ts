import { describe, expect, it } from "vitest";
import type { ModerationState } from "@/lib/measures/moderation-state";
import { availableActions, hasAmbiguousPointers } from "../available-actions";

function state(over: Partial<ModerationState> = {}): ModerationState {
  return {
    publication: "DRAFT",
    declaredStatus: "DRAFT",
    publiclyVisible: false,
    visibilityBlockers: ["status_not_published"],
    withdrawal: null,
    depublication: null,
    activeDraft: null,
    draftIsCorrection: false,
    anomalies: [],
    ...over,
  };
}

const PUBLISHED = {
  publication: "PUBLISHED",
  declaredStatus: "PUBLISHED",
  publiclyVisible: true,
  visibilityBlockers: [],
} satisfies Partial<ModerationState>;

function kinds(input: Parameters<typeof availableActions>[0]): string[] {
  return availableActions(input).map((action) => action.kind);
}

describe("availableActions : une ligne par état", () => {
  it("brouillon actif non relu : relire, abandonner", () => {
    const actions = availableActions({
      state: state({ activeDraft: { id: "rev-1", reviewed: false } }),
      publishedRevisionId: null,
    });

    expect(actions).toEqual([
      { kind: "review", revisionId: "rev-1" },
      { kind: "discard", revisionId: "rev-1" },
    ]);
  });

  it("brouillon relu : publier, abandonner", () => {
    const actions = availableActions({
      state: state({ publication: "REVIEWED", activeDraft: { id: "rev-1", reviewed: true } }),
      publishedRevisionId: null,
    });

    expect(actions).toEqual([
      { kind: "publish", revisionId: "rev-1", isFirstPublication: true },
      { kind: "discard", revisionId: "rev-1" },
    ]);
  });

  it("mesure publiée sans correction : nouvelle révision, dépublier, retirer", () => {
    expect(kinds({ state: state(PUBLISHED), publishedRevisionId: "rev-pub" })).toEqual([
      "draft",
      "depublish",
      "withdraw",
    ]);
  });

  it("mesure publiée avec correction non relue : relire ou abandonner la correction, dépublier", () => {
    const actions = availableActions({
      state: state({
        ...PUBLISHED,
        activeDraft: { id: "rev-2", reviewed: false },
        draftIsCorrection: true,
      }),
      publishedRevisionId: "rev-pub",
    });

    expect(actions).toContainEqual({ kind: "review", revisionId: "rev-2" });
    expect(actions).toContainEqual({ kind: "discard", revisionId: "rev-2" });
    expect(actions).toContainEqual({ kind: "depublish" });
    // Pas de « nouvelle révision » : elle abandonnerait la correction en cours en silence.
    expect(
      kinds({
        state: state({
          ...PUBLISHED,
          activeDraft: { id: "rev-2", reviewed: false },
          draftIsCorrection: true,
        }),
        publishedRevisionId: "rev-pub",
      })
    ).not.toContain("draft");
  });

  it("mesure publiée avec correction relue : publier ou abandonner la correction, dépublier", () => {
    const actions = availableActions({
      state: state({
        ...PUBLISHED,
        activeDraft: { id: "rev-2", reviewed: true },
        draftIsCorrection: true,
      }),
      publishedRevisionId: "rev-pub",
    });

    expect(actions).toContainEqual({
      kind: "publish",
      revisionId: "rev-2",
      // Publier une correction n'est pas une première publication, et l'interface doit le dire.
      isFirstPublication: false,
    });
    expect(actions).toContainEqual({ kind: "discard", revisionId: "rev-2" });
    expect(actions).toContainEqual({ kind: "depublish" });
  });

  it("mesure dépubliée : republier la révision précédente ou poursuivre le brouillon", () => {
    const republish = availableActions({
      state: state({ publication: "DEPUBLISHED", declaredStatus: "DRAFT" }),
      publishedRevisionId: "rev-pub",
    });
    expect(republish).toContainEqual({
      kind: "publish",
      revisionId: "rev-pub",
      isFirstPublication: false,
    });

    const withDraft = availableActions({
      state: state({
        publication: "DEPUBLISHED",
        declaredStatus: "DRAFT",
        activeDraft: { id: "rev-2", reviewed: true },
        draftIsCorrection: true,
      }),
      publishedRevisionId: "rev-pub",
    });
    // Les deux actes sont distincts et doivent être proposés tous les deux.
    expect(withDraft).toContainEqual({
      kind: "publish",
      revisionId: "rev-2",
      isFirstPublication: false,
    });
    expect(withDraft).toContainEqual({
      kind: "publish",
      revisionId: "rev-pub",
      isFirstPublication: false,
    });
  });

  it("mesure retirée : les actions éditoriales sont conservées", () => {
    // Publier une correction d'une mesure retirée est autorisé : publication éditoriale n'est pas
    // réactivation politique. Le rappel est à l'écran, pas dans le jeu d'actions.
    const actions = kinds({
      state: state({
        ...PUBLISHED,
        withdrawal: {
          withdrawnAt: new Date("2027-03-01T00:00:00Z"),
          sourceUrl: "https://example.org/retrait",
          sourceLabel: "Conférence de presse",
        },
      }),
      publishedRevisionId: "rev-pub",
    });

    expect(actions).toContain("draft");
    expect(actions).toContain("depublish");
    // Pas de second retrait : les trois champs sont déjà posés.
    expect(actions).not.toContain("withdraw");
  });

  it("garde le retrait disponible pendant qu'une correction est en cours", () => {
    // Un candidat peut abandonner une proposition à tout moment, et le fait n'attend pas notre
    // état de brouillon. Masquer l'action obligerait à abandonner la correction d'un collègue pour
    // enregistrer quelque chose qui a eu lieu.
    const actions = kinds({
      state: state({
        ...PUBLISHED,
        activeDraft: { id: "rev-2", reviewed: false },
        draftIsCorrection: true,
      }),
      publishedRevisionId: "rev-pub",
    });

    expect(actions).toContain("withdraw");
  });

  it("mesure sans révision : proposer une nouvelle révision plutôt qu'une impasse", () => {
    expect(kinds({ state: state({ publication: "EMPTY" }), publishedRevisionId: null })).toEqual([
      "draft",
    ]);
  });
});

describe("availableActions : pointeurs ambigus", () => {
  it.each([
    "published_revision_foreign",
    "latest_revision_foreign",
    "multiple_published_revisions",
  ] as const)("ne propose aucune action quand %s", (code) => {
    // Avec deux révisions publiées ou un pointeur vers une autre mesure, « sur quelle révision
    // cette action agit-elle » n'a pas de réponse sûre. Deviner écrirait sur la mauvaise.
    const broken = state({
      ...PUBLISHED,
      anomalies: [{ code, detail: "rev-x" }],
    });

    expect(hasAmbiguousPointers(broken)).toBe(true);
    expect(availableActions({ state: broken, publishedRevisionId: "rev-pub" })).toEqual([]);
  });

  it("propose les actions malgré une anomalie qui ne rend pas les pointeurs ambigus", () => {
    // Un retrait sans source est un défaut de données, pas une ambiguïté de pointeur : les actions
    // restent sûres, et l'écran affiche l'anomalie à côté.
    const actions = kinds({
      state: state({
        ...PUBLISHED,
        withdrawal: {
          withdrawnAt: new Date("2027-03-01T00:00:00Z"),
          sourceUrl: null,
          sourceLabel: null,
        },
        anomalies: [{ code: "withdrawn_without_source", detail: "m-1" }],
      }),
      publishedRevisionId: "rev-pub",
    });

    expect(actions).toContain("depublish");
  });
});
