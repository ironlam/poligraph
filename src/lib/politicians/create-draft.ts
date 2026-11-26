import { db } from "@/lib/db";
import { normalizeText } from "@/lib/name-matching";
import { generateSlug } from "@/lib/utils";
import type { RequestMeta } from "@/lib/security";
import { findHomonymIds, findHomonyms, homonymKey, type Homonym } from "./homonyms";

export type CreateDraftInput = {
  firstName: string;
  lastName: string;
  civility?: "M." | "Mme" | null;
  /** YYYY-MM-DD. */
  birthDate?: string | null;
  birthPlace?: string | null;
  slug?: string;
  /** Ids of the namesakes the admin was shown before confirming. */
  acknowledgedHomonymIds: string[];
};

export type CreateDraftResult =
  | { kind: "created"; politician: { id: string; slug: string; publicId: string | null } }
  /** A namesake exists that the admin has not been shown: nothing was written. */
  | { kind: "unseen-homonyms"; homonyms: Homonym[] }
  | { kind: "slug-taken"; slug: string };

/**
 * Creates a profile by hand, always as a DRAFT.
 *
 * The one rule: no profile is created over a namesake the admin has not looked at. The caller
 * sends the ids it displayed; under a lock on the name, the namesakes are read again and any id
 * missing from that list refuses the write. A second click on the button, or two admins typing
 * the same name, therefore meet the row the first request created.
 *
 * `statusOverride` is set because `determineStatus` would otherwise reassign the status on its
 * next pass: a hand-made draft is published by a human, never by a rule.
 *
 * The profile and its audit row are written in one transaction.
 */
export async function createDraftPolitician(
  input: CreateDraftInput,
  meta: RequestMeta
): Promise<CreateDraftResult> {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const fullName = `${firstName} ${lastName}`;
  const slug = input.slug?.trim() || generateSlug(fullName);
  const key = homonymKey(firstName, lastName);
  const acknowledged = new Set(input.acknowledgedHomonymIds);

  return db.$transaction(async (tx) => {
    // Released at commit or rollback. Serializes creations of the same name only.
    await tx.$queryRaw`
      SELECT pg_advisory_xact_lock(hashtextextended(${`politician-create:${key.last}:${key.first}`}, 0))
    `;

    const homonymIds = await findHomonymIds(tx, firstName, lastName);
    if (homonymIds.some((id) => !acknowledged.has(id))) {
      return { kind: "unseen-homonyms", homonyms: await findHomonyms(tx, firstName, lastName) };
    }

    const slugOwner = await tx.politician.findUnique({ where: { slug }, select: { id: true } });
    if (slugOwner) return { kind: "slug-taken", slug };

    const politician = await tx.politician.create({
      data: {
        slug,
        firstName,
        lastName,
        fullName,
        normalizedLastName: normalizeText(lastName),
        civility: input.civility ?? null,
        birthDate: input.birthDate ? new Date(input.birthDate) : null,
        birthPlace: input.birthPlace?.trim() || null,
        publicationStatus: "DRAFT",
        statusOverride: true,
        source: "MANUAL",
      },
      select: { id: true, slug: true, publicId: true },
    });

    await tx.auditLog.create({
      data: {
        action: "CREATE",
        entityType: "Politician",
        entityId: politician.id,
        changes: {
          fullName,
          slug,
          publicationStatus: "DRAFT",
          statusOverride: true,
          source: "MANUAL",
          acknowledgedHomonymIds: [...acknowledged].sort(),
        },
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      },
    });

    return { kind: "created", politician };
  });
}
