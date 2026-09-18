export type ScopeExclusion =
  | "NOT_WHOLE_BILL"
  | "PARLIAMENTARY_BILL"
  | "DOSSIER_UNRESOLVED"
  | "DOSSIER_LINK_REQUIRES_REVIEW"
  | "ORIGIN_UNDETERMINED"
  | "ORIGIN_CONFLICT";

/** An object-of-vote check, independent of the official voting procedure (SPS/SPO).
 * Anchoring excludes amendments, motions and budget-section votes mentioning a bill.
 */
export function getWholeBillKind(title: string): "projet" | "proposition" | null {
  const match = title
    .normalize("NFC")
    .trim()
    .match(/^l['’]ensemble\s+(?:du\s+(projet)|de\s+la\s+(proposition))\s+de\s+loi\b/i);
  return match ? (match[1] ? "projet" : "proposition") : null;
}

/** PR1 audit policy: heuristic dossier links stay visible but need human review.
 * The audit does not silently ratify the existing session/title resolver thresholds.
 */
export function getGovernmentScopeExclusion(
  title: string,
  link: { resolvedDossierExternalId: string | null; resolution: string },
  origin: string | undefined
): ScopeExclusion | null {
  const kind = getWholeBillKind(title);
  if (!kind) return "NOT_WHOLE_BILL";
  if (kind === "proposition") return "PARLIAMENTARY_BILL";
  if (!link.resolvedDossierExternalId) return "DOSSIER_UNRESOLVED";
  if (link.resolution !== "VOTE_REF") return "DOSSIER_LINK_REQUIRES_REVIEW";
  if (origin === "PARLEMENTAIRE") return "ORIGIN_CONFLICT";
  if (origin !== "GOUVERNEMENTALE") return "ORIGIN_UNDETERMINED";
  return null;
}
