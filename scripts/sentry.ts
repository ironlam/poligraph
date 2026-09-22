#!/usr/bin/env tsx
/**
 * npm run sentry -- <commande> [options]
 *
 * Read and triage Sentry issues without leaving the repository.
 *
 *   list    [--env production] [--period 14d] [--query "is:unresolved"] [--limit 25] [--json]
 *   show    <SHORT-ID> [--raw]
 *   resolve <SHORT-ID> [--now] --confirm
 *   ignore  <SHORT-ID> --confirm
 *   reopen  <SHORT-ID> --confirm
 *
 * The three write commands refuse to run without --confirm: they change what the whole team sees
 * in Sentry, and the same argv is easy to re-run by accident.
 */
import {
  readSentryConfig,
  assertShortId,
  listIssues,
  lookupGroupId,
  getIssue,
  getIssueTags,
  getLatestEvent,
  updateIssueStatus,
  formatIssueLine,
  formatFrames,
  formatBreadcrumb,
  breadcrumbsFrom,
  statusLabelFor,
  clampLimit,
  maskQueryString,
  type SentryConfig,
  type StatusAction,
} from "@/lib/api/sentry";

const argv = process.argv.slice(2);
const command = argv[0];
const positional = argv.slice(1).filter((arg) => !arg.startsWith("--"));

function flag(name: string): boolean {
  return argv.includes(`--${name}`);
}

/**
 * Returns the value of `--name value` or `--name=value`. A following token that is itself a flag is
 * not a value: without that check `--limit --json` sent `limit=NaN` to Sentry and swallowed the
 * `--json` the operator also typed.
 */
function option(name: string): string | undefined {
  const inline = argv.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3) || undefined;
  const index = argv.indexOf(`--${name}`);
  if (index < 0) return undefined;
  const next = argv[index + 1];
  return next && !next.startsWith("--") ? next : undefined;
}

function numericOption(name: string): number | undefined {
  const raw = option(name);
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`--${name} attend un nombre, reçu "${raw}".`);
  }
  return parsed;
}

const USAGE = `Usage : npm run sentry -- <commande> [options]

  list                          issues non résolues, les plus bruyantes d'abord (sort=freq)
    --env <environnement>       production, preview… (sans filtre, dev local et prod se mélangent)
    --period <14d>              fenêtre réelle : 24h, 7d, 30d, 90d… le compte suit la fenêtre
    --query "<requête>"         requête Sentry brute, défaut is:unresolved
    --limit <25>                plafonné à 100 par Sentry
    --json                      sortie brute

  show <SHORT-ID>               métadonnées, tags, stacktrace et breadcrumbs du dernier event
    --raw                       n'ampute pas les query strings (peut exposer des données saisies)

  resolve <SHORT-ID> --confirm  ferme en resolvedInNextRelease (rouvert seul si ça refire)
    --now                       ferme en resolved sec
  ignore <SHORT-ID> --confirm   met en sourdine un bruit assumé
  reopen <SHORT-ID> --confirm   remet en unresolved`;

async function runList(config: SentryConfig): Promise<void> {
  // Resolved once, so the header states what was asked for instead of guessing it a second time.
  const options = {
    query: option("query"),
    statsPeriod: option("period"),
    limit: clampLimit(numericOption("limit")),
    environment: option("env"),
  };
  const issues = await listIssues(config, options);

  if (flag("json")) {
    console.log(JSON.stringify(issues, null, 2));
    return;
  }

  const scope = options.environment ?? "tous environnements";
  console.log(
    `${issues.length} issues · ${options.query ?? "is:unresolved"} · ` +
      `${options.statsPeriod ?? "14d"} · ${scope} · les plus bruyantes d'abord`
  );
  if (issues.length === options.limit) {
    console.log(`(page pleine à ${options.limit} : resserrez --query ou --period pour tout voir)`);
  }
  console.log("");
  for (const issue of issues) console.log(`${formatIssueLine(issue)}\n`);
}

async function runShow(config: SentryConfig, shortId: string): Promise<void> {
  const raw = flag("raw");
  const groupId = await lookupGroupId(config, shortId);
  const [issue, tags, event] = await Promise.all([
    getIssue(config, groupId),
    getIssueTags(config, groupId),
    getLatestEvent(config, groupId),
  ]);

  console.log(`${issue.shortId} · ${issue.level} · ${issue.status}`);
  console.log(issue.title);
  console.log(`culprit  ${issue.culprit ?? "sans culprit"}`);
  console.log(`volume   ${issue.count} events / ${issue.userCount} users`);
  console.log(`vu       ${issue.firstSeen.slice(0, 10)} à ${issue.lastSeen.slice(0, 10)} (UTC)`);
  console.log(`lien     ${issue.permalink}`);

  const interesting = ["environment", "release", "url", "browser", "runtime", "server_name"];
  const shown = tags.filter((tag) => interesting.includes(tag.key));
  if (shown.length > 0) {
    console.log("\nTags dominants");
    for (const tag of shown) {
      const top = (tag.topValues ?? [])
        .slice(0, 3)
        .map((value) => `${raw ? value.value : maskQueryString(value.value)} (${value.count})`)
        .join(", ");
      console.log(`  ${tag.key.padEnd(12)} ${top}`);
    }
  }

  const frames = formatFrames(event.entries ?? []);
  if (frames.length > 0) {
    console.log("\nStack (application d'abord, 12 frames max)");
    for (const frame of frames.slice(0, 12)) console.log(`  ${frame}`);
  }

  const crumbs = breadcrumbsFrom(event.entries ?? []);
  if (crumbs.length > 0) {
    console.log(`\nBreadcrumbs en UTC (${raw ? "brut" : "query strings masquées"}, 15 derniers)`);
    for (const crumb of crumbs.slice(-15)) console.log(`  ${formatBreadcrumb(crumb, { raw })}`);
  }

  if (!raw) {
    console.log("\n(--raw lève le masquage, au prix d'exposer ce que des visiteurs ont saisi)");
  }
}

async function runWrite(
  config: SentryConfig,
  shortId: string,
  action: StatusAction
): Promise<void> {
  const label = statusLabelFor(action);

  if (!flag("confirm")) {
    console.log(`À faire : passer ${shortId} en ${label}.`);
    console.log("Rien n'a été écrit. Relancez la même commande avec --confirm.");
    process.exitCode = 1;
    return;
  }

  const groupId = await lookupGroupId(config, shortId);
  await updateIssueStatus(config, groupId, action);
  console.log(`${shortId} (group ${groupId}) → ${label}`);

  if (action === "resolve") {
    console.log(
      "Sentry la rouvrira seule si elle refire après la prochaine release. " +
        "La release ne bouge qu'au déploiement manuel depuis le dashboard Vercel."
    );
  }
}

async function main(): Promise<void> {
  if (!command || flag("help") || command === "help") {
    console.log(USAGE);
    return;
  }

  const config = readSentryConfig(process.env);

  if (command === "list") {
    await runList(config);
    return;
  }

  const shortId = positional[0];
  if (!shortId) {
    console.error(`La commande "${command}" attend un short id, par exemple POLIGRAPH-1N.`);
    process.exitCode = 1;
    return;
  }
  assertShortId(shortId);

  switch (command) {
    case "show":
      await runShow(config, shortId);
      return;
    case "resolve":
      await runWrite(config, shortId, flag("now") ? "resolve-now" : "resolve");
      return;
    case "ignore":
      await runWrite(config, shortId, "ignore");
      return;
    case "reopen":
      await runWrite(config, shortId, "reopen");
      return;
    default:
      console.error(`Commande inconnue : ${command}\n`);
      console.log(USAGE);
      process.exitCode = 1;
  }
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
