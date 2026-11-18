import crypto from "crypto";

export interface InputHashLink {
  amendmentId: string;
  amendmentNumber: string;
  role: string;
}

export interface InputHashSource {
  sourceType: string;
  sourceId: string;
  field: string;
  text: string;
}

export interface InputHashInput {
  scrutinTitle: string;
  scrutinSourceUrl: string | null;
  proceduralLabel: string;
  links: InputHashLink[];
  sources: InputHashSource[];
}

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex"); // 64 hex chars
}

/**
 * Computes a stable, full 64-char SHA-256 of the generation inputs. Order-invariant
 * over links and sources (both are sorted before hashing). Block text is hashed,
 * not embedded raw. Link roles and amendment numbers are included, so a PARENT →
 * SUB role flip on the same amendment changes the hash.
 */
export function computeInputHash(input: InputHashInput): string {
  const canonical = JSON.stringify({
    scrutinTitle: input.scrutinTitle,
    scrutinSourceUrl: input.scrutinSourceUrl ?? null,
    proceduralLabel: input.proceduralLabel,
    links: [...input.links]
      .map((l) => ({
        amendmentId: l.amendmentId,
        amendmentNumber: l.amendmentNumber,
        role: l.role,
      }))
      .sort((a, b) => (a.role + a.amendmentId).localeCompare(b.role + b.amendmentId)),
    sources: [...input.sources]
      .map((s) => ({
        sourceType: s.sourceType,
        sourceId: s.sourceId,
        field: s.field,
        textSha: sha256(s.text),
      }))
      .sort((a, b) => (a.sourceId + a.field).localeCompare(b.sourceId + b.field)),
  });
  return sha256(canonical);
}

function withoutAgreement(title: string): string {
  return title.replace(/\brelati(?:f|ve)s?\b/gi, "relatif");
}

/**
 * True when the stored hash differs from the current one ONLY because the official
 * title had the agreement of "relatif/relative" corrected at the source (e.g.
 * "projet de loi relative à" → "relatif à"). Two conditions, both required: the
 * two titles are equal once that agreement is neutralised, and hashing the current
 * inputs with the stored title gives back the stored hash, which proves links,
 * sources, URL and label are untouched. Any other title change (amendment number,
 * "à l'article" → "après l'article") stays a real drift.
 */
export function isAgreementOnlyTitleDrift(args: {
  storedHash: string;
  storedTitle: string;
  current: InputHashInput;
}): boolean {
  const { storedHash, storedTitle, current } = args;
  if (storedTitle === current.scrutinTitle) return false;
  if (withoutAgreement(storedTitle) !== withoutAgreement(current.scrutinTitle)) return false;
  return computeInputHash({ ...current, scrutinTitle: storedTitle }) === storedHash;
}
