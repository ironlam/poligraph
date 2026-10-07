import { db } from "@/lib/db";
import { DataSource, MandateType } from "@/generated/prisma";
import { HTTPClient } from "@/lib/api/http-client";
import { WIKIDATA_RATE_LIMIT_MS } from "@/config/rate-limits";
import { PHOTO_SOURCE_PRIORITY, shouldUpdatePhoto } from "@/config/photos";
import { COMMONS_STORED_WIDTH, commonsThumbnailUrl } from "@/lib/photos/commons";
import { identifyPhoto } from "@/lib/photos/source-photo";
import { uploadSourcePhotoCopy } from "@/lib/photos/blob";

const wikidataClient = new HTTPClient({ rateLimitMs: WIKIDATA_RATE_LIMIT_MS });

interface PhotoSyncResult {
  success: boolean;
  checked: number;
  updated: number;
  validated: number;
  invalidUrls: number;
  errors: string[];
}

type PhotoFetch =
  | { kind: "photo"; buffer: Buffer; contentType: string }
  /** Downloaded fine, but the bytes are a placeholder or a web page. */
  | { kind: "not-a-photo" }
  /** Error status or network failure: says nothing about the photo itself. */
  | { kind: "unreachable" };

/**
 * Download a photo and check the bytes. A HEAD request used to be enough here,
 * which let NosSénateurs placeholders (a 200 with a black 129-byte PNG) count as
 * valid photos.
 */
async function fetchPhoto(url: string): Promise<PhotoFetch> {
  let buffer: Buffer;
  try {
    const { status, data } = await wikidataClient.getBuffer(url);
    // Only a 200 with a body says anything about the photo. The European
    // Parliament firewall answers a 202 with an empty body, which once had every
    // official MEP portrait replaced or removed.
    if (status !== 200 || data.length === 0) return { kind: "unreachable" };
    buffer = data;
  } catch {
    return { kind: "unreachable" };
  }
  const photo = identifyPhoto(buffer);
  return photo
    ? { kind: "photo", buffer, contentType: photo.contentType }
    : { kind: "not-a-photo" };
}

/**
 * Copy the photo to Vercel Blob so pages do not depend on the source host: the
 * image optimizer answers 502 on some of them. A failed upload (no token on a
 * local run, Blob outage) leaves the copy empty, as before.
 */
async function copyToBlob(
  politicianId: string,
  photo: { buffer: Buffer; contentType: string }
): Promise<string | null> {
  try {
    return await uploadSourcePhotoCopy(politicianId, photo.buffer, photo.contentType);
  } catch {
    return null;
  }
}

/**
 * Get photo URL from Wikidata P18 via REST API + Wikimedia Commons thumbnail.
 *
 * Uses the Wikidata REST API (not SPARQL) for speed and reliability, then
 * constructs a direct thumbnail URL. The width must come from the official
 * allowed list, otherwise upload.wikimedia.org rejects the hotlink — see
 * `@/lib/photos/commons`.
 */
async function getWikidataPhoto(wikidataId: string): Promise<string | null> {
  try {
    const { data } = await wikidataClient.get<{
      claims?: { P18?: Array<{ mainsnak?: { datavalue?: { value: string } } }> };
    }>(
      `https://www.wikidata.org/w/api.php?action=wbgetclaims&entity=${wikidataId}&property=P18&format=json`
    );

    const filename = data.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
    if (!filename) return null;

    return commonsThumbnailUrl(filename, COMMONS_STORED_WIDTH);
  } catch {
    return null;
  }
}

/**
 * Normalize name for HATVP photo URL (remove accents, lowercase)
 */
function normalizeForHatvp(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/[^a-z]/g, ""); // Keep only letters
}

/**
 * Generate potential photo URLs based on politician data
 */
async function getPotentialPhotoUrls(politician: {
  id: string;
  slug: string;
  firstName: string;
  lastName: string;
  externalIds: { source: DataSource; externalId: string }[];
  mandates: { type: MandateType; isCurrent: boolean }[];
}): Promise<{ url: string; source: string }[]> {
  const urls: { url: string; source: string }[] = [];

  // Check mandate types to determine which sources to try
  const hasDeputeMandate = politician.mandates.some((m) => m.type === MandateType.DEPUTE);
  const hasSenateurMandate = politician.mandates.some((m) => m.type === MandateType.SENATEUR);
  const gouvernementTypes: MandateType[] = [
    MandateType.MINISTRE,
    MandateType.PREMIER_MINISTRE,
    MandateType.MINISTRE_DELEGUE,
    MandateType.SECRETAIRE_ETAT,
  ];
  const hasGouvernementMandate = politician.mandates.some((m) =>
    gouvernementTypes.includes(m.type)
  );

  // Get external IDs
  const anId = politician.externalIds.find(
    (e) => e.source === DataSource.ASSEMBLEE_NATIONALE
  )?.externalId;
  const senatId = politician.externalIds.find((e) => e.source === DataSource.SENAT)?.externalId;
  const wikidataId = politician.externalIds.find(
    (e) => e.source === DataSource.WIKIDATA
  )?.externalId;

  // 1. Assemblée Nationale (highest priority for deputies)
  if (anId && hasDeputeMandate) {
    urls.push({
      url: `https://www.assemblee-nationale.fr/dyn/static/tribun/17/photos/${anId.replace("PA", "")}.jpg`,
      source: "assemblee-nationale",
    });
  }

  // 2. Sénat (highest priority for senators)
  if (senatId && hasSenateurMandate) {
    urls.push({
      url: `https://www.senat.fr/senimg/${senatId}.jpg`,
      source: "senat",
    });
  }

  // 3. HATVP photos (format: nom-prenom.jpg)
  // Try for government members and anyone with HATVP declaration
  if (hasGouvernementMandate || politician.externalIds.some((e) => e.source === DataSource.HATVP)) {
    const hatvpName = `${normalizeForHatvp(politician.lastName)}-${normalizeForHatvp(politician.firstName)}`;
    urls.push({
      url: `https://www.hatvp.fr/livraison/photos_gouvernement/${hatvpName}.jpg`,
      source: "hatvp",
    });
  }

  // 4. NosDéputés/NosSénateurs
  if (hasDeputeMandate) {
    urls.push({
      url: `https://www.nosdeputes.fr/depute/photo/${politician.slug}/120`,
      source: "nosdeputes",
    });
  }
  if (hasSenateurMandate) {
    urls.push({
      url: `https://archive.nossenateurs.fr/senateur/photo/${politician.slug}/120`,
      source: "nossenateurs",
    });
  }

  // 5. Wikidata
  if (wikidataId) {
    const wikiPhoto = await getWikidataPhoto(wikidataId);
    if (wikiPhoto) {
      urls.push({ url: wikiPhoto, source: "wikidata" });
    }
  }

  return urls;
}

/**
 * Sync photos for all politicians without photos or with invalid photos
 */
export async function syncPhotos(
  options: { validateExisting?: boolean; limit?: number; slugs?: string[] } = {}
): Promise<PhotoSyncResult> {
  const { validateExisting = false, limit, slugs } = options;

  const result: PhotoSyncResult = {
    success: false,
    checked: 0,
    updated: 0,
    validated: 0,
    invalidUrls: 0,
    errors: [],
  };

  try {
    console.log("Starting photo sync...");

    // Get politicians who need photos
    const politicians = await db.politician.findMany({
      // Validation only reads politicians who have a photo: walking the 47 600
      // without one queried Wikidata for each and took over three hours. Finding
      // missing photos is the default mode's job. --slug targets named
      // politicians whatever their photo.
      where: slugs?.length
        ? { slug: { in: slugs } }
        : validateExisting
          ? { AND: [{ photoUrl: { not: null } }, { photoUrl: { not: "" } }] }
          : { OR: [{ photoUrl: null }, { photoUrl: "" }] },
      // Rotation cursor: process the least-recently-checked first so a bounded
      // (--limit) run eventually covers everyone across successive syncs.
      orderBy: { photoCheckedAt: { sort: "asc", nulls: "first" } },
      take: limit,
      select: {
        id: true,
        slug: true,
        firstName: true,
        lastName: true,
        fullName: true,
        photoUrl: true,
        photoSource: true,
        blobPhotoUrl: true,
        externalIds: {
          select: { source: true, externalId: true },
        },
        mandates: {
          select: { type: true, isCurrent: true },
        },
      },
    });

    console.log(`Checking ${politicians.length} politicians${limit ? ` (limit ${limit})` : ""}...`);

    for (const politician of politicians) {
      result.checked++;

      // If validating existing photos, check if current URL is valid
      let currentIsNotAPhoto = false;
      if (validateExisting && politician.photoUrl) {
        const current = await fetchPhoto(politician.photoUrl);
        if (current.kind === "photo") {
          result.validated++;
          if (!politician.blobPhotoUrl) {
            const blobPhotoUrl = await copyToBlob(politician.id, current);
            if (blobPhotoUrl) {
              await db.politician.update({ where: { id: politician.id }, data: { blobPhotoUrl } });
            }
          }
          continue;
        }
        currentIsNotAPhoto = current.kind === "not-a-photo";
        result.invalidUrls++;
        console.log(`Invalid photo URL for ${politician.fullName}: ${politician.photoUrl}`);
      }

      // Try to get a new photo
      const potentialUrls = await getPotentialPhotoUrls(politician);

      // Sort by priority
      potentialUrls.sort((a, b) => {
        const priorityA = PHOTO_SOURCE_PRIORITY[a.source] ?? 0;
        const priorityB = PHOTO_SOURCE_PRIORITY[b.source] ?? 0;
        return priorityB - priorityA;
      });

      // Try each URL until one works
      let stamped = false;
      for (const { url, source } of potentialUrls) {
        const candidate = await fetchPhoto(url);
        if (candidate.kind === "photo") {
          // Check if this is a better source than current
          // A real photo beats a placeholder whatever its source rank.
          if (currentIsNotAPhoto || shouldUpdatePhoto(politician.photoSource, source)) {
            await db.politician.update({
              where: { id: politician.id },
              data: {
                photoUrl: url,
                photoSource: source,
                blobPhotoUrl: await copyToBlob(politician.id, candidate),
                photoCheckedAt: new Date(),
              },
            });
            stamped = true;
            result.updated++;
            console.log(`Updated photo for ${politician.fullName} (${source})`);
          }
          break;
        }
      }

      // Stamp the rotation cursor even when no photo was found, so the next
      // bounded run advances past this politician instead of retrying it.
      // Done per-row (not in one final batch) so progress survives a timeout.
      // A current photo that downloads fine but is not one (placeholder, web
      // page) is removed when nothing replaced it, so the profile shows initials
      // rather than a black box. An unreachable source is left alone: a timeout
      // says nothing about the photo.
      if (!stamped) {
        await db.politician.update({
          where: { id: politician.id },
          data: currentIsNotAPhoto
            ? { photoUrl: null, photoSource: null, blobPhotoUrl: null, photoCheckedAt: new Date() }
            : { photoCheckedAt: new Date() },
        });
      }

      // Progress logging every 100 politicians
      if (result.checked % 100 === 0) {
        console.log(
          `Progress: ${result.checked}/${politicians.length} checked, ${result.updated} updated`
        );
      }
    }

    result.success = true;
    console.log("\nPhoto sync completed:", result);
  } catch (error) {
    result.errors.push(String(error));
    console.error("Photo sync failed:", error);
  }

  return result;
}

/**
 * Get photo stats
 */
export async function getPhotoStats() {
  const [total, withPhoto, withoutPhoto] = await Promise.all([
    db.politician.count(),
    db.politician.count({ where: { photoUrl: { not: null } } }),
    db.politician.count({ where: { OR: [{ photoUrl: null }, { photoUrl: "" }] } }),
  ]);

  // Group by source
  const bySources = await db.politician.groupBy({
    by: ["photoSource"],
    _count: { photoSource: true },
    where: { photoSource: { not: null } },
  });

  return {
    total,
    withPhoto,
    withoutPhoto,
    bySource: bySources.reduce(
      (acc, s) => {
        acc[s.photoSource || "unknown"] = s._count.photoSource;
        return acc;
      },
      {} as Record<string, number>
    ),
  };
}
