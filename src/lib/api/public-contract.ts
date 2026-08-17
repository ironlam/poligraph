import {
  Prisma,
  type AffairCategory,
  type AffairStatus,
  type Involvement,
  type MandateType,
} from "@/generated/prisma";
import {
  AFFAIR_CATEGORY_LABELS,
  AFFAIR_STATUS_DESCRIPTIONS,
  AFFAIR_STATUS_LABELS,
  AFFAIR_STATUS_NEEDS_PRESUMPTION,
  FACTCHECK_ALLOWED_SOURCES,
  INVOLVEMENT_LABELS,
} from "@/config/labels";
import { CERTAINTY_LABELS, getCertaintyLevel, isAccusedInvolvement } from "@/config/certainty";
import { getJudicialMaturity, MATURITY_LABELS } from "@/config/judicial-maturity";

/**
 * Canonical public boundary shared by API consumers (including MCP clients).
 * Public routes must never widen these predicates based on user input.
 */
export const PUBLIC_POLITICIAN_PUBLICATION_STATUS = "PUBLISHED" as const;

export const PUBLIC_POLITICIAN_WHERE = {
  publicationStatus: PUBLIC_POLITICIAN_PUBLICATION_STATUS,
} satisfies Prisma.PoliticianWhereInput;

/**
 * A party is public only when at least one public politician is attached to it.
 * This prevents list, detail and search surfaces from enumerating internal-only
 * parties through an otherwise zero-valued member count.
 */
export const PUBLIC_PARTY_WHERE = {
  politicians: { some: PUBLIC_POLITICIAN_WHERE },
} satisfies Prisma.PartyWhereInput;

export function getPublicPartySqlWhere(): Prisma.Sql {
  return Prisma.sql`EXISTS (
    SELECT 1
    FROM "Politician" public_party_member
    WHERE public_party_member."currentPartyId" = p."id"
      AND public_party_member."publicationStatus" = ${PUBLIC_POLITICIAN_PUBLICATION_STATUS}
  )`;
}

export const PUBLIC_FACTCHECK_PUBLICATION_STATUS = "PUBLISHED" as const;
export const PUBLIC_FACTCHECK_SOURCES = FACTCHECK_ALLOWED_SOURCES;

export function isAllowedFactCheckSource(source: string): boolean {
  return (PUBLIC_FACTCHECK_SOURCES as readonly string[]).includes(source);
}

/**
 * Public fact-check predicate for Prisma queries. When a source is supplied it
 * is combined with, never substituted for, the publication + allow-list gate.
 */
export function getPublicFactCheckWhere(source?: string): Prisma.FactCheckWhereInput {
  const base: Prisma.FactCheckWhereInput = {
    publicationStatus: PUBLIC_FACTCHECK_PUBLICATION_STATUS,
    source: { in: [...PUBLIC_FACTCHECK_SOURCES] },
  };

  return source ? { AND: [base, { source }] } : base;
}

/**
 * SQL equivalent of getPublicFactCheckWhere() for raw queries. Only the two
 * fixed aliases used by public statistics/search are accepted, so no caller can
 * interpolate an arbitrary SQL identifier.
 */
export function getPublicFactCheckSqlWhere(alias: "fc" | "fc2" = "fc"): Prisma.Sql {
  if (alias === "fc2") {
    return Prisma.sql`fc2."publicationStatus" = ${PUBLIC_FACTCHECK_PUBLICATION_STATUS}
      AND fc2.source IN (${Prisma.join(PUBLIC_FACTCHECK_SOURCES)})`;
  }

  return Prisma.sql`fc."publicationStatus" = ${PUBLIC_FACTCHECK_PUBLICATION_STATUS}
    AND fc.source IN (${Prisma.join(PUBLIC_FACTCHECK_SOURCES)})`;
}

/**
 * Editorial semantics for an affair as consumed outside the web UI.
 * The status still describes the affair, but `statusAppliesToPolitician`
 * prevents a consumer from attributing it to a victim/plaintiff/mention.
 */
export function getPublicAffairSemantics(affair: {
  status: AffairStatus;
  category: AffairCategory;
  involvement: Involvement;
}) {
  const statusAppliesToPolitician = isAccusedInvolvement(affair.involvement);
  const certaintyLevel = statusAppliesToPolitician ? getCertaintyLevel(affair.status) : null;
  const judicialMaturity = getJudicialMaturity(affair.status);

  return {
    involvementLabel: INVOLVEMENT_LABELS[affair.involvement],
    statusLabel: AFFAIR_STATUS_LABELS[affair.status],
    statusDescription: AFFAIR_STATUS_DESCRIPTIONS[affair.status],
    categoryLabel: AFFAIR_CATEGORY_LABELS[affair.category],
    statusAppliesToPolitician,
    needsPresumption: statusAppliesToPolitician && AFFAIR_STATUS_NEEDS_PRESUMPTION[affair.status],
    certaintyLevel,
    certaintyLabel: certaintyLevel ? CERTAINTY_LABELS[certaintyLevel] : null,
    judicialMaturity,
    judicialMaturityLabel: MATURITY_LABELS[judicialMaturity],
  };
}

export type PublicFieldPublicationStatus = "AVAILABLE" | "UNVERIFIED";

/**
 * Temporary publication guard for #698. Senator start dates currently lack
 * individual provenance, so consumers may keep the raw field for compatibility
 * but must not present it as verified tenure until the source invariant is fixed.
 */
export function getMandateStartDatePublicationStatus(
  type: MandateType
): PublicFieldPublicationStatus {
  return type === "SENATEUR" ? "UNVERIFIED" : "AVAILABLE";
}
