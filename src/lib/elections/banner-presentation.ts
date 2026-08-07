import type { ElectionType } from "@/generated/prisma";
import type { ElectionBannerState } from "./banner-state";

/**
 * Presentation of the homepage banner, keyed by election TYPE.
 *
 * Separated from `banner-state.ts` on purpose. `Election.featured` is generic and any election can
 * be featured, so a rendering that talks about "the two programmes" or "following the promises"
 * must be selected by type, not baked into the component. Without this split, a municipal election
 * featured in 2032 would inherit presidential calls to action and no test would fail.
 *
 * The registry is a non-partial Record: adding an ElectionType to the Prisma schema breaks the
 * build here rather than silently falling back to the presidential strategy.
 */

export type BannerAction = {
  label: string;
  href: string;
  /** True for a link leaving the site: rendered with target=_blank and rel=noopener noreferrer. */
  external: boolean;
};

export type BannerActionContext = {
  electionSlug: string;
  /** Candidacies with a status AND both source fields. Never the count of published fiches. */
  sourcedCandidacyCount: number;
};

export type BannerPresentation = {
  /** One-line editorial promise, above the dates. Null for elections we make no promise about. */
  promise: string | null;
  showRound1Scores: boolean;
  showWinnerScore: boolean;
  primaryAction(state: ElectionBannerState["kind"], ctx: BannerActionContext): BannerAction;
  secondaryAction(
    state: ElectionBannerState["kind"],
    ctx: BannerActionContext
  ): BannerAction | null;
};

/**
 * Official entry point for checking one's electoral registration, which is what tells a voter
 * where they vote.
 *
 * What was actually checked, on 2026-08-07: this service-public.fr path answers with a redirect
 * (not a 404) to https://situation.elections.interieur.gouv.fr/. That final host refuses
 * non-browser clients with a 403, so its content could NOT be loaded from the build environment.
 * The service-public.fr path is kept rather than the redirect target for two reasons: it is the
 * documented entry point maintained by DILA, and it will follow if the underlying service moves.
 */
const VOTER_SITUATION_LOOKUP_URL =
  "https://www.service-public.fr/particuliers/vosdroits/services-en-ligne-et-formulaires/ISE";

const genericPresentation: BannerPresentation = {
  promise: null,
  showRound1Scores: false,
  showWinnerScore: false,
  primaryAction: (_state, ctx) => ({
    label: "Voir l'élection",
    href: `/elections/${ctx.electionSlug}`,
    external: false,
  }),
  secondaryAction: (state, ctx) =>
    state === "AFTER"
      ? { label: "Résultats détaillés", href: `/elections/${ctx.electionSlug}`, external: false }
      : null,
};

const presidentiellePresentation: BannerPresentation = {
  promise:
    "Ce que chaque candidature propose, ce qu'elle a voté, ce qu'elle a fait quand elle était au pouvoir.",
  showRound1Scores: true,
  showWinnerScore: true,
  primaryAction: (state, ctx) => {
    const hub = `/elections/${ctx.electionSlug}`;
    switch (state) {
      case "VOTING_DAY":
        return {
          label: "Trouver mon bureau de vote",
          href: VOTER_SITUATION_LOOKUP_URL,
          external: true,
        };
      case "BETWEEN_ROUNDS":
        return { label: "Comparer les deux programmes", href: hub, external: false };
      case "AFTER":
        // `/elections/<slug>/suivi` belongs to lot 8 and does not exist. The hub is the honest
        // destination until it does: a dead link would be worse than a less precise one.
        return { label: "Suivre les promesses", href: hub, external: false };
      default:
        return { label: "Ouvrir le dossier", href: hub, external: false };
    }
  },
  secondaryAction: (state, ctx) => {
    if (state === "VOTING_DAY" || state === "BETWEEN_ROUNDS") return null;
    // No "Résultats détaillés" here: the static segment src/app/elections/presidentielle-2027/
    // takes precedence over [slug], so the generic election page and the hub are the same URL and
    // the link would point at the page carrying it.
    if (state === "AFTER") return null;
    const plural = ctx.sourcedCandidacyCount > 1 ? "s" : "";
    return {
      // "recensées" and not "documentées": this counts sourced candidacies, not candidacies whose
      // programme is published. "Documentée" would read as "we have their measures".
      label: `${ctx.sourcedCandidacyCount} candidature${plural} recensée${plural}`,
      href: `/elections/${ctx.electionSlug}#candidatures`,
      external: false,
    };
  },
};

const BANNER_PRESENTATIONS: Record<ElectionType, BannerPresentation> = {
  PRESIDENTIELLE: presidentiellePresentation,
  LEGISLATIVES: genericPresentation,
  SENATORIALES: genericPresentation,
  MUNICIPALES: genericPresentation,
  DEPARTEMENTALES: genericPresentation,
  REGIONALES: genericPresentation,
  EUROPEENNES: genericPresentation,
  REFERENDUM: genericPresentation,
};

export function getBannerPresentation(type: ElectionType): BannerPresentation {
  return BANNER_PRESENTATIONS[type];
}
