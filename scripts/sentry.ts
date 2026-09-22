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

function option(name: string): string | undefined {
  const inline = argv.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? argv[index + 1] : undefined;
}

const USAGE = `Usage : npm run sentry -- <commande> [options]

  list                          issues non résolues, les plus bruyantes d'abord
    --env <environnement>       production, preview… (sans filtre, dev local et prod se mélangent)
    --period <14d>              fenêtre statistique
    --query "<requête>"         requête Sentry brute, défaut is:unresolved
    --limit <25>
    --json                      sortie brute

  show <SHORT-ID>               métadonnées, tags, stacktrace et breadcrumbs du dernier event
    --raw                       n'ampute pas les query strings (peut exposer des données saisies)

  resolve <SHORT-ID> --confirm  ferme en resolvedInNextRelease (rouvert seul si ça refire)
    --now                       ferme en resolved sec
  ignore <SHORT-ID> --confirm   met en sourdine un bruit assumé
  reopen <SHORT-ID> --confirm   remet en unresolved`;

async function runList(config: SentryConfig): Promise<void> {
  const issues = await listIssues(config, {
    query: option("query"),
    statsPeriod: option("period"),
    limit: option("limit") ? Number(option("limit")) : undefined,
    environment: option("env"),
  });

  if (flag("json")) {
    console.log(JSON.stringify(issues, null, 2));
    return;
  }

  const scope = option("env") ?? "tous environnements";
  console.log(
    `${issues.length} issues · ${option("query") ?? "is:unresolved"} · ${option("period") ?? "14d"} · ${scope}\n`
  );
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
  console.log(`culprit  ${issue.culprit ?? "—"}`);
  console.log(`volume   ${issue.count} events / ${issue.userCount} users`);
  console.log(`vu       ${issue.firstSeen.slice(0, 10)} → ${issue.lastSeen.slice(0, 10)}`);
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

  const crumbs = event.breadcrumbs?.values ?? [];
  if (crumbs.length > 0) {
    console.log(`\nBreadcrumbs (${raw ? "brut" : "query strings masquées"}, 15 derniers)`);
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
  const labels: Record<StatusAction, string> = {
    resolve: "resolvedInNextRelease",
    "resolve-now": "resolved",
    ignore: "ignored",
    reopen: "unresolved",
  };

  if (!flag("confirm")) {
    console.log(`À faire : passer ${shortId} en ${labels[action]}.`);
    console.log("Rien n'a été écrit. Relancez la même commande avec --confirm.");
    process.exitCode = 1;
    return;
  }

  const groupId = await lookupGroupId(config, shortId);
  await updateIssueStatus(config, groupId, action);
  console.log(`${shortId} (group ${groupId}) → ${labels[action]}`);

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
