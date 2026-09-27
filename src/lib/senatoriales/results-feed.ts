/**
 * Reader for the Ministry of the Interior's results feed of the 2026 senatorial election.
 *
 * Pure: no database, no network. The import script fetches, this module reads.
 *
 * Shape verified on the live feed on 27 September 2026:
 * - `resultatsT1/INDEX1FE.xml` lists the 64 constituencies with `Pourvu` (NON / T1 / T2);
 * - `resultatsT{n}/{code}/R{n}{code}.xml` holds one constituency, and the round-2 file
 *   carries both rounds;
 * - majoritarian constituencies list `Candidat` directly under `Resultats`, proportional
 *   ones list `Liste` elements whose votes belong to the list, not to its candidates;
 * - `Elu` is `OUI`, `NON` or `QUALIFIE(E) AU T2`; decimals use a comma;
 * - a file not yet published answers HTTP 404 with an HTML maintenance page.
 */

import { XMLParser } from "fast-xml-parser";
import { normalizeForMatching } from "@/lib/affair-matching/normalize";
import type { OutgoingSenateSeat } from "@/types/stats-snapshots";

export const SN2026_FEED_BASE =
  "https://www.resultats-elections.interieur.gouv.fr/telechargements/SN2026";

/** Code the feed gives the constituency of French citizens abroad. */
export const FEHF_FEED_CODE = "ZZ";

export type FeedFilled = "NON" | "T1" | "T2";

export interface FeedConstituencyStatus {
  code: string;
  name: string;
  resultsIn: boolean;
  filled: FeedFilled;
  /** `DateDerMaj` + `HeureDerMaj`, read as Paris time; null while no result has come in. */
  updatedAt: Date | null;
}

export interface FeedElected {
  constituencyCode: string;
  constituencyName: string;
  civility: "M." | "Mme";
  firstName: string;
  lastName: string;
  nuanceCode: string;
  nuanceLabel: string;
  round: 1 | 2;
  /** Majoritarian only: the candidate's own votes in the round that elected them. */
  votes: number | null;
  pct: number | null;
  /** Proportional only. */
  listName: string | null;
  listPosition: number | null;
  listVotes: number | null;
  listPct: number | null;
}

export interface FeedConstituencyResult {
  code: string;
  name: string;
  seatsToFill: number;
  seatsFilled: number;
  elected: FeedElected[];
}

export class FeedNotXmlError extends Error {
  constructor(message = "La réponse du ministère n'est pas un fichier de résultats XML") {
    super(message);
    this.name = "FeedNotXmlError";
  }
}

const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  trimValues: true,
  isArray: (name) => ["Circonscription", "Tour", "Candidat", "Liste"].includes(name),
});

type Node = Record<string, unknown>;

function text(node: Node | undefined, key: string): string {
  const value = node?.[key];
  return value === undefined || value === null ? "" : String(value);
}

function int(value: string): number | null {
  if (value === "") return null;
  const n = Number.parseInt(value, 10);
  return Number.isNaN(n) ? null : n;
}

function decimal(value: string): number | null {
  if (value === "") return null;
  const n = Number.parseFloat(value.replace(",", "."));
  return Number.isNaN(n) ? null : n;
}

function parseXml(body: string): Node {
  if (!body.trimStart().startsWith("<?xml")) throw new FeedNotXmlError();
  const doc = parser.parse(body) as Node;
  const root = doc.Election as Node | undefined;
  if (!root) throw new FeedNotXmlError();
  return root;
}

/** Paris wall-clock time to an instant, whatever the daylight saving period. */
function parisToDate(date: string, time: string): Date {
  const [day, month, year] = date.split("/").map(Number);
  const [h, m, s] = time.split(":").map(Number);
  const asUtc = Date.UTC(year!, month! - 1, day, h, m, s);
  const parisParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(asUtc));
  const get = (type: string) => Number(parisParts.find((p) => p.type === type)?.value);
  const parisAsUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second")
  );
  return new Date(asUtc - (parisAsUtc - asUtc));
}

export function parseIndex(xml: string): FeedConstituencyStatus[] {
  const root = parseXml(xml);
  const geo = root.EnsembleGeo as Node;
  const list = ((geo.Circonscriptions as Node)?.Circonscription ?? []) as Node[];
  return list.map((c) => ({
    code: text(c, "CodCirElec"),
    name: text(c, "LibCirElec"),
    resultsIn: text(c, "ResultatsParvenus") === "OUI",
    filled: (["T1", "T2"].includes(text(c, "Pourvu")) ? text(c, "Pourvu") : "NON") as FeedFilled,
    updatedAt:
      text(c, "DateDerMaj") && text(c, "HeureDerMaj")
        ? parisToDate(text(c, "DateDerMaj"), text(c, "HeureDerMaj"))
        : null,
  }));
}

function civilityOf(node: Node): "M." | "Mme" {
  return text(node, "CivilitePsn") === "Mme" ? "Mme" : "M.";
}

export function parseResults(body: string): FeedConstituencyResult {
  const root = parseXml(body);
  const region = (root.EnsembleGeo as Node).Region as Node;
  const constituency = (region.Circonscription as Node[])[0]!;
  const code = text(constituency, "CodCirElec");
  const name = text(constituency, "LibCirElec");
  const tours = ((constituency.Tours as Node)?.Tour ?? []) as Node[];

  const elected: FeedElected[] = [];
  for (const tour of tours) {
    const round = int(text(tour, "NumTour")) === 2 ? 2 : 1;
    const resultats = tour.Resultats as Node | undefined;
    const base = { constituencyCode: code, constituencyName: name, round } as const;

    const lists = ((resultats?.Listes as Node)?.Liste ?? []) as Node[];
    for (const list of lists) {
      const candidates = ((list.Candidats as Node)?.Candidat ?? []) as Node[];
      for (const c of candidates) {
        if (text(c, "Elu") !== "OUI") continue;
        elected.push({
          ...base,
          civility: civilityOf(c),
          firstName: text(c, "PrenomPsn"),
          lastName: text(c, "NomPsn"),
          nuanceCode: text(list, "CodNuaListe"),
          nuanceLabel: text(list, "LibNuaListe"),
          votes: null,
          pct: null,
          listName: text(list, "NomListe"),
          listPosition: int(text(c, "NumOrdCand")),
          listVotes: int(text(list, "NbVoix")),
          listPct: decimal(text(list, "RapportExprimes")),
        });
      }
    }

    const candidates = ((resultats?.Candidats as Node)?.Candidat ?? []) as Node[];
    for (const c of candidates) {
      if (text(c, "Elu") !== "OUI") continue;
      elected.push({
        ...base,
        civility: civilityOf(c),
        firstName: text(c, "PrenomPsn"),
        lastName: text(c, "NomPsn"),
        nuanceCode: text(c, "CodNuaCand"),
        nuanceLabel: text(c, "LibNuaCand"),
        votes: int(text(c, "NbVoix")),
        pct: decimal(text(c, "RapportExprimes")),
        listName: null,
        listPosition: null,
        listVotes: null,
        listPct: null,
      });
    }
  }

  return {
    code,
    name,
    seatsToFill: int(text(constituency, "NbSap")) ?? 0,
    seatsFilled: int(text(constituency, "NbSiePourvus")) ?? 0,
    elected,
  };
}

export function resultsUrl(code: string, round: 1 | 2): string {
  return `${SN2026_FEED_BASE}/resultatsT${round}/${code}/R${round}${code}.xml`;
}

/**
 * The outgoing senator of the same constituency this elected person is, if exactly one.
 *
 * The comparison runs inside the closed set of the 178 seats captured before the ballot,
 * never against the whole base, and requires full equality after normalisation: a partial
 * match ("Christophe Frassa" for "Christophe-André Frassa") is not a match. Zero or several
 * equal seats both return null, and the caller treats the person as not linked.
 */
export function matchOutgoing(
  elected: Pick<FeedElected, "constituencyCode" | "firstName" | "lastName">,
  outgoing: OutgoingSenateSeat[]
): OutgoingSenateSeat | null {
  const target = normalizeForMatching(`${elected.firstName} ${elected.lastName}`);
  const inConstituency = (seat: OutgoingSenateSeat) =>
    elected.constituencyCode === FEHF_FEED_CODE
      ? seat.departmentCode === null
      : seat.departmentCode === elected.constituencyCode;
  const matches = outgoing.filter(
    (seat) => inConstituency(seat) && normalizeForMatching(seat.fullName) === target
  );
  return matches.length === 1 ? matches[0]! : null;
}
