/** A sourced definition shorter than this is too thin to earn its own search result. */
export const MIN_READER_GUIDE_DEFINITION_LENGTH = 80;

export type ReaderGuideIndexSignals = {
  active: boolean;
  published: boolean;
  reviewedAt: Date | null;
  sourceUrl: string;
  definition: string;
  publicMeasureCount: number;
};

/**
 * A repère page is indexable only when it combines reviewed editorial content with at least one
 * public use in the corpus. The source and the measure make it a useful definition page rather
 * than an isolated glossary stub.
 */
export function isIndexableReaderGuide(signals: ReaderGuideIndexSignals): boolean {
  return (
    signals.active &&
    signals.published &&
    signals.reviewedAt !== null &&
    signals.sourceUrl.trim().length > 0 &&
    signals.definition.trim().length >= MIN_READER_GUIDE_DEFINITION_LENGTH &&
    signals.publicMeasureCount >= 1
  );
}
