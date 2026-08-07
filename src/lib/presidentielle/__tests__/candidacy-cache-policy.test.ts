import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The invalidation policy for `CandidacyPresidential`, guarded at the source level.
 *
 * Why a source guard and not a runtime one: `cacheTag` only does anything inside a Next
 * request/build context, and `revalidateTag` talks to the hosting platform. Neither can be
 * observed from vitest, so the invariant that actually protects us — "a cached read that filters
 * on the extension status carries the tag that a mutation busts" — has to be asserted on the code.
 *
 * The defect this locks down: the four reads carried only `election-measures:<id>` while the
 * mutations called `invalidateEntity("election")` (which purges the `elections` tag). The two sets
 * never intersected, so publishing an extension busted nothing and the surfaces stayed closed for
 * a full ISR period.
 *
 * Comments are stripped before matching, per AGENTS.md: a guard that greps a whole file stays green
 * on a rule that only survives in the surrounding prose.
 */

const ROOT = join(__dirname, "..", "..", "..", "..");

function sourceWithoutComments(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/**
 * Every cached read whose result depends on `CandidacyPresidential.publicationStatus`, directly or
 * through `getPublicPresidentialCandidates`. Adding a fifth one without its tag turns this red.
 */
const CACHED_READS = [
  "src/lib/data/hub.ts",
  "src/lib/data/themes-index.ts",
  "src/lib/data/subject-page.ts",
  "src/lib/data/priorites.ts",
];

const MUTATION_ROUTES = [
  "src/app/api/admin/candidats/route.ts",
  "src/app/api/admin/candidats/[id]/route.ts",
];

describe("politique d'invalidation des extensions présidentielles", () => {
  it.each(CACHED_READS)("%s porte le tag des candidatures à côté de celui des mesures", (path) => {
    const code = sourceWithoutComments(path);

    // Prérequis du test lui-même : si ce fichier cesse d'être une lecture cachée sur les mesures,
    // l'assertion suivante n'a plus de sens et il faut revoir la liste.
    expect(code).toContain("cacheTag(`election-measures:${electionId}`)");
    expect(code).toContain("cacheTag(`election-candidacies:${electionId}`)");
  });

  it.each(MUTATION_ROUTES)("%s invalide le tag des candidatures", (path) => {
    const code = sourceWithoutComments(path);
    expect(code).toContain("invalidatePresidentialCandidacyTags(");
  });

  it("chaque mutation d'extension invalide, pas seulement une sur trois", () => {
    // POST dans le premier fichier, PATCH et DELETE dans le second : trois appels au total.
    const total = MUTATION_ROUTES.map(sourceWithoutComments)
      .join("\n")
      .match(/invalidatePresidentialCandidacyTags\(/g);
    expect(total).toHaveLength(3);
  });

  it("le dépouillement des commentaires ne laisse pas passer une mention en prose", () => {
    // Garde de la garde : sans cette vérification, un commentaire citant le tag suffirait à faire
    // passer les assertions ci-dessus après la suppression de l'appel réel.
    const faux = "/* cacheTag(`election-candidacies:${electionId}`) */\nconst x = 1;\n";
    const nettoye = faux.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
    expect(nettoye).not.toContain("election-candidacies");
  });
});

describe("invalidatePresidentialCandidacyTags", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("purge un seul tag ciblé, jamais le tag global", async () => {
    const revalidateTags = vi.fn();
    vi.doMock("@/lib/cache", () => ({ revalidateTags }));
    const { invalidatePresidentialCandidacyTags } = await import("../candidacy-cache");

    invalidatePresidentialCandidacyTags("elec-1");

    expect(revalidateTags).toHaveBeenCalledExactlyOnceWith(["election-candidacies:elec-1"]);
  });

  it("journalise et n'interrompt pas l'appelant quand la plateforme refuse", async () => {
    // La mutation est déjà validée en base quand on arrive ici : lever ferait croire à un échec.
    const revalidateTags = vi.fn(() => {
      throw new Error("plateforme indisponible");
    });
    vi.doMock("@/lib/cache", () => ({ revalidateTags }));
    const { invalidatePresidentialCandidacyTags } = await import("../candidacy-cache");
    const erreur = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => invalidatePresidentialCandidacyTags("elec-1")).not.toThrow();
    expect(erreur).toHaveBeenCalledOnce();
  });
});
