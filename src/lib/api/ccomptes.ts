import { XMLParser } from "fast-xml-parser";
import { USER_AGENT } from "@/config/site";
import { getJuridictionFinanciere } from "@/config/juridictions-financieres";

/**
 * Client of the per-chamber RSS feeds of ccomptes.fr (Territoires v2, lot C: notices of the
 * regional audit chambers' reports).
 *
 * The host is fixed and callers pass a chamber id from a closed list, never a URL (SSRF). A
 * redirect is refused rather than followed, the body is read under a byte ceiling and a timeout,
 * and a document carrying a DOCTYPE is refused before parsing, so no entity it declares is ever
 * expanded.
 *
 * Only facts leave this module: title, address, publication date. The description is the
 * chamber's own text and is not read. Items that are not a publication (the chambers' news,
 * under `/fr/actualites/`) are dropped and counted.
 */

export const CCOMPTES_ORIGIN = "https://www.ccomptes.fr";
/** A feed of ten items weighs 8 to 22 kB (2026-11-22). */
export const CCOMPTES_MAX_BYTES = 1_000_000;
export const CCOMPTES_TIMEOUT_MS = 20_000;

const PUBLICATION_PATH = /^\/fr\/publications\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TITLE_MAX = 500;

export interface PublicationCcomptes {
  titre: string;
  /** Canonical https address of the report page on www.ccomptes.fr. */
  url: string;
  publieLe: Date;
}

export interface FluxCcomptes {
  publications: PublicationCcomptes[];
  /** Items left out: news, address outside the publications, missing title or date. */
  ignores: number;
}

export class CcomptesError extends Error {
  constructor(
    public kind: "REQUETE" | "RESEAU" | "LIMITE" | "REPONSE",
    message: string,
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = "CcomptesError";
  }
}

/** The address of a report page, normalised, or null when it is anything else. */
export function publicationUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (
    url.origin !== CCOMPTES_ORIGIN ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !PUBLICATION_PATH.test(url.pathname)
  ) {
    return null;
  }
  return url.href;
}

const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  trimValues: true,
  htmlEntities: false,
  isArray: (name) => name === "item",
});

function texte(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

/** Reads a feed already downloaded. Pure. */
export function parseFluxCcomptes(xml: string): FluxCcomptes {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
    throw new CcomptesError("REPONSE", "Flux ccomptes.fr refusé : il déclare une DTD.");
  }
  let doc: unknown;
  try {
    doc = parser.parse(xml);
  } catch (error) {
    throw new CcomptesError("REPONSE", "Flux ccomptes.fr illisible : XML invalide.", {
      cause: error,
    });
  }
  const channel = (doc as { rss?: { channel?: { item?: unknown } } })?.rss?.channel;
  if (!channel || typeof channel !== "object") {
    throw new CcomptesError(
      "REPONSE",
      "Réponse ccomptes.fr inattendue : ce n'est pas un flux RSS."
    );
  }
  const items = Array.isArray(channel.item) ? (channel.item as Record<string, unknown>[]) : [];

  const publications: PublicationCcomptes[] = [];
  let ignores = 0;
  for (const item of items) {
    const titre = texte(item.title);
    const url = publicationUrl(texte(item.link));
    const publieLe = new Date(texte(item.pubDate));
    if (!titre || titre.length > TITLE_MAX || !url || Number.isNaN(publieLe.getTime())) {
      ignores++;
      continue;
    }
    publications.push({ titre, url, publieLe });
  }
  return { publications, ignores };
}

/** The body as text, aborted as soon as it passes `max` bytes. */
async function readBounded(response: Response, max: number): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw new CcomptesError("LIMITE", `Flux ccomptes.fr au-delà de ${max} octets.`);
    }
    chunks.push(value);
  }
  return new TextDecoder("utf-8").decode(Buffer.concat(chunks));
}

/** Downloads and reads the feed of one chamber of the closed list. */
export async function fetchFluxJuridiction(
  juridictionId: number,
  options: { maxBytes?: number } = {}
): Promise<FluxCcomptes> {
  if (!getJuridictionFinanciere(juridictionId)) {
    throw new CcomptesError("REQUETE", `Juridiction ${juridictionId} absente du registre.`);
  }
  const url = `${CCOMPTES_ORIGIN}/fr/rss/juridiction/${juridictionId}`;
  let xml: string;
  try {
    const response = await fetch(url, {
      redirect: "error",
      signal: AbortSignal.timeout(CCOMPTES_TIMEOUT_MS),
      headers: { "User-Agent": USER_AGENT, Accept: "application/rss+xml, application/xml" },
    });
    if (!response.ok) {
      throw new CcomptesError("RESEAU", `Flux ${juridictionId} : HTTP ${response.status}.`);
    }
    if (!/xml/i.test(response.headers.get("content-type") ?? "")) {
      throw new CcomptesError("REPONSE", `Flux ${juridictionId} : la réponse n'est pas du XML.`);
    }
    xml = await readBounded(response, options.maxBytes ?? CCOMPTES_MAX_BYTES);
  } catch (error) {
    if (error instanceof CcomptesError) throw error;
    // Network failure, refused redirect, timeout, or body cut short.
    throw new CcomptesError("RESEAU", `Flux ${juridictionId} injoignable : ${String(error)}`, {
      cause: error,
    });
  }
  return parseFluxCcomptes(xml);
}
