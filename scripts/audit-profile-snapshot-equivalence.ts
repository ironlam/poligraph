#!/usr/bin/env tsx
/**
 * npm run audit:profile-snapshots -- --sample 300
 *
 * READ-ONLY equivalence audit of the precomputed politician profile documents.
 * For a stratified sample of published politicians, rebuilds the document from the
 * source tables and compares its content hash with the stored one. On a mismatch it
 * prints the first differing JSON path (never the values: affair data is sensitive).
 *
 * Exit codes: 0 = every sampled document matches; 1 = at least one mismatch, missing
 * or outdated document; 2 = bad usage or no DATABASE_URL.
 *
 * Only SELECTs. It must never call writeProfileSnapshot, refreshPoliticianProfile or
 * any revalidate: an architecture test greps this file for write calls.
 */

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

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** First JSON path where two serialized trees differ, or null when equal. Values are never returned. */
export function firstDiffPath(a: unknown, b: unknown, path = ""): string | null {
  if (Array.isArray(a) && Array.isArray(b)) {
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i++) {
      const sub = `${path}[${i}]`;
      if (i >= a.length || i >= b.length) return sub;
      const d = firstDiffPath(a[i], b[i], sub);
      if (d) return d;
    }
    return null;
  }
  if (isObject(a) && isObject(b)) {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    for (const key of keys) {
      const sub = path ? `${path}.${key}` : key;
      if (!(key in a) || !(key in b)) return sub;
      const d = firstDiffPath(a[key], b[key], sub);
      if (d) return d;
    }
    return null;
  }
  return Object.is(a, b) ? null : path || "(racine)";
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

  const { Prisma } = await import("@/generated/prisma");
  const { db } = await import("@/lib/db");
  const { buildPoliticianProfileDocument } =
    await import("@/lib/politicians/profile-snapshot/build");
  const { serializeProfileDocument, hashSerializedDocument, PROFILE_SNAPSHOT_VERSION } =
    await import("@/lib/politicians/profile-snapshot/document");

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
      const serialized = serializeProfileDocument(built);
      if (hashSerializedDocument(serialized) === stored.contentHash) {
        // The hash guards the stored hash column; the data column is what readers serve.
        const dataHash = hashSerializedDocument(stored.data as typeof serialized);
        if (dataHash === stored.contentHash) {
          matched++;
          continue;
        }
        mismatches.push({ id, path: firstDiffPath(serialized, stored.data) ?? "(data)" });
        continue;
      }
      mismatches.push({ id, path: firstDiffPath(serialized, stored.data) ?? "(contentHash)" });
    }

    for (const m of mismatches) console.error(`[ECART] politicien=${m.id} chemin=${m.path}`);
    for (const id of missing) console.error(`[ABSENT] politicien=${id} aucun document stocké`);
    for (const id of outdated) console.error(`[PERIME] politicien=${id} version obsolète`);

    console.log(
      `[audit:profile-snapshots] échantillon=${ids.length} identiques=${matched} ` +
        `écarts=${mismatches.length} absents=${missing.length} périmés=${outdated.length} ` +
        `non-construits=${unbuildable}`
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
      console.error(error);
      process.exitCode = 1;
    });
}
