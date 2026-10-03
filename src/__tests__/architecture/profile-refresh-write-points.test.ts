import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every write that changes what `/politiques/[slug]` displays must ask for the profile document
 * to be recomputed. The cache invalidation calls are the inventory of those writes: a file that
 * purges a politician, affair, party, fact-check, dossier, mandate or vote entity, or the `votes`
 * tag, wrote something a profile may show. A reconcile request counts as a recompute: it is how
 * the syncs that write without naming a politician catch up.
 */

const INVALIDATES_PROFILE_DATA = new RegExp(
  [
    /invalidateEntity\(\s*["'](politician|affair|party|factcheck|dossier|mandate|vote)["']/.source,
    /invalidateAffectedPoliticians\(/.source,
    /(updateTags|revalidateTags)\(\s*\[[^\]]*["']votes["']/.source,
  ].join("|")
);
const REQUESTS_REFRESH =
  /requestProfileRefresh\(|refreshProfilesForModeration\(|requestProfileReconcile\(|PROFILE_RECONCILE_EVENT/;

// Files that invalidate one of those tags but write nothing the profile document holds. The
// document holds: identity, current party, party history, mandates, declarations, external ids,
// published affairs (sources, party at the time, events, links), public fact-check mentions,
// dossier authorships and vote stats.
const WRITE_POINT_EXEMPTIONS: Record<string, string> = {
  "src/app/api/admin/affaires/route.ts":
    "POST creates a DRAFT affair (no publicationStatus written); the profile lists published ones only.",
  "src/app/api/admin/press/rejections/recover/route.ts":
    "Creates a DRAFT affair from a press rejection; the profile lists published ones only.",
  "src/app/api/admin/affaires/[id]/decisions/route.ts":
    "Affair ↔ court decision links: the profile document carries no court decision.",
  "src/app/api/admin/court-decisions/[id]/enrich/route.ts":
    "Writes a court decision's official fields: the profile document carries no court decision.",
  "src/app/api/admin/presse/[id]/route.ts":
    "Deletes a press article: the profile document carries no press data.",
  "src/app/api/admin/presse/mentions/[id]/route.ts":
    "Deletes a press mention: the profile document carries no press data.",
  "src/app/api/admin/platforms/route.ts": "Party programme: not shown on a politician profile.",
  "src/app/api/admin/platforms/[id]/route.ts":
    "Party programme: not shown on a politician profile.",
  "src/app/api/admin/proposals/route.ts": "Party proposal: not shown on a politician profile.",
  "src/app/api/admin/proposals/[id]/route.ts": "Party proposal: not shown on a politician profile.",
  "src/app/admin/dossiers/[id]/alias-actions.ts":
    "Dossier aliases: the profile document reads a dossier's slug, titles, number, status and filing date, never an alias.",
};

// Files under the affair and fact-check admin routes that mention publicationStatus without
// changing it.
const PUBLICATION_RULE_EXEMPTIONS: Record<string, string> = {
  "src/app/api/admin/affaires/route.ts":
    "GET filters on publicationStatus; POST creates a DRAFT affair.",
  "src/app/api/admin/affaires/search/route.ts": "Read-only search that selects publicationStatus.",
  "src/app/api/admin/affaires/propositions/route.ts":
    "Read-only proposal list that reads the target affair's publicationStatus.",
};

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function isTest(path: string): boolean {
  return path.includes("/__tests__/") || /\.test\.tsx?$/.test(path);
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", "generated", ".local"].includes(entry.name)) continue;
      out.push(...sourceFiles(path));
    } else if (/\.tsx?$/.test(entry.name) && !isTest(path)) {
      out.push(path);
    }
  }
  return out;
}

function filesCalling(pattern: RegExp): string[] {
  return [...sourceFiles("src"), ...sourceFiles("scripts")]
    .filter((file) => file !== "src/lib/cache.ts")
    .filter((file) => pattern.test(withoutComments(read(file))));
}

function filesMatching(pattern: RegExp, dir: RegExp): string[] {
  return sourceFiles("src/app/api/admin")
    .filter((file) => dir.test(file))
    .filter((file) => pattern.test(withoutComments(read(file))));
}

describe("points d'écriture des fiches politicien", () => {
  const writers = filesCalling(INVALIDATES_PROFILE_DATA);
  const publicationWriters = filesMatching(
    /publicationStatus/,
    /^src\/app\/api\/admin\/(affaires|factchecks)\//
  );

  it("trouve les points d'écriture à vérifier", () => {
    // Guards the scan itself: an empty inventory would make every check below pass.
    expect(writers.length).toBeGreaterThan(20);
    expect(publicationWriters.length).toBeGreaterThan(3);
    // One per invalidation shape the scan was widened to: a regex that stops matching one of
    // them must fail here rather than silently drop its writers from the rule below.
    for (const file of [
      "src/app/admin/policy-titles/actions.ts", // updateTags(["votes"])
      "src/inngest/vote-cache.ts", // revalidateTags(["votes"], "max")
      "src/app/api/admin/votes/revalidate/route.ts",
      "src/app/api/admin/dossiers/[id]/route.ts", // invalidateEntity("dossier")
      "src/app/api/admin/mandates/route.ts", // invalidateEntity("mandate")
    ]) {
      expect(writers, file).toContain(file);
    }
  });

  it("chaque écriture qui touche une fiche demande son recalcul", () => {
    for (const file of writers) {
      if (file in WRITE_POINT_EXEMPTIONS) continue;
      expect(withoutComments(read(file)), file).toMatch(REQUESTS_REFRESH);
    }
  });

  it("chaque changement de publication passe par le recalcul synchrone", () => {
    for (const file of publicationWriters) {
      if (file in PUBLICATION_RULE_EXEMPTIONS) continue;
      expect(withoutComments(read(file)), file).toMatch(/refreshProfilesForModeration\(/);
    }
  });

  it("les server actions qui changent une publication recalculent aussi dans la requête", () => {
    for (const file of [
      "src/app/admin/factchecks/actions.ts",
      "src/app/admin/affaires/[id]/page.tsx",
      "src/app/admin/affaires/[id]/edit/page.tsx",
    ]) {
      expect(withoutComments(read(file)), file).toMatch(/refreshProfilesForModeration\(/);
    }
  });

  it("aucune exemption ne survit à son fichier ni ne masque un recalcul existant", () => {
    for (const file of Object.keys(WRITE_POINT_EXEMPTIONS)) {
      expect(existsSync(file), file).toBe(true);
      expect(writers, file).toContain(file);
      expect(withoutComments(read(file)), file).not.toMatch(REQUESTS_REFRESH);
    }
    for (const file of Object.keys(PUBLICATION_RULE_EXEMPTIONS)) {
      expect(publicationWriters, file).toContain(file);
    }
  });

  it("le rattrapage suit le sync quotidien et la revalidation par cron", () => {
    const daily = withoutComments(read("src/inngest/functions/sync-daily.ts"));
    expect(daily).toMatch(
      /step\.sendEvent\(\s*["']profile-reconcile["'],\s*\{\s*name:\s*PROFILE_RECONCILE_EVENT,\s*data:\s*\{\s*reason:\s*["']sync-daily["']\s*\}/
    );
    expect(daily.indexOf('step.sendEvent("profile-reconcile"')).toBeGreaterThan(
      daily.indexOf("for (const s of DAILY_STEPS)")
    );

    const cron = withoutComments(read("src/app/api/cron/revalidate/route.ts"));
    expect(cron).toMatch(/requestProfileReconcile\(/);
    expect(cron).toContain('from "@/lib/politicians/profile-snapshot/events"');
    expect(cron).not.toContain("profile-snapshot/request");
  });

  it("le module d'envoi des events ne touche pas la base", () => {
    // The cron route imports it: reaching Prisma from here would put Affair and FactCheck in
    // that route's import graph (mcp-public-contract-surfaces.test.ts).
    const events = withoutComments(read("src/lib/politicians/profile-snapshot/events.ts"));
    const imports = [...events.matchAll(/(?:from|import\()\s*["']([^"']+)["']/g)].map((m) => m[1]);
    expect(imports).toEqual(["@/inngest/client"]);
    expect(events).not.toMatch(/@\/lib\/db|@\/lib\/data|from "\.\/request"/);
  });
});
