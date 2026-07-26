import { db } from "@/lib/db";
import { generateUniqueSlug } from "@/lib/utils";
import type {
  AffairCategory,
  AffairStatus,
  Involvement,
  Prisma,
  SourceType,
} from "@/generated/prisma";

// Affaires v2, lot 1: the single door through which an importer may create an
// affair. Its counterpart is proposeAffairUpdate(), the only door for changing an
// existing one. src/services/sync must not call db.affair.create directly, so
// that "importers only ever create drafts" is enforced in one place instead of
// being re-asserted at every call site.
//
// The field surface is spelled out here rather than reusing the proposal
// whitelist: creating a whole affair and patching a live one are different
// operations. Creation legitimately sets factsDate, which no importer may patch.

const SLUG_MAX_LENGTH = 120;

export interface DraftAffairSource {
  url: string;
  title: string;
  publisher: string;
  publishedAt: Date;
  sourceType: SourceType;
  excerpt?: string | null;
}

export interface CreateDraftAffairInput {
  politicianId: string;
  title: string;
  /** Base slug; uniqueness is resolved here. */
  baseSlug: string;
  description: string;
  status: AffairStatus;
  category: AffairCategory;
  involvement?: Involvement;
  confidenceScore?: number;

  // Dates, distinct on purpose: factsDate is when the alleged facts happened,
  // verdictDate is when a court ruled. Conflating them is what lot 1 fixed.
  factsDate?: Date | null;
  verdictDate?: Date | null;

  // Jurisdiction and machine identifiers
  court?: string | null;

  // Sentence
  sentence?: string | null;
  prisonMonths?: number | null;
  prisonSuspended?: boolean | null;
  ineligibilityMonths?: number | null;
  communityService?: number | null;
  otherSentence?: string | null;

  sources: DraftAffairSource[];
}

/**
 * Creates an affair in DRAFT, always.
 *
 * publicationStatus and verifiedAt are hard-coded, not parameters: no importer
 * argument can publish an affair or mark it verified (invariant I1, RGPD art. 10).
 */
export async function createDraftAffairFromDiscovery(
  input: CreateDraftAffairInput
): Promise<{ id: string; slug: string }> {
  const slug = await generateUniqueSlug(
    input.baseSlug,
    (candidate) => db.affair.findUnique({ where: { slug: candidate } }).then(Boolean),
    SLUG_MAX_LENGTH
  );

  const data: Prisma.AffairUncheckedCreateInput = {
    politicianId: input.politicianId,
    title: input.title,
    slug,
    description: input.description,
    status: input.status,
    category: input.category,
    ...(input.involvement !== undefined ? { involvement: input.involvement } : {}),
    ...(input.confidenceScore !== undefined ? { confidenceScore: input.confidenceScore } : {}),
    factsDate: input.factsDate ?? null,
    verdictDate: input.verdictDate ?? null,
    court: input.court ?? null,
    sentence: input.sentence ?? null,
    prisonMonths: input.prisonMonths ?? null,
    prisonSuspended: input.prisonSuspended ?? null,
    ineligibilityMonths: input.ineligibilityMonths ?? null,
    communityService: input.communityService ?? null,
    otherSentence: input.otherSentence ?? null,
    publicationStatus: "DRAFT",
    verifiedAt: null,
    sources: {
      create: input.sources.map((s) => ({
        url: s.url,
        title: s.title,
        publisher: s.publisher,
        publishedAt: s.publishedAt,
        sourceType: s.sourceType,
        excerpt: s.excerpt ?? null,
      })),
    },
  };

  return db.affair.create({ data, select: { id: true, slug: true } });
}
