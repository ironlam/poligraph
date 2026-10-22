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

/**
 * The active subtopics of the measure's theme that a human can still add to a revision: the ones
 * already approved or waiting for a decision are left out, a refused one can be added back.
 */
export async function listAddableSubtopics(
  theme: MeasureContext["theme"],
  takenSubtopicIds: string[]
): Promise<Array<{ id: string; label: string }>> {
  return db.measureSubtopic.findMany({
    where: {
      theme,
      active: true,
      ...(takenSubtopicIds.length > 0 ? { id: { notIn: takenSubtopicIds } } : {}),
    },
    select: { id: true, label: true },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });
}

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
