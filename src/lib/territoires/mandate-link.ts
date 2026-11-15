import { getDepartmentName, getDepartmentSlug } from "@/config/departments";
import {
  territoireCommuneDecisionsPath,
  territoireCommunePath,
  territoireDepartementPath,
} from "./paths";

/** INSEE code at the end of a local mandate label: "Carcassonne (11069)", "Ajaccio (2A004)". */
const INSEE_SUFFIX = /\(([0-9]{5}|2[AB][0-9]{3})\)$/;

export interface MandateCommuneLinkInput {
  isCurrent: boolean;
  constituency: string | null;
  /** As stored in the profile document: `commune` is set only when the mandate links a commune. */
  localData?: { commune?: unknown } | null;
}

export interface MandateCommuneLink {
  href: string;
  /** True for a mandate that ended: the link then says « historique ». */
  historique: boolean;
}

/**
 * Link from a local mandate to its Territoires commune page (#1052, Liens.html P1; past
 * mandates since lot B).
 *
 * A past mandate is linked too, and flagged: the page it leads to describes the commune today,
 * not at the time of the mandate, so the label must say « historique ». The commune must exist
 * in the base, which the profile document already proves through `localData.commune` (a foreign
 * key to Commune), so no extra read is needed. The code is taken from the label, measured on
 * production on 2026-10-11 to equal `MandateLocal.communeId` on every row that carries one; a
 * label without a code yields no link rather than a guessed one.
 */
export function mandateCommuneLink(mandate: MandateCommuneLinkInput): MandateCommuneLink | null {
  if (!mandate.localData?.commune) return null;
  const code = mandate.constituency?.trim().match(INSEE_SUFFIX)?.[1];
  return code ? { href: territoireCommunePath(code), historique: !mandate.isCurrent } : null;
}

export interface MandateDepartementLinkInput {
  type: string;
  isCurrent: boolean;
  departmentCode: string | null;
}

/**
 * Link from the current mandate of a deputy or a senator to the Territoires page of the
 * department they sit for. Null for a code without a department page (seats of the French
 * abroad, collectivities outside the referential): never a guessed destination.
 */
export function mandateDepartementHref(mandate: MandateDepartementLinkInput): string | null {
  if (!mandate.isCurrent || (mandate.type !== "DEPUTE" && mandate.type !== "SENATEUR")) return null;
  const name = getDepartmentName(mandate.departmentCode);
  return name ? territoireDepartementPath(getDepartmentSlug(name)) : null;
}

const MUNICIPAL_TYPES = new Set(["MAIRE", "ADJOINT_MAIRE", "CONSEILLER_MUNICIPAL"]);

export interface MandateDecisionsLinkInput {
  type: string;
  /** As stored in the profile document: `decisionsCommuneId` is set only while a decision is published. */
  localData?: { commune?: unknown } | null;
}

/**
 * Link from a municipal mandate, current or past, to the council decisions of its commune
 * (#1052, lot 2). Present only while the commune has a published municipal council decision;
 * the destination places each decision in its period and never attributes it to the person.
 */
export function mandateDecisionsHref(mandate: MandateDecisionsLinkInput): string | null {
  if (!MUNICIPAL_TYPES.has(mandate.type)) return null;
  const commune = mandate.localData?.commune as { decisionsCommuneId?: unknown } | null | undefined;
  const code = commune?.decisionsCommuneId;
  return typeof code === "string" && code ? territoireCommuneDecisionsPath(code) : null;
}
