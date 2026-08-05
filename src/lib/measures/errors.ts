/**
 * The two error classes of the measures lot, in their own file.
 *
 * Isolated because program-editions.ts and assessments.ts throw MeasureValidationError
 * without having anything to do with the rest of transitions.ts. Making them import the
 * transitions module for an error class would create a dependency that says nothing
 * true about the code.
 */

export class MeasureNotFoundError extends Error {
  constructor(measureId: string) {
    super(`Measure ${measureId} not found`);
    this.name = "MeasureNotFoundError";
  }
}

export class MeasureValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MeasureValidationError";
  }
}

/**
 * The measure changed between the moment a page was rendered and the moment its form was
 * submitted.
 *
 * Distinct from MeasureValidationError because the caller has nothing to fix: the input was
 * valid, the world moved. The interface has to say "reload and look again", not "your data is
 * wrong".
 */
export class MeasureConcurrencyError extends Error {
  constructor(
    readonly measureId: string,
    readonly expectedUpdatedAt: Date,
    readonly actualUpdatedAt: Date
  ) {
    super(
      `La mesure a changé depuis l'affichage de cette page ` +
        `(vue à ${expectedUpdatedAt.toISOString()}, modifiée à ${actualUpdatedAt.toISOString()})`
    );
    this.name = "MeasureConcurrencyError";
  }
}
