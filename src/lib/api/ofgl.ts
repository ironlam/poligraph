import { describeError, HTTPClient, HTTPError } from "@/lib/api/http-client";

/**
 * Client of the OFGL open data API (data.ofgl.fr, Opendatasoft Explore v2.1, no key), used by the
 * accounts import of Territoires v2 (lot C). The host is fixed here: callers name a dataset and a
 * query, never a URL.
 *
 * Two reads, measured on 2026-11-21:
 * - `records` pages by 100 and stops at offset + limit = 10 000 (API rule). Enough for one
 *   department or region, not for the communes.
 * - `exports/json` returns every matching row in one response: 174 660 rows (25 MB, 26 s) for the
 *   five aggregates of all communes over one exercise. The importer reads one exercise at a time.
 *
 * Every failure is an `OfglError` whose message says what to check: the API refused connections
 * from a cloud sandbox on 2026-11-14 and answered on 2026-11-21.
 */

export const OFGL_ORIGIN = "https://data.ofgl.fr";
const DATASETS_PATH = "/api/explore/v2.1/catalog/datasets";

/** API ceilings (InvalidRESTParameterError beyond them). */
export const OFGL_PAGE_SIZE = 100;
export const OFGL_RECORDS_WINDOW = 10_000;

const DATASET_ID = /^[a-z0-9][a-z0-9-]{0,99}$/;

export interface OfglQuery {
  /** ODSQL filter. A date field compares with year(exer)=2024, never with a string. */
  where?: string;
  select?: string;
  orderBy?: string;
}

export type OfglRow = Record<string, unknown>;

export type OfglErrorKind = "RESEAU" | "REQUETE" | "LIMITE" | "REPONSE";

export class OfglError extends Error {
  constructor(
    public kind: OfglErrorKind,
    message: string,
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = "OfglError";
  }
}

export interface OfglClientOptions {
  /** Base delay of the exponential backoff between retries; tests pass 0. */
  retryDelayMs?: number;
}

function datasetPath(datasetId: string): string {
  if (!DATASET_ID.test(datasetId)) {
    throw new OfglError("REQUETE", `Identifiant de jeu OFGL invalide : ${datasetId}`);
  }
  return `${DATASETS_PATH}/${datasetId}`;
}

function queryString(query: OfglQuery, extra: Record<string, string> = {}): string {
  const p = new URLSearchParams();
  if (query.where) p.set("where", query.where);
  if (query.select) p.set("select", query.select);
  if (query.orderBy) p.set("order_by", query.orderBy);
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : "";
}

function toOfglError(error: unknown, what: string): OfglError {
  if (error instanceof OfglError) return error;
  if (error instanceof HTTPError) {
    if (error.status >= 400 && error.status < 500 && error.status !== 429) {
      return new OfglError(
        "REQUETE",
        `${what} : requête refusée par data.ofgl.fr (HTTP ${error.status}). Vérifier le jeu, le select et le filtre where (une date se filtre avec year(exer)=AAAA).`,
        { cause: error }
      );
    }
    return new OfglError(
      "RESEAU",
      `${what} : data.ofgl.fr répond HTTP ${error.status} après plusieurs essais. Réessayer plus tard.`,
      { cause: error }
    );
  }
  return new OfglError(
    "RESEAU",
    `${what} : impossible de joindre data.ofgl.fr (${describeError(error)}). Vérifier la connexion de la machine qui lance l'import : l'API a déjà refusé des connexions venues de certains environnements.`,
    { cause: error }
  );
}

export function createOfglClient(options: OfglClientOptions = {}) {
  const http = new HTTPClient({
    baseUrl: OFGL_ORIGIN,
    timeout: 60_000,
    retries: 3,
    retryDelay: options.retryDelayMs ?? 2_000,
    rateLimitMs: 200,
    sourceName: "OFGL",
  });

  /** One page of `records`. */
  async function page(
    datasetId: string,
    query: OfglQuery,
    offset: number
  ): Promise<{ totalCount: number; results: OfglRow[] }> {
    if (offset + OFGL_PAGE_SIZE > OFGL_RECORDS_WINDOW) {
      throw new OfglError(
        "LIMITE",
        `Page OFGL hors de la fenêtre de ${OFGL_RECORDS_WINDOW} lignes (offset ${offset}) : passer par exportRows.`
      );
    }
    const path = `${datasetPath(datasetId)}/records${queryString(query, {
      limit: String(OFGL_PAGE_SIZE),
      offset: String(offset),
    })}`;
    let data: unknown;
    try {
      data = (await http.get<unknown>(path)).data;
    } catch (error) {
      throw toOfglError(error, `Lecture de ${datasetId}`);
    }
    const body = data as { total_count?: unknown; results?: unknown };
    if (typeof body?.total_count !== "number" || !Array.isArray(body.results)) {
      throw new OfglError(
        "REPONSE",
        `Réponse OFGL inattendue pour ${datasetId} : ni total_count ni results.`
      );
    }
    return { totalCount: body.total_count, results: body.results as OfglRow[] };
  }

  /** Every row of a query that fits in the records window; refuses a larger one before paging. */
  async function records(datasetId: string, query: OfglQuery): Promise<OfglRow[]> {
    const first = await page(datasetId, query, 0);
    if (first.totalCount > OFGL_RECORDS_WINDOW) {
      throw new OfglError(
        "LIMITE",
        `${first.totalCount} lignes pour ${datasetId}, au-delà des ${OFGL_RECORDS_WINDOW} que la pagination atteint : passer par exportRows.`
      );
    }
    const rows = [...first.results];
    for (let offset = OFGL_PAGE_SIZE; offset < first.totalCount; offset += OFGL_PAGE_SIZE) {
      rows.push(...(await page(datasetId, query, offset)).results);
    }
    if (rows.length !== first.totalCount) {
      throw new OfglError(
        "REPONSE",
        `${rows.length} lignes lues pour ${datasetId} sur ${first.totalCount} annoncées : le jeu a peut-être changé pendant la lecture.`
      );
    }
    return rows;
  }

  /** Every row of a query in one response, without the records window. */
  async function exportRows(datasetId: string, query: OfglQuery): Promise<OfglRow[]> {
    const path = `${datasetPath(datasetId)}/exports/json${queryString(query)}`;
    let data: unknown;
    try {
      data = (await http.get<unknown>(path, { timeout: 300_000 })).data;
    } catch (error) {
      throw toOfglError(error, `Export de ${datasetId}`);
    }
    if (!Array.isArray(data)) {
      throw new OfglError(
        "REPONSE",
        `Export OFGL inattendu pour ${datasetId} : la réponse n'est pas une liste.`
      );
    }
    return data as OfglRow[];
  }

  return { page, records, exportRows };
}
