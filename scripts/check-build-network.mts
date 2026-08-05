#!/usr/bin/env tsx
/**
 * Fails when `next build` reached a host that is not on the allow-list.
 *
 * Reads what scripts/build-net-probe.cjs recorded during the build. Deliberately does
 * NOT assert a number of calls: font and emoji fetches vary with what the pages happen
 * to render, and a frozen count would fail on unrelated content changes while proving
 * nothing extra. What matters is the SET of hosts.
 *
 * Usage: BUILD_NET_LOG=path npm run build:net-check
 */
import { readFileSync } from "node:fs";

/**
 * Hosts the build cannot do without today, each with the reason it is there. Adding a
 * line to this list is a deliberate act: it says the production build now depends on
 * one more third party being up.
 */
const ALLOWED_HOSTS = new Map([
  [
    "fonts.googleapis.com",
    "next/font/google, the stylesheets for Outfit and Atkinson Hyperlegible",
  ],
  ["fonts.gstatic.com", "next/font/google, the font files themselves"],
  ["cdn.jsdelivr.net", "next/og, the Twemoji SVGs used by the opengraph-image routes"],
]);

const logPath = process.env.BUILD_NET_LOG;
if (!logPath) {
  console.error("check-build-network: BUILD_NET_LOG is not set");
  process.exit(1);
}

let raw: string;
try {
  raw = readFileSync(logPath, "utf8");
} catch {
  console.error(`check-build-network: cannot read ${logPath}`);
  console.error("The probe writes it at load time, so an unreadable file means it never ran.");
  process.exit(1);
}

const lines = raw.split("\n").filter((line) => line.trim() !== "");

// Silence is not success. Without this, a probe that failed to load produces an empty
// log and the check would happily report "no unknown host".
const loaded = lines.filter((line) => line.startsWith("probe-loaded ")).length;
if (loaded === 0) {
  console.error("check-build-network: the probe never loaded, so nothing was observed.");
  console.error("Expected NODE_OPTIONS to contain --require ./scripts/build-net-probe.cjs");
  process.exit(1);
}

const hosts = new Map<string, number>();
for (const line of lines) {
  if (line.startsWith("probe-loaded ") || line.startsWith("note ")) continue;
  const url = line.slice(line.indexOf(" ") + 1);
  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    host = "unparseable";
  }
  hosts.set(host, (hosts.get(host) ?? 0) + 1);
}

console.log(`Sonde chargée dans ${loaded} processus, ${lines.length} lignes enregistrées.`);
// Le canal undici et l'enveloppe de fetch observent le même appel, donc un appel unique
// compte souvent double. Les nombres ci-dessous sont indicatifs, seul l'ensemble des
// hôtes est vérifié.
console.log("Hôtes atteints pendant le build (compteurs indicatifs, doublés par sonde) :");
for (const [host, count] of [...hosts].sort((a, b) => b[1] - a[1])) {
  const reason = ALLOWED_HOSTS.get(host);
  console.log(`  ${reason ? "autorisé" : "INCONNU "}  ${host}  (${count} appels)`);
}

const unknown = [...hosts.keys()].filter((host) => !ALLOWED_HOSTS.has(host));
if (unknown.length > 0) {
  console.error("");
  console.error("Le build a joint des hôtes qui ne sont pas sur la liste blanche :");
  for (const host of unknown) console.error(`  ${host}`);
  console.error("");
  console.error("Soit une dépendance vient d'ajouter un appel réseau au build, soit du code");
  console.error("applicatif en fait un pendant la collecte des pages. Dans les deux cas la");
  console.error("construction de production dépend désormais d'un tiers de plus : le décider,");
  console.error(
    "puis l'ajouter à ALLOWED_HOSTS avec sa raison, dans scripts/check-build-network.mts"
  );
  process.exit(1);
}

const missing = [...ALLOWED_HOSTS.keys()].filter((host) => !hosts.has(host));
if (missing.length > 0) {
  // Not a failure: a host can legitimately stop being called, and that is good news.
  // Reported so the list can be trimmed instead of rotting.
  console.log("");
  console.log("Hôtes autorisés qui n'ont pas été appelés (liste à élaguer ?) :");
  for (const host of missing) console.log(`  ${host}`);
}
