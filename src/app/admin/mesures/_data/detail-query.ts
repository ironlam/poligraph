import { db } from "@/lib/db";

/**
 * The context of a measure, which `getMeasureForModeration()` does not carry.
 *
 * That function is the lot 1 moderation read and it answers "what has been said, and when".
 * Who says it, for which election, under which candidacy is route-local presentation data, so
 * it is fetched here rather than by widening the shared read.
 */
export async function getMeasureContext(measureId: string) {
  return db.measure.findUnique({
    where: { id: measureId },
    select: {
      theme: true,
      attribution: true,
      createdAt: true,
      updatedAt: true,
      politician: { select: { fullName: true, slug: true } },
      election: { select: { title: true, slug: true } },
      candidacy: { select: { candidateName: true, status: true } },
      programEdition: { select: { label: true, version: true } },
      precedingMeasureId: true,
    },
  });
}

export type MeasureContext = NonNullable<Awaited<ReturnType<typeof getMeasureContext>>>;

export async function listReaderGuidesForModeration() {
  return db.measureReaderGuide.findMany({
    where: { active: true },
    orderBy: [{ publicationStatus: "asc" }, { label: "asc" }],
    select: {
      id: true,
      slug: true,
      label: true,
      publicationStatus: true,
    },
  });
}
