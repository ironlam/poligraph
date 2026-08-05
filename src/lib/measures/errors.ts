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
