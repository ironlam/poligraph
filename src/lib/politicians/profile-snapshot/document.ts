import { createHash } from "node:crypto";
import { Prisma } from "@/generated/prisma";
import type {
  PoliticianDossier,
  PoliticianIdentity,
  ProfileVoteStats,
} from "@/lib/data/politician-profile-reads";

/** Bump when the shape of the document changes; readers ignore rows with another version. */
export const PROFILE_SNAPSHOT_VERSION = 1;

export type PoliticianProfileDocument = {
  identity: PoliticianIdentity;
  dossier: PoliticianDossier;
  voteStats: ProfileVoteStats | null;
  /** Derived from the current parliamentary mandate, as `page.tsx` does. */
  mandateType: "DEPUTE" | "SENATEUR" | null;
};

type Json = Prisma.InputJsonValue;

function fail(path: string): never {
  throw new Error(`profile-snapshot: valeur non sérialisable à ${path}`);
}

function encode(value: unknown, path: string): Json | null {
  if (value === null) return null;
  switch (typeof value) {
    case "string":
    case "boolean":
      return value;
    case "number":
      return Number.isFinite(value) ? value : fail(path);
    case "bigint":
    case "function":
    case "symbol":
      return fail(path);
    case "undefined":
      return fail(path);
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? fail(path) : { $date: value.toISOString() };
  }
  if (Prisma.Decimal.isDecimal(value)) return (value as Prisma.Decimal).toNumber();
  if (Array.isArray(value)) {
    // JSON turns an undefined array slot into null; do the same.
    return value.map((item, i) => (item === undefined ? null : encode(item, `${path}[${i}]`)));
  }
  const out: Record<string, Json | null> = {};
  for (const [key, item] of Object.entries(value as object)) {
    if (item === undefined) continue;
    out[key] = encode(item, path ? `${path}.${key}` : key);
  }
  return out;
}

export function serializeProfileDocument(doc: PoliticianProfileDocument): Prisma.InputJsonValue {
  return encode(doc, "") as Prisma.InputJsonValue;
}

function decode(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decode);
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length === 1 && entries[0]![0] === "$date" && typeof entries[0]![1] === "string") {
      return new Date(entries[0]![1]);
    }
    return Object.fromEntries(entries.map(([k, v]) => [k, decode(v)]));
  }
  return value;
}

export function deserializeProfileDocument(data: Prisma.JsonValue): PoliticianProfileDocument {
  return decode(data) as PoliticianProfileDocument;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const body = Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`);
    return `{${body.join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Bookkeeping keys dropped from the hash wherever they appear. */
const VOLATILE_KEYS = new Set(["updatedAt", "createdAt", "lastConfirmedAt"]);
/** `photoCheckedAt`, `careerCheckedAt`, `webSearchCheckedAt` and any later `…CheckedAt`. */
const CHECKED_AT = /CheckedAt$/;
/** Affair bookkeeping set by enrichment, SLAPP qualification and admin review, never displayed. */
const AFFAIR_VOLATILE_KEYS = new Set(["descriptionEnrichedAt", "slappQualifiedAt", "verifiedAt"]);

/**
 * What the content hash covers: the serialized document minus the timestamps a sync or a job
 * rewrites without changing anything the profile shows. Hashing them would invalidate live pages
 * for nothing: `deputes.ts` and `senateurs.ts` touch every parliamentarian and mandate on every
 * run (`updatedAt`), every mandate sync confirms its rows (`lastConfirmedAt`), and the photo,
 * career and web-search jobs stamp the politician (`…CheckedAt`). Dropped at any depth.
 *
 * `identity.updatedAt` is printed ("mis à jour le") but dropped too, by owner decision: it moves
 * daily for every parliamentarian, and a cached page showing an older date until a real change is
 * accepted as cosmetic. Kept: `dossier.affairs[].createdAt`, the last fallback of the affair sort
 * in `AffairsSection`, and `biographyGeneratedAt`, printed under the biography.
 * The stored `data` stays complete; only the hash ignores the rest.
 */
export function isHashIgnoredPath(path: string): boolean {
  // Array indices do not matter: `dossier.affairs[3].createdAt` is `dossier.affairs[].createdAt`.
  const normalized = path.replace(/\[\d*\]/g, "[]");
  if (normalized === "dossier.affairs[].createdAt") return false;
  const key = normalized.slice(normalized.lastIndexOf(".") + 1);
  if (VOLATILE_KEYS.has(key) || CHECKED_AT.test(key)) return true;
  return normalized === `dossier.affairs[].${key}` && AFFAIR_VOLATILE_KEYS.has(key);
}

/** The serialized document with every `isHashIgnoredPath` key removed. */
export function fingerprintProjection(value: unknown, path = ""): unknown {
  if (Array.isArray(value)) return value.map((item) => fingerprintProjection(item, `${path}[]`));
  if (value === null || typeof value !== "object") return value;
  if ("$date" in value) return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    const itemPath = path ? `${path}.${key}` : key;
    if (isHashIgnoredPath(itemPath)) continue;
    out[key] = fingerprintProjection(item, itemPath);
  }
  return out;
}

/**
 * sha256 hex of the key-sorted JSON of `fingerprintProjection(data)`, so key order and volatile
 * timestamps never change the hash.
 */
/**
 * Stored in place of a content hash when the invalidation that followed a write failed. No real
 * hash equals it, so the next build reports "updated" and invalidates again.
 */
export const PENDING_INVALIDATION_HASH = "pending-invalidation";

export function hashSerializedDocument(data: Prisma.InputJsonValue): string {
  return createHash("sha256")
    .update(stableStringify(fingerprintProjection(data)))
    .digest("hex");
}
