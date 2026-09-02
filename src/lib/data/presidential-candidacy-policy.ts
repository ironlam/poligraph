import type { Prisma } from "@/generated/prisma";
import { PUBLIC_POLITICIAN_WHERE } from "@/lib/api/public-contract";

/**
 * Public tracking population, independent from publication of the richer presidential fiche.
 */
export const PUBLIC_TRACKED_PRESIDENTIAL_CANDIDACY_WHERE = {
  status: { not: null },
  sourceUrl: { not: null },
  sourceLabel: { not: null },
  politicianId: { not: null },
  politician: { is: PUBLIC_POLITICIAN_WHERE },
} satisfies Prisma.CandidacyWhereInput;

/** Editorial extension required by the public fiche and comparison surfaces. */
export const PUBLIC_PRESIDENTIAL_EXTENSION_WHERE = {
  presidentialData: { is: { publicationStatus: "PUBLISHED" } },
} satisfies Prisma.CandidacyWhereInput;

export function getPublicTrackedPresidentialCandidacyWhere(
  politicianSlug?: string
): Prisma.CandidacyWhereInput {
  return {
    ...PUBLIC_TRACKED_PRESIDENTIAL_CANDIDACY_WHERE,
    politician: {
      is: {
        ...PUBLIC_POLITICIAN_WHERE,
        ...(politicianSlug !== undefined ? { slug: politicianSlug } : {}),
      },
    },
  };
}
