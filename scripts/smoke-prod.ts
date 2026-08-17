/**
 * Post-deploy production smoke test. Fetches a set of critical public routes
 * (static list pages + DB-derived published detail pages) against the live site
 * and reports any 5xx / unexpected status. Exits non-zero if ANY route returns
 * a 5xx, so it can gate a deploy or be run from the /smoke command.
 *
 * Base URL: $SMOKE_BASE_URL (e.g. a Vercel preview URL) else SITE_URL (poligraph.fr).
 * Usage: npx dotenv -e .env -- npx tsx scripts/smoke-prod.ts [--base https://...]
 */
import { db } from "@/lib/db";
import { SITE_URL, USER_AGENT } from "@/config/site";

const argBase = (() => {
  const i = process.argv.indexOf("--base");
  return i >= 0 ? process.argv[i + 1] : undefined;
})();
const BASE = (argBase || process.env.SMOKE_BASE_URL || SITE_URL).replace(/\/$/, "");
const TIMEOUT_MS = 20_000;

interface Probe {
  path: string;
  label: string;
}

async function staticRoutes(): Promise<Probe[]> {
  // List/hub pages — these exercise the data layer heavily and are the highest-value 500 detectors.
  return [
    { path: "/", label: "home" },
    { path: "/parlement", label: "parlement hub" },
    { path: "/parlement/votes", label: "votes list" },
    { path: "/politiques", label: "politiciens list" },
    { path: "/affaires", label: "affaires list" },
    { path: "/partis", label: "partis list" },
    { path: "/factchecks", label: "factchecks list" },
    { path: "/elections", label: "elections hub" },
    { path: "/recherche", label: "recherche" },
    { path: "/statistiques", label: "statistiques" },
    { path: "/docs/api", label: "API docs" },
    { path: "/methodologie", label: "méthodologie" },
  ];
}

/** One published detail page per dynamic route, discovered from the DB so we never
 *  hardcode a slug that could disappear. Skips a route if no row is found. */
async function dynamicRoutes(): Promise<Probe[]> {
  const probes: Probe[] = [];
  const politician = await db.politician.findFirst({
    where: { publicationStatus: "PUBLISHED" },
    select: { slug: true },
    orderBy: { updatedAt: "desc" },
  });
  if (politician)
    probes.push({ path: `/politiques/${politician.slug}`, label: "politician profile" });

  const scrutin = await db.scrutin.findFirst({
    where: { slug: { not: null } },
    select: { slug: true },
    orderBy: { votingDate: "desc" },
  });
  if (scrutin?.slug)
    probes.push({ path: `/parlement/votes/${scrutin.slug}`, label: "vote detail" });

  const affair = await db.affair.findFirst({
    where: { publicationStatus: "PUBLISHED" },
    select: { slug: true },
    orderBy: { updatedAt: "desc" },
  });
  if (affair) probes.push({ path: `/affaires/${affair.slug}`, label: "affaire detail" });

  const party = await db.party.findFirst({
    where: { slug: { not: null } },
    select: { slug: true },
  });
  if (party?.slug) probes.push({ path: `/partis/${party.slug}`, label: "parti detail" });

  const factcheck = await db.factCheck.findFirst({
    where: { publicationStatus: "PUBLISHED", slug: { not: null } },
    select: { slug: true },
  });
  if (factcheck?.slug)
    probes.push({ path: `/factchecks/${factcheck.slug}`, label: "factcheck detail" });

  return probes;
}

async function probe(
  p: Probe
): Promise<{ p: Probe; status: number | "ERR"; ms: number; detail?: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const t0 = Date.now();
  try {
    const res = await fetch(`${BASE}${p.path}`, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "User-Agent": USER_AGENT },
    });
    return { p, status: res.status, ms: Date.now() - t0 };
  } catch (e) {
    return { p, status: "ERR", ms: Date.now() - t0, detail: (e as Error).message };
  } finally {
    clearTimeout(timer);
  }
}

(async () => {
  const probes = [...(await staticRoutes()), ...(await dynamicRoutes())];
  await db.$disconnect();

  console.log(`Smoke ${BASE} — ${probes.length} routes\n`);
  const results = await Promise.all(probes.map(probe));

  const fails: typeof results = []; // 5xx or network error
  const warns: typeof results = []; // unexpected 4xx
  for (const r of results) {
    const ok = typeof r.status === "number" && r.status >= 200 && r.status < 400;
    const is5xx = r.status === "ERR" || (typeof r.status === "number" && r.status >= 500);
    const mark = ok ? "✓" : is5xx ? "✗" : "⚠";
    console.log(
      `  ${mark} ${String(r.status).padEnd(4)} ${r.ms}ms  ${r.p.path}  (${r.p.label})${r.detail ? " — " + r.detail : ""}`
    );
    if (is5xx) fails.push(r);
    else if (!ok) warns.push(r);
  }

  console.log(
    `\n${fails.length === 0 ? "OK" : "FAIL"} — ${fails.length} 5xx/error, ${warns.length} unexpected 4xx, ${results.length - fails.length - warns.length}/${results.length} healthy`
  );
  if (warns.length) console.log("  (4xx on a public route is unexpected — check redirects/auth)");
  process.exit(fails.length > 0 ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
