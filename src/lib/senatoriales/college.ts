/**
 * How many senatorial delegates a commune sends, from the code électoral.
 *
 * The point of showing this calculation rather than summarising it is that the
 * number is not negotiated: it falls out of two articles applied to a population
 * and a council size. Both inputs come from the database, so the arithmetic must be
 * reproducible from what the page displays.
 *
 * Returns null whenever an input is missing or off-scale. An absent delegate count
 * is said, never guessed: see docs/design/patterns/MissingData.md.
 */

import {
  DELEGATES_BY_RIGHT_THRESHOLD,
  SENATE_DELEGATE_SCALE,
  SUPPLEMENTARY_DELEGATE_FLOOR,
  SUPPLEMENTARY_DELEGATE_STEP,
  getCouncilSeats,
} from "@/config/senatoriales";

export interface CommuneCollegeInput {
  communeId: string;
  population: number | null;
  totalSeats: number | null;
}

export type CollegeRegime = "scale" | "by-right";

export interface CommuneCollege {
  /** Council size actually used, PLM derogation applied. */
  councilSeats: number;
  population: number;
  regime: CollegeRegime;
  /** Delegates elected on the L. 284 scale. Null under the L. 285 regime. */
  scaleDelegates: number | null;
  /** Councillors who are delegates by right (L. 285). Null under the L. 284 regime. */
  delegatesByRight: number | null;
  /** Extra delegates for the population above 30,000 (L. 285). Zero below it. */
  supplementaryDelegates: number;
  /** Complete 800-inhabitant brackets above 30,000, kept so the page can show the division. */
  supplementaryBrackets: number;
  total: number;
}

/**
 * Delegates for one commune, or null when we cannot say.
 *
 * Null happens on a missing population, a missing council size, or a council size
 * that is not on the L. 284 scale. That last case is a data defect rather than a
 * legal edge case, and it must surface as an absence instead of a plausible number.
 */
export function computeCommuneCollege(input: CommuneCollegeInput): CommuneCollege | null {
  const councilSeats = getCouncilSeats(input.communeId, input.totalSeats);
  const { population } = input;

  if (population == null || population < 0) return null;
  if (councilSeats == null || councilSeats <= 0) return null;

  if (population >= DELEGATES_BY_RIGHT_THRESHOLD) {
    const supplementaryBrackets =
      population > SUPPLEMENTARY_DELEGATE_FLOOR
        ? Math.floor((population - SUPPLEMENTARY_DELEGATE_FLOOR) / SUPPLEMENTARY_DELEGATE_STEP)
        : 0;

    return {
      councilSeats,
      population,
      regime: "by-right",
      scaleDelegates: null,
      delegatesByRight: councilSeats,
      supplementaryDelegates: supplementaryBrackets,
      supplementaryBrackets,
      total: councilSeats + supplementaryBrackets,
    };
  }

  const scaleDelegates = SENATE_DELEGATE_SCALE[councilSeats];
  if (scaleDelegates === undefined) return null;

  return {
    councilSeats,
    population,
    regime: "scale",
    scaleDelegates,
    delegatesByRight: null,
    supplementaryDelegates: 0,
    supplementaryBrackets: 0,
    total: scaleDelegates,
  };
}

/**
 * Inhabitants per delegate, the figure that makes the rural weighting visible.
 * Null when the college is unknown, so the comparison block disappears rather than
 * showing a ratio built on a guess.
 */
export function inhabitantsPerDelegate(college: CommuneCollege | null): number | null {
  if (!college || college.total <= 0) return null;
  return college.population / college.total;
}
