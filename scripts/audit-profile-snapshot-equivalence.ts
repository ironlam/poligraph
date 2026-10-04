#!/usr/bin/env tsx
/**
 * npm run audit:profile-snapshots -- --sample 300
 *
 * READ-ONLY equivalence audit of the precomputed politician profile documents.
 * For a stratified sample of published politicians, rebuilds the document from the
 * source tables and compares it with the stored one twice: by content hash, and by deep
 * equality of the deserialized document, which is what proves nothing was lost on the
 * way through JSON (the hash compares two serializations, so a loss there is invisible to
 * it). On a mismatch it prints the first differing JSON path (never the values: affair
 * data is sensitive). A document that differs only by the bookkeeping timestamps the hash
 * ignores on purpose (`updatedAt`, `lastConfirmedAt`, `…CheckedAt`…) is reported apart and does
 * not fail the audit.
 *
 * Exit codes: 0 = every sampled document matches (timestamp-only drifts allowed); 1 = at
 * least one mismatch, missing or outdated document; 2 = bad usage or no DATABASE_URL.
 *
 * Only SELECTs. It must never call writeProfileSnapshot, refreshPoliticianProfile or
 * any revalidate: an architecture test greps this file for write calls.
 */

import { Prisma } from "@/generated/prisma";
import {
  deserializeProfileDocument,
  hashSerializedDocument,
  isHashIgnoredPath,
  serializeProfileDocument,
  type PoliticianProfileDocument,
} from "@/lib/politicians/profile-snapshot/document";

const DEFAULT_SAMPLE = 300;

export function parseArgs(argv: string[]): { sample: number } {
  let sample = DEFAULT_SAMPLE;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    let raw: string | undefined;
    if (arg === "--sample") raw = argv[++i];
    else if (arg.startsWith("--sample=")) raw = arg.slice("--sample=".length);
    else throw new Error(`argument inconnu : ${arg}`);
    if (raw === undefined || !/^\d+$/.test(raw) || Number(raw) < 1) {
      throw new Error("--sample attend un entier >= 1");
    }
    sample = Number(raw);
  }
  return { sample };
}

/** Splits `total` across `parts` strata as evenly as possible (earlier strata get the remainder). */
export function splitEvenly(total: number, parts: number): number[] {
  const base = Math.floor(total / parts);
  const rest = total % parts;
  return Array.from({ length: parts }, (_, i) => base + (i < rest ? 1 : 0));
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/** Every JSON path where two documents differ. Values are never returned. */
export function diffPaths(a: unknown, b: unknown, path = ""): string[] {
  const here = path || "(racine)";
  if (Array.isArray(a) && Array.isArray(b)) {
    const out: string[] = [];
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const sub = `${path}[${i}]`;
      if (i >= a.length || i >= b.length) out.push(sub);
      else out.push(...diffPaths(a[i], b[i], sub));
    }
    return out;
  }
  if (a instanceof Date && b instanceof Date) {
    return Object.is(a.getTime(), b.getTime()) ? [] : [here];
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const out: string[] = [];
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    for (const key of keys) {
      // An undefined property and a missing one carry the same information.
      out.push(...diffPaths(a[key], b[key], path ? `${path}.${key}` : key));
    }
    return out;
  }
  // Anything else that is an object (a Map, a class instance, a Date against a string) does not
  // survive JSON as itself: report it rather than compare its enumerable keys.
  if ((a !== null && typeof a === "object") || (b !== null && typeof b === "object")) {
    return [here];
  }
  return Object.is(a, b) ? [] : [here];
}

/** First JSON path where two documents differ, or null when equal. Values are never returned. */
export function firstDiffPath(a: unknown, b: unknown): string | null {
  return diffPaths(a, b)[0] ?? null;
}

/** Prisma.Decimal → number at any depth: the document stores Decimals as numbers (Ruling 6). */
function decimalsAsNumbers(value: unknown): unknown {
  if (Prisma.Decimal.isDecimal(value)) return (value as Prisma.Decimal).toNumber();
  if (Array.isArray(value)) return value.map(decimalsAsNumbers);
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, decimalsAsNumbers(v)]));
  }
  return value;
}

export type SnapshotComparison =
  | { kind: "match" }
  | { kind: "timestamps"; path: string }
  | { kind: "mismatch"; path: string };

/**
 * Compares a freshly built document with a stored row. A hash mismatch or any deep difference
 * outside the bookkeeping timestamps the hash ignores (`isHashIgnoredPath`) is a mismatch; a deep
 * difference on those alone is reported as `timestamps`.
 */
export function compareSnapshot(
  built: PoliticianProfileDocument,
  stored: { data: Prisma.JsonValue; contentHash: string }
): SnapshotComparison {
  const serialized = serializeProfileDocument(built);
  const deep = diffPaths(
    decimalsAsNumbers(built),
    decimalsAsNumbers(deserializeProfileDocument(stored.data))
  );
  const shown = deep.filter((path) => !isHashIgnoredPath(path));
  const hashesAgree =
    hashSerializedDocument(serialized) === stored.contentHash &&
    // The hash guards the stored hash column; the data column is what readers serve.
    hashSerializedDocument(stored.data as Prisma.InputJsonValue) === stored.contentHash;
  if (!hashesAgree) {
    return { kind: "mismatch", path: shown[0] ?? deep[0] ?? "(contentHash)" };
  }
  if (shown.length > 0) return { kind: "mismatch", path: shown[0]! };
  if (deep.length > 0) return { kind: "timestamps", path: deep[0]! };
  return { kind: "match" };
}

async function main(): Promise<number> {
  if (!process.env.DATABASE_URL) {
    console.error("[audit:profile-snapshots] DATABASE_URL n'est pas définie, abandon");
    return 2;
  }
  let sample: number;
  try {
    ({ sample } = parseArgs(process.argv.slice(2)));
  } catch (e) {
    console.error(`[audit:profile-snapshots] ${(e as Error).message}`);
    return 2;
  }

  const { db } = await import("@/lib/db");
  const { buildPoliticianProfileDocument } =
    await import("@/lib/politicians/profile-snapshot/build");
  const { PROFILE_SNAPSHOT_VERSION } = await import("@/lib/politicians/profile-snapshot/document");

  try {
    const mandateTypes = ["DEPUTE", "SENATEUR", "DEPUTE_EUROPEEN", "MAIRE"] as const;
    const strata = [
      ...mandateTypes.map(
        (type) => Prisma.sql`
          SELECT p.id FROM "Politician" p
          WHERE p."publicationStatus" = 'PUBLISHED'
            AND EXISTS (SELECT 1 FROM "Mandate" m WHERE m."politicianId" = p.id
                        AND m."isCurrent" = true AND m.type = ${type}::"MandateType")`
      ),
      Prisma.sql`
        SELECT p.id FROM "Politician" p
        WHERE p."publicationStatus" = 'PUBLISHED'
          AND EXISTS (SELECT 1 FROM "Affair" a WHERE a."politicianId" = p.id
                      AND a."publicationStatus" = 'PUBLISHED')`,
      Prisma.sql`
        SELECT p.id FROM "Politician" p
        WHERE p."publicationStatus" = 'PUBLISHED'
          AND NOT EXISTS (SELECT 1 FROM "Mandate" m WHERE m."politicianId" = p.id)`,
    ];
    const quotas = splitEvenly(sample, strata.length);

    const ids: string[] = [];
    const seen = new Set<string>();
    for (const [i, stratum] of strata.entries()) {
      // Over-fetch so that politicians already drawn by another stratum do not shrink the sample.
      const rows = await db.$queryRaw<{ id: string }[]>(
        Prisma.sql`${stratum} ORDER BY random() LIMIT ${quotas[i]! + ids.length}`
      );
      let taken = 0;
      for (const { id } of rows) {
        if (taken >= quotas[i]!) break;
        if (seen.has(id)) continue;
        seen.add(id);
        ids.push(id);
        taken++;
      }
    }

    let matched = 0;
    let unbuildable = 0;
    const missing: string[] = [];
    const outdated: string[] = [];
    const mismatches: { id: string; path: string }[] = [];
    const timestampOnly: { id: string; path: string }[] = [];

    for (const id of ids) {
      const built = await buildPoliticianProfileDocument({ id });
      if (!built) {
        unbuildable++;
        continue;
      }
      const stored = await db.politicianProfileSnapshot.findUnique({
        where: { politicianId: id },
      });
      if (!stored) {
        missing.push(id);
        continue;
      }
      if (stored.version !== PROFILE_SNAPSHOT_VERSION) {
        outdated.push(id);
        continue;
      }
      const result = compareSnapshot(built, stored);
      if (result.kind === "match") matched++;
      else if (result.kind === "timestamps") timestampOnly.push({ id, path: result.path });
      else mismatches.push({ id, path: result.path });
    }

    for (const m of mismatches) console.error(`[ECART] politicien=${m.id} chemin=${m.path}`);
    for (const id of missing) console.error(`[ABSENT] politicien=${id} aucun document stocké`);
    for (const id of outdated) console.error(`[PERIME] politicien=${id} version obsolète`);
    for (const t of timestampOnly) {
      console.warn(`[HORODATAGE] politicien=${t.id} chemin=${t.path} (horodatage seul)`);
    }

    console.log(
      `[audit:profile-snapshots] échantillon=${ids.length} identiques=${matched} ` +
        `écarts=${mismatches.length} horodatage-seul=${timestampOnly.length} ` +
        `absents=${missing.length} périmés=${outdated.length} non-construits=${unbuildable}`
    );
    return mismatches.length + missing.length + outdated.length > 0 ? 1 : 0;
  } finally {
    await db.$disconnect();
  }
}

if (require.main === module) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      // The message only: a raw error can carry query parameters, hence affair data.
      console.error(
        `[audit:profile-snapshots] ${error instanceof Error ? error.message : String(error)}`
      );
      process.exitCode = 1;
    });
}
