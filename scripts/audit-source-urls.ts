/**
 * Probe the external source endpoints used by sync services.
 *
 * This deliberately keeps a concrete, small URL inventory. Dynamic URLs
 * generated from database rows are represented by the stable listing or API
 * endpoint that supplies them.
 */

import { RSS_FEEDS } from "../src/lib/api/rss";

const USER_AGENT = "Poligraph source watchdog/1.0 (+https://poligraph.fr)";
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_PROBE_BYTES = 4096;
const MIN_RESPONSE_BYTES = 512;

export interface SourceUrl {
  url: string;
  service: string;
  kind: "csv" | "api" | "rss";
  requiresApiKey?: boolean;
}

export interface ProbeResult extends SourceUrl {
  status: number | null;
  method: "HEAD" | "GET" | "SKIP";
  bytes: number | null;
  redirected: boolean;
  location: string | null;
  error: string | null;
  skipped: boolean;
}

const DATA_GOUV_SOURCES: SourceUrl[] = [
  {
    url: "https://static.data.gouv.fr/resources/deputes-actifs-de-lassemblee-nationale-informations-et-statistiques/20260118-063755/deputes-active.csv",
    service: "sync:assemblee (députés)",
    kind: "csv",
  },
  {
    url: "https://www.data.gouv.fr/api/1/datasets/deputes-actifs-de-lassemblee-nationale-informations-et-statistiques/",
    service: "sync:assemblee (catalogue data.gouv)",
    kind: "api",
  },
  {
    url: "https://static.data.gouv.fr/resources/historique-des-gouvernements-de-la-veme-republique/20250313-105416/liste-membres-gouvernements-5eme-republique.csv",
    service: "sync:gouvernement",
    kind: "csv",
  },
  {
    url: "https://www.data.gouv.fr/api/1/datasets/repertoire-national-des-elus-1/",
    service: "sync:rne (maires et arrondissements, catalogue)",
    kind: "api",
  },
  {
    url: "https://www.data.gouv.fr/api/1/datasets/r/ea5d6bc3-37d0-4884-a437-155a90c3e05f",
    service: "sync:rne (communes enrichies)",
    kind: "csv",
  },
  {
    url: "https://static.data.gouv.fr/resources/elections-municipales-2026-listes-candidates-au-premier-tour/20260228-020703/municipales-2026-candidatures-france-entiere-tour-1-2026-02-28-02h24.csv",
    service: "sync:candidatures (défaut, #872)",
    kind: "csv",
  },
  {
    url: "https://www.data.gouv.fr/fr/datasets/r/4feeef01-24f7-4d5a-914f-8aa806f31ec2",
    service: "sync:resultats-csv (municipales 2026, tour 1)",
    kind: "csv",
  },
  {
    url: "https://www.data.gouv.fr/fr/datasets/r/6ff67a28-01bf-459e-beca-dd7aa8132dc1",
    service: "sync:resultats-csv (municipales 2026, tour 2)",
    kind: "csv",
  },
  {
    url: "https://www.data.gouv.fr/fr/datasets/r/5129e7cf-2999-4eaf-8dd7-3bcda37bd0a3",
    service: "sync:municipales-2020 (tour 1, grandes communes)",
    kind: "csv",
  },
  {
    url: "https://www.data.gouv.fr/fr/datasets/r/dacfcb29-7e58-4326-9d34-8ea7c5a9466c",
    service: "sync:municipales-2020 (tour 1, petites communes)",
    kind: "csv",
  },
  {
    url: "https://www.data.gouv.fr/fr/datasets/r/e7cae0aa-5e36-4370-b724-6f233014d0d6",
    service: "sync:municipales-2020 (tour 2, grandes communes)",
    kind: "csv",
  },
  {
    url: "https://www.data.gouv.fr/fr/datasets/r/7a5faf5f-7e3b-4de6-9f1d-a8e3ad176476",
    service: "sync:municipales-2020 (tour 2, petites communes)",
    kind: "csv",
  },
  {
    url: "https://www.data.gouv.fr/fr/datasets/r/f736f325-d42b-4ccf-a82c-e97122bc4861",
    service: "sync:municipales-2020 (élus)",
    kind: "csv",
  },
  {
    url: "https://www.data.gouv.fr/api/1/datasets/r/936f6d38-5969-46e5-8b9d-c7646d6390ec",
    service: "sync:municipales-2014 (tour 1)",
    kind: "csv",
  },
  {
    url: "https://www.data.gouv.fr/api/1/datasets/r/28ed59fd-d285-42f1-9eb6-d82ff2eaa4b3",
    service: "sync:municipales-2014 (tour 2)",
    kind: "csv",
  },
  {
    url: "https://data.senat.fr/data/dosleg/ppl.csv",
    service: "sync:legislation-senat (PPL)",
    kind: "csv",
  },
  {
    url: "https://data.senat.fr/data/dosleg/rapports.csv",
    service: "sync:legislation-senat (rapports)",
    kind: "csv",
  },
];

const STATIC_SOURCES: SourceUrl[] = [
  {
    url: "https://www.senat.fr/api-senat/senateurs.json",
    service: "sync:senat (sénateurs)",
    kind: "api",
  },
  {
    url: "https://archive.nossenateurs.fr/senateurs/json",
    service: "sync:senat (historique des sénateurs)",
    kind: "api",
  },
  {
    url: "https://www.senat.fr/scrutin-public/scr2024.html",
    service: "sync:scrutins-senat (liste de session)",
    kind: "api",
  },
  {
    url: "https://www.senat.fr/scrutin-public/2024/scr2024-1.html",
    service: "sync:scrutins-senat (scrutin HTML)",
    kind: "api",
  },
  {
    url: "https://www.senat.fr/scrutin-public/2024/scr2024-1.json",
    service: "sync:scrutins-senat (scrutin JSON)",
    kind: "api",
  },
  {
    url: "https://www.hatvp.fr/livraison/opendata/liste.csv",
    service: "sync:hatvp (liste open-data)",
    kind: "csv",
  },
  {
    url: "https://factchecktools.googleapis.com/v1alpha1/claims:search",
    service: "sync:factchecks (Google Fact Check Tools API)",
    kind: "api",
    requiresApiKey: true,
  },
];

export const SOURCE_URLS: SourceUrl[] = [
  ...DATA_GOUV_SOURCES,
  ...STATIC_SOURCES,
  ...RSS_FEEDS.map((feed) => ({
    url: feed.url,
    service: `sync:press (RSS ${feed.id})`,
    kind: "rss" as const,
  })),
];

function getHeaders(source: SourceUrl): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
    Accept: source.kind === "rss" ? "application/rss+xml, application/xml" : "*/*",
  };

  if (source.requiresApiKey) {
    const key = process.env.GOOGLE_FACTCHECK_API_KEY;
    if (key) headers["X-Poligraph-Factcheck-Key"] = key;
  }
  return headers;
}

function requestUrl(source: SourceUrl): string {
  if (!source.requiresApiKey) return source.url;
  const url = new URL(source.url);
  url.searchParams.set("query", "Macron");
  url.searchParams.set("languageCode", "fr");
  url.searchParams.set("pageSize", "1");
  url.searchParams.set("key", process.env.GOOGLE_FACTCHECK_API_KEY ?? "");
  return url.toString();
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal, redirect: "manual" });
  } finally {
    clearTimeout(timer);
  }
}

async function readProbeBytes(response: Response): Promise<number> {
  if (!response.body) return 0;
  const reader = response.body.getReader();
  let bytes = 0;
  try {
    while (bytes < MAX_PROBE_BYTES) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return bytes;
}

export async function probeSource(source: SourceUrl): Promise<ProbeResult> {
  if (source.requiresApiKey && !process.env.GOOGLE_FACTCHECK_API_KEY) {
    return {
      ...source,
      status: null,
      method: "SKIP",
      bytes: null,
      redirected: false,
      location: null,
      error: "GOOGLE_FACTCHECK_API_KEY absent",
      skipped: true,
    };
  }

  const url = requestUrl(source);
  try {
    let response = await fetchWithTimeout(url, { method: "HEAD", headers: getHeaders(source) });
    let method: ProbeResult["method"] = "HEAD";

    const headBytes = response.headers.get("content-length");
    const headNeedsBodyProbe = response.status >= 200 && response.status < 300 && !headBytes;
    if (response.status === 405 || response.status === 501 || headNeedsBodyProbe) {
      response = await fetchWithTimeout(url, {
        method: "GET",
        headers: { ...getHeaders(source), Range: `bytes=0-${MAX_PROBE_BYTES - 1}` },
      });
      method = "GET";
    }

    const redirected = response.status >= 300 && response.status < 400;
    const bytesHeader = response.headers.get("content-length");
    const bytes = bytesHeader
      ? Number(bytesHeader)
      : method === "GET"
        ? await readProbeBytes(response)
        : null;

    return {
      ...source,
      status: response.status,
      method,
      bytes: Number.isFinite(bytes) ? bytes : null,
      redirected,
      location: response.headers.get("location"),
      error: null,
      skipped: false,
    };
  } catch (error) {
    return {
      ...source,
      status: null,
      method: "GET",
      bytes: null,
      redirected: false,
      location: null,
      error: error instanceof Error ? error.message : String(error),
      skipped: false,
    };
  }
}

export function isFailure(result: ProbeResult): boolean {
  if (result.skipped) return false;
  return (
    result.status === null ||
    result.status < 200 ||
    result.status >= 300 ||
    result.redirected ||
    (result.bytes !== null && result.bytes < MIN_RESPONSE_BYTES)
  );
}

function formatResult(result: ProbeResult): string {
  if (result.skipped) return `SKIP ${result.service}: ${result.error}`;
  const status = result.status === null ? "ERR" : String(result.status);
  const size = result.bytes === null ? "taille inconnue" : `${result.bytes} octets`;
  const redirect = result.redirected ? ` redirection vers ${result.location ?? "?"}` : "";
  const error = result.error ? ` ${result.error}` : "";
  const verdict = isFailure(result) ? "FAIL" : "OK";
  return `${verdict} ${status} ${size}${redirect} ${result.service}: ${result.url}${error}`;
}

async function main(): Promise<void> {
  const serviceFilter = process.argv.find((arg) => arg.startsWith("--service="))?.slice(10);
  const sources = serviceFilter
    ? SOURCE_URLS.filter((source) => source.service.includes(serviceFilter))
    : SOURCE_URLS;

  if (sources.length === 0) {
    throw new Error(`Aucune source ne correspond à --service=${serviceFilter}`);
  }

  const results: ProbeResult[] = [];
  for (const source of sources) {
    const result = await probeSource(source);
    results.push(result);
    console.log(formatResult(result));
  }

  const failures = results.filter(isFailure);
  console.log(`\n${results.length} source(s) sondée(s), ${failures.length} échec(s).`);
  if (failures.length > 0) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
