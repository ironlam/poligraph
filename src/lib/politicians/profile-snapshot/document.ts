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

/** sha256 hex of the key-sorted JSON, so key order never changes the hash. */
export function hashSerializedDocument(data: Prisma.InputJsonValue): string {
  return createHash("sha256").update(stableStringify(data)).digest("hex");
}
