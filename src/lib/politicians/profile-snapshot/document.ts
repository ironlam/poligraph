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

const VOLATILE_KEYS = new Set(["updatedAt", "createdAt"]);

const PARIS_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Paris",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** `{ $date: iso }` → the Europe/Paris calendar day `formatDate` prints, as `YYYY-MM-DD`. */
function parisDay(value: unknown): unknown {
  if (value !== null && typeof value === "object" && "$date" in value) {
    const iso = (value as { $date: unknown }).$date;
    if (typeof iso === "string") return PARIS_DAY.format(new Date(iso));
  }
  return value;
}

/**
 * What the content hash covers: the serialized document minus every `updatedAt` / `createdAt` at
 * any depth. Those are `@updatedAt` bookkeeping a sync rewrites without changing anything shown
 * (`deputes.ts` touches every mandate on every run), and hashing them would invalidate live pages
 * for nothing. Two timestamps are shown and stay in:
 * - `identity.updatedAt`, printed as a day by `PoliticianProfileBody` ("mis à jour le"), kept as
 *   that day only;
 * - `dossier.affairs[].createdAt`, the last fallback of the affair sort in `AffairsSection`, kept
 *   whole since a sort compares it whole (it never changes after insert anyway).
 * The stored `data` stays complete; only the hash ignores the rest.
 */
export function fingerprintProjection(value: unknown, path = ""): unknown {
  if (Array.isArray(value)) return value.map((item) => fingerprintProjection(item, `${path}[]`));
  if (value === null || typeof value !== "object") return value;
  if ("$date" in value) return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    const itemPath = path ? `${path}.${key}` : key;
    if (VOLATILE_KEYS.has(key)) {
      if (itemPath === "identity.updatedAt") out[key] = parisDay(item);
      else if (itemPath === "dossier.affairs[].createdAt") out[key] = item;
      continue;
    }
    out[key] = fingerprintProjection(item, itemPath);
  }
  return out;
}

/**
 * sha256 hex of the key-sorted JSON of `fingerprintProjection(data)`, so key order and volatile
 * timestamps never change the hash.
 */
export function hashSerializedDocument(data: Prisma.InputJsonValue): string {
  return createHash("sha256")
    .update(stableStringify(fingerprintProjection(data)))
    .digest("hex");
}
