import type { AffairStatus, AffairCategory, Involvement, SourceType } from "@/types";
import type { PublicationStatus } from "@/generated/prisma";

/**
 * Shape of the affair editing form.
 *
 * Its own module so the form and the field groups it was split into can share the type without
 * importing each other.
 */

export interface Source {
  id?: string;
  url: string;
  title: string;
  publisher: string;
  publishedAt: string;
  excerpt?: string;
  sourceType?: SourceType;
}

export interface AffairFormData {
  id?: string;
  politicianId: string;
  title: string;
  description: string;
  status: AffairStatus;
  category: AffairCategory;
  involvement?: Involvement;
  subjectLabel?: string;
  subjectKind?: "PERSON" | "ORGANISATION" | "UNKNOWN";
  subjectNote?: string;
  involvementNote?: string;
  publicationStatus?: PublicationStatus;
  factsDate?: string;
  startDate?: string;
  verdictDate?: string;
  sentence?: string;
  appeal: boolean;
  // Detailed sentence
  prisonMonths?: number;
  /** `number | null`, not `number | undefined`: clearing the field must reset the column. */
  prisonFirmMonths?: number | null;
  ineligibilityFirmMonths?: number | null;
  fineAmount?: number;
  ineligibilityMonths?: number;
  communityService?: number;
  otherSentence?: string;
  // Jurisdiction
  court?: string;
  caseNumber?: string;
  // Judicial identifiers
  linkedAffairId?: string | null;
  sources: Source[];
}

/** Setter handed down to each field group. */
export type UpdateAffairField = <K extends keyof AffairFormData>(
  field: K,
  value: AffairFormData[K]
) => void;
