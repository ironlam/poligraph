/**
 * Classifies the origin of a legislative dossier from the official initial
 * initiative deposit.  The procedure label is deliberately not used: it can
 * describe a mixed procedure and is not a source of provenance.
 */

export const DOSSIER_ORIGINS = ["GOUVERNEMENTALE", "PARLEMENTAIRE", "INDETERMINEE"] as const;
export type DossierOrigin = (typeof DOSSIER_ORIGINS)[number];

export const DOSSIER_ORIGIN_REASONS = [
  "INITIAL_DEPOSIT_PRJL",
  "INITIAL_DEPOSIT_PION",
  "INITIAL_DEPOSIT_PNRE",
  "INITIAL_DEPOSIT_MULTIPLE_SAME_ORIGIN",
  "INITIAL_DEPOSIT_CONFLICT",
  "INITIAL_DEPOSIT_MISSING_DOCUMENT",
  "INITIAL_DEPOSIT_UNKNOWN_DOCUMENT_PREFIX",
  "NO_INITIAL_DEPOSIT",
] as const;
export type DossierOriginReason = (typeof DOSSIER_ORIGIN_REASONS)[number];

export interface DossierOriginEvidence {
  codeActe: string | null;
  acteUid: string | null;
  acteType: string | null;
  documentRef: string | null;
  dateActe: string | null;
  label: string | null;
}

export interface DossierOriginResult {
  origin: DossierOrigin;
  originDocumentRef: string | null;
  originReason: DossierOriginReason;
  originEvidence: DossierOriginEvidence | null;
  candidateDocumentRefs: string[];
}

interface RawActe {
  codeActe?: unknown;
  uid?: unknown;
  "@xsi:type"?: unknown;
  dateActe?: unknown;
  texteAssocie?: unknown;
  libelleActe?: {
    nomCanonique?: unknown;
    libelleCourt?: unknown;
  } | null;
  actesLegislatifs?: {
    acteLegislatif?: unknown;
  } | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asRawActe(value: unknown): RawActe | null {
  return isRecord(value) ? (value as RawActe) : null;
}

function flattenActes(value: unknown, result: RawActe[] = []): RawActe[] {
  if (Array.isArray(value)) {
    for (const item of value) flattenActes(item, result);
    return result;
  }

  const acte = asRawActe(value);
  if (!acte) return result;

  result.push(acte);
  flattenActes(acte.actesLegislatifs?.acteLegislatif, result);
  return result;
}

function getActesLegislatifs(input: unknown): unknown {
  if (!isRecord(input)) return null;

  // Accept both the dossierParlementaire object and the outer JSON wrapper.
  const dossier = isRecord(input.dossierParlementaire) ? input.dossierParlementaire : input;
  const actes = isRecord(dossier.actesLegislatifs) ? dossier.actesLegislatifs : null;
  return actes?.acteLegislatif ?? null;
}

function isInitialDeposit(acte: RawActe): boolean {
  const code = asString(acte.codeActe)?.toUpperCase();
  const type = asString(acte["@xsi:type"]);
  if (!code || !type) return false;

  // A navette deposit is a later transmission, not the initiative's origin.
  return /(?:^|-)DEPOT$/.test(code) && /DepotInitiative/i.test(type) && !/Navette/i.test(type);
}

function evidenceFor(acte: RawActe): DossierOriginEvidence {
  const label = isRecord(acte.libelleActe)
    ? (asString(acte.libelleActe.nomCanonique) ?? asString(acte.libelleActe.libelleCourt))
    : null;

  return {
    codeActe: asString(acte.codeActe),
    acteUid: asString(acte.uid),
    acteType: asString(acte["@xsi:type"]),
    documentRef: asString(acte.texteAssocie),
    dateActe: asString(acte.dateActe),
    label,
  };
}

function sortByInitialDate(
  entries: Array<{ evidence: DossierOriginEvidence; sourceOrder: number }>
): Array<{ evidence: DossierOriginEvidence; sourceOrder: number }> {
  return [...entries].sort((a, b) => {
    const aTime = a.evidence.dateActe ? Date.parse(a.evidence.dateActe) : Number.NaN;
    const bTime = b.evidence.dateActe ? Date.parse(b.evidence.dateActe) : Number.NaN;
    if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) {
      return aTime - bTime;
    }
    if (Number.isFinite(aTime) !== Number.isFinite(bTime)) return Number.isFinite(aTime) ? -1 : 1;
    return a.sourceOrder - b.sourceOrder;
  });
}

function classifyDocumentRef(documentRef: string): DossierOrigin | null {
  const normalized = documentRef.trim().toUpperCase();
  if (normalized.startsWith("PRJL")) return "GOUVERNEMENTALE";
  if (normalized.startsWith("PION") || normalized.startsWith("PNRE")) return "PARLEMENTAIRE";
  return null;
}

function result(
  origin: DossierOrigin,
  reason: DossierOriginReason,
  evidence: DossierOriginEvidence | null,
  candidateDocumentRefs: string[]
): DossierOriginResult {
  return {
    origin,
    originDocumentRef: evidence?.documentRef ?? null,
    originReason: reason,
    originEvidence: evidence,
    candidateDocumentRefs,
  };
}

/**
 * Classify a dossier using only its initial `DepotInitiative_Type` act.
 *
 * The function accepts either `dossierParlementaire` or the outer JSON
 * object. Unknown and incomplete official records fail closed to
 * `INDETERMINEE` and retain the available deposit evidence.
 */
export function classifyDossierOrigin(input: unknown): DossierOriginResult {
  const allActes = flattenActes(getActesLegislatifs(input));
  const initialDeposits = sortByInitialDate(
    allActes
      .map((acte, sourceOrder) => ({ acte, sourceOrder }))
      .filter(({ acte }) => isInitialDeposit(acte))
      .map(({ acte, sourceOrder }) => ({ evidence: evidenceFor(acte), sourceOrder }))
  );
  const candidateDocumentRefs = initialDeposits
    .map(({ evidence }) => evidence.documentRef)
    .filter((ref): ref is string => ref !== null);

  if (initialDeposits.length === 0) {
    return result("INDETERMINEE", "NO_INITIAL_DEPOSIT", null, []);
  }

  const missingDocument = initialDeposits.some(({ evidence }) => evidence.documentRef === null);
  if (missingDocument) {
    return result(
      "INDETERMINEE",
      "INITIAL_DEPOSIT_MISSING_DOCUMENT",
      initialDeposits[0]?.evidence ?? null,
      candidateDocumentRefs
    );
  }

  const origins = initialDeposits.map(({ evidence }) => classifyDocumentRef(evidence.documentRef!));
  const firstOrigin = origins[0];
  if (!firstOrigin || origins.some((origin) => origin !== firstOrigin)) {
    return result(
      "INDETERMINEE",
      origins.some((origin) => origin === null)
        ? "INITIAL_DEPOSIT_UNKNOWN_DOCUMENT_PREFIX"
        : "INITIAL_DEPOSIT_CONFLICT",
      initialDeposits[0]?.evidence ?? null,
      candidateDocumentRefs
    );
  }

  return result(
    firstOrigin,
    initialDeposits.length > 1
      ? "INITIAL_DEPOSIT_MULTIPLE_SAME_ORIGIN"
      : firstOrigin === "GOUVERNEMENTALE"
        ? "INITIAL_DEPOSIT_PRJL"
        : candidateDocumentRefs[0]?.toUpperCase().startsWith("PNRE")
          ? "INITIAL_DEPOSIT_PNRE"
          : "INITIAL_DEPOSIT_PION",
    initialDeposits[0]?.evidence ?? null,
    candidateDocumentRefs
  );
}
