import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
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

// Files under src/services, src/inngest and scripts that write publicationStatus on Affair,
// Politician or FactCheck without asking for a profile recompute.
const SYNC_PUBLICATION_EXEMPTIONS: Record<string, string> = {
  "src/services/sync/rne-arrondissements.ts":
    "Creates DRAFT politicians only: a new non-public row has no profile document to recompute.",
  "src/services/sync/wikidata-politicians.ts":
    "Creates DRAFT politicians only: a new non-public row has no profile document to recompute.",
  "src/services/affairs/create-draft.ts":
    "Creates DRAFT affairs only (status hard-coded): the profile lists published affairs.",
};

const PROFILE_MODELS = new Set(["politician", "affair", "factCheck"]);
const WRITE_METHODS = new Set(["create", "createMany", "update", "updateMany", "upsert"]);
const WRITE_PAYLOAD_KEYS = new Set(["data", "create", "update"]);
const FILTER_KEYS = new Set([
  "where",
  "select",
  "include",
  "omit",
  "orderBy",
  "cursor",
  "distinct",
  "some",
  "none",
  "every",
  "is",
  "isNot",
]);
const RAW_STATUS_UPDATE = /UPDATE\s+"(Politician|Affair|FactCheck)"[^;`]*?"publicationStatus"\s*=/;
const REQUESTS_TARGETED_REFRESH = /requestProfileRefresh\(|refreshProfilesForModeration\(/g;

/**
 * Offsets of every `publicationStatus` written to Affair, Politician or FactCheck: a property of a
 * `data` / `create` / `update` payload whose call is `<client>.<model>.<write method>(`, a local
 * `const data = {...}` in a file that writes one of those models, or a raw `UPDATE`. A property
 * under `where` or `select` is a filter, not a write.
 */
function publicationStatusWrites(path: string, source = read(path)): number[] {
  const code = withoutComments(source);
  const file = ts.createSourceFile(path, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const writesProfileModel =
    /\.(politician|affair|factCheck)\.(create|createMany|update|updateMany|upsert)\(/.test(code);

  const isWrite = (node: ts.Node): boolean => {
    let inPayload = false;
    for (let current = node.parent; current; current = current.parent) {
      if (ts.isPropertyAssignment(current)) {
        const key = current.name.getText(file);
        if (FILTER_KEYS.has(key)) return false;
        if (WRITE_PAYLOAD_KEYS.has(key)) inPayload = true;
      }
      if (ts.isVariableDeclaration(current) && current.name.getText(file) === "data") {
        return writesProfileModel;
      }
      if (
        ts.isCallExpression(current) &&
        ts.isPropertyAccessExpression(current.expression) &&
        WRITE_METHODS.has(current.expression.name.text) &&
        ts.isPropertyAccessExpression(current.expression.expression)
      ) {
        return inPayload && PROFILE_MODELS.has(current.expression.expression.name.text);
      }
    }
    return false;
  };

  const offsets: number[] = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node)) &&
      node.name.getText(file) === "publicationStatus" &&
      isWrite(node)
    ) {
      offsets.push(node.getStart(file));
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  const raw = RAW_STATUS_UPDATE.exec(code);
  if (raw) offsets.push(raw.index);
  return offsets;
}

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

describe("changements de publication hors des routes d'administration", () => {
  const files = [
    ...sourceFiles("src/services"),
    ...sourceFiles("src/inngest"),
    ...sourceFiles("scripts"),
  ];
  const statusWriters = new Map(
    files
      .map((file) => [file, publicationStatusWrites(file)] as const)
      .filter(([, offsets]) => offsets.length > 0)
  );

  it("trouve les écritures de statut à vérifier", () => {
    // Guards the scan itself: one file per shape it must recognise.
    for (const file of [
      "src/services/sync/publication-status.ts", // politician.updateMany data
      "src/services/sync/factchecks.ts", // factCheck.create data + upsert create
      "src/services/sync/rne.ts", // politician.create data + politician.update data
      "src/services/admin/affair-politician-workbench.ts", // tx.affair.updateMany data
      "src/services/affairs/create-draft.ts", // const data = {...} then affair.create({ data })
      "scripts/promote-maires.ts",
      "scripts/remediate-unverified-published-affairs.ts",
      "scripts/backfill-factcheck-sources.ts",
    ]) {
      expect([...statusWriters.keys()], file).toContain(file);
    }
    // Filters are not writes: these only read publicationStatus.
    for (const file of ["src/services/search.ts", "src/services/sync/opensanctions.ts"]) {
      expect([...statusWriters.keys()], file).not.toContain(file);
    }
  });

  it("distingue une écriture de statut d'un filtre ou d'un autre modèle", () => {
    const writes = (code: string) => publicationStatusWrites("fixture.ts", code).length;
    expect(
      writes(`db.affair.updateMany({ where: { publicationStatus: "DRAFT" }, data: { title } })`)
    ).toBe(0);
    expect(
      writes(`db.measure.update({ where: { id }, data: { publicationStatus: "DRAFT" } })`)
    ).toBe(0);
    // A filter nested inside a write payload is still a filter.
    expect(
      writes(
        `db.politician.update({ where: { id }, data: { affairs: { updateMany: { where: { publicationStatus: "DRAFT" }, data: { title } } } } })`
      )
    ).toBe(0);
    expect(writes(`db.politician.findMany({ where: { publicationStatus: "PUBLISHED" } })`)).toBe(0);
    expect(writes(`tx.politician.update({ where: { id }, data: { publicationStatus } })`)).toBe(1);
    expect(
      writes(`db.factCheck.upsert({ where: { id }, update: {}, create: { publicationStatus: s } })`)
    ).toBe(1);
    expect(writes(`const data = { publicationStatus: "DRAFT" }; db.affair.create({ data });`)).toBe(
      1
    );
    expect(
      writes('db.$executeRaw`UPDATE "Affair" SET "publicationStatus" = ${s} WHERE id = ${id}`')
    ).toBe(1);
  });

  it("chaque écriture de statut est suivie d'une demande de recalcul des fiches", () => {
    for (const [file, offsets] of statusWriters) {
      if (file in SYNC_PUBLICATION_EXEMPTIONS) continue;
      const code = withoutComments(read(file));
      const requests = [...code.matchAll(REQUESTS_TARGETED_REFRESH)].map((m) => m.index);
      expect(requests.length, file).toBeGreaterThan(0);
      // Textual order: the request comes after the last write, not before it.
      expect(Math.max(...requests), file).toBeGreaterThan(Math.max(...offsets));
    }
  });

  it("aucune exemption de statut ne survit à son écriture ni ne masque une demande", () => {
    for (const file of Object.keys(SYNC_PUBLICATION_EXEMPTIONS)) {
      expect(existsSync(file), file).toBe(true);
      expect([...statusWriters.keys()], file).toContain(file);
      expect(withoutComments(read(file)), file).not.toMatch(
        new RegExp(REQUESTS_TARGETED_REFRESH.source)
      );
    }
  });
});

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
