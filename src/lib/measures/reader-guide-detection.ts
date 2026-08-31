export const READER_GUIDE_DETECTOR_VERSION = "mistral-small-latest:reader-guides-v1";

export type ReaderGuideDetection = {
  term: string;
  canonicalLabel: string;
  evidenceSpan: string;
  needsExplanation: true;
  reason: string;
  confidence: number;
};

export function sanitizeReaderGuideDetectionText(value: string, maxLength: number): string {
  return value
    .replace(/["\n\r<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function normalizeReaderGuideTerm(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseDetection(value: unknown): ReaderGuideDetection | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (
    typeof item.term !== "string" ||
    typeof item.canonicalLabel !== "string" ||
    typeof item.evidenceSpan !== "string" ||
    item.needsExplanation !== true ||
    typeof item.reason !== "string" ||
    typeof item.confidence !== "number"
  ) {
    return null;
  }
  const confidence = Math.max(0, Math.min(1, item.confidence));
  const term = sanitizeReaderGuideDetectionText(item.term, 120);
  const canonicalLabel = sanitizeReaderGuideDetectionText(item.canonicalLabel, 120);
  const evidenceSpan = sanitizeReaderGuideDetectionText(item.evidenceSpan, 240);
  const reason = sanitizeReaderGuideDetectionText(item.reason, 300);
  if (!term || !canonicalLabel || !evidenceSpan || !reason) return null;
  return { term, canonicalLabel, evidenceSpan, needsExplanation: true, reason, confidence };
}

export function parseReaderGuideDetections(
  values: unknown[],
  evidenceText: string
): ReaderGuideDetection[] {
  const seen = new Set<string>();
  const evidenceCorpus = evidenceText.toLowerCase();
  return values.flatMap((value) => {
    const detection = parseDetection(value);
    if (!detection || !evidenceCorpus.includes(detection.evidenceSpan.toLowerCase())) return [];
    const normalized = normalizeReaderGuideTerm(detection.term);
    if (!normalized || seen.has(normalized)) return [];
    seen.add(normalized);
    return [detection];
  });
}
