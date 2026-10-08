/**
 * Garde de publication d'une étape de procédure. Fonctions pures : chaque règle violée donne un
 * message, lisible tel quel dans l'admin.
 */
import type {
  AffairEventType,
  DatePrecision,
  EventOccurrence,
  EventOutcome,
  EventSourceKind,
} from "@/generated/prisma";
import { LEGACY_EVENT_TYPES } from "@/config/labels";
import { matchesHost } from "@/lib/url-host";
import { isAcceptedPressUrl, isOfficialSourceUrl } from "./sources";
import { isDateConsistent, parisDay } from "./dates";

type DecisionType = "JUGEMENT" | "ARRET_APPEL" | "ARRET_CASSATION";

export const DECISION_EVENT_TYPES: ReadonlySet<AffairEventType> = new Set<DecisionType>([
  "JUGEMENT",
  "ARRET_APPEL",
  "ARRET_CASSATION",
]);

export const ALLOWED_OUTCOMES: Record<DecisionType, readonly EventOutcome[]> = {
  JUGEMENT: ["CONDAMNATION", "RELAXE", "RELAXE_PARTIELLE", "ACQUITTEMENT", "AUTRE"],
  ARRET_APPEL: ["CONDAMNATION", "RELAXE", "RELAXE_PARTIELLE", "ACQUITTEMENT", "AUTRE"],
  ARRET_CASSATION: ["CASSATION_RENVOI", "CASSATION_SANS_RENVOI", "REJET_POURVOI", "AUTRE"],
};

/** Encyclopédies, hébergeurs de blogs et réseaux sociaux : jamais une source d'étape. */
export const BLOCKED_SOURCE_HOSTS: readonly string[] = [
  "wikipedia.org",
  "wikimedia.org",
  "wikidata.org",
  "over-blog.com",
  "blogspot.com",
  "wordpress.com",
  "medium.com",
  "substack.com",
  "x.com",
  "twitter.com",
  "facebook.com",
  "instagram.com",
  "tiktok.com",
  "youtube.com",
  "youtu.be",
  "linkedin.com",
  "bsky.app",
  "threads.net",
  "t.co",
  "reddit.com",
  "t.me",
  "wikiwand.com",
];

export const EVENT_TITLE_MAX = 120;

export type EventGuardInput = {
  type: AffairEventType;
  occurrence: EventOccurrence;
  date: Date;
  datePrecision: DatePrecision;
  dateEnd?: Date | null;
  outcome?: EventOutcome | null;
  title: string;
  court?: string | null;
  description?: string | null;
  sourceUrl?: string | null;
  sourceTitle?: string | null;
  sourceKind?: EventSourceKind | null;
  corroborationUrl?: string | null;
};

function isDecision(type: AffairEventType): type is DecisionType {
  return DECISION_EVENT_TYPES.has(type);
}

/** Règles de structure, valables dès le brouillon. */
export function checkEventShape(e: EventGuardInput): string[] {
  const errors: string[] = [];

  if (!isDateConsistent(e.date, e.datePrecision)) {
    errors.push("La date ne correspond pas à sa précision (jour, mois ou année).");
  }
  if (e.occurrence === "SCHEDULED" && e.datePrecision === "YEAR") {
    errors.push("Une étape annoncée se date au jour ou au mois, pas à l'année.");
  }

  if (e.dateEnd) {
    if (e.type !== "FAITS") {
      errors.push("Une date de fin n'est permise que pour les faits.");
    } else if (e.dateEnd.getTime() <= e.date.getTime()) {
      errors.push("La date de fin doit être postérieure à la date de début.");
    } else if (!isDateConsistent(e.dateEnd, e.datePrecision)) {
      errors.push("La date de fin ne correspond pas à la précision de la date.");
    }
  }

  if (e.outcome) {
    if (!isDecision(e.type)) {
      errors.push("Une issue n'est permise que sur un jugement ou un arrêt.");
    } else if (e.occurrence === "SCHEDULED") {
      errors.push("Une décision annoncée ne porte pas encore d'issue.");
    } else if (!ALLOWED_OUTCOMES[e.type].includes(e.outcome)) {
      errors.push("Cette issue n'est pas possible pour ce type de décision.");
    }
  }

  return errors;
}

/** Suffixes publics à deux niveaux : le média se lit alors sur les trois derniers libellés. */
const TWO_LEVEL_SUFFIXES: ReadonlySet<string> = new Set([
  "gouv.fr",
  "asso.fr",
  "com.fr",
  "co.uk",
  "org.uk",
  "ac.uk",
  "gov.uk",
  "com.au",
  "co.jp",
]);

/** Domaine du média : `abonnes.lemonde.fr` et `www.lemonde.fr` donnent `lemonde.fr`. */
function mediaOf(url: string): string {
  const labels = new URL(url).hostname.replace(/\.$/, "").toLowerCase().split(".");
  const lastTwo = labels.slice(-2).join(".");
  return TWO_LEVEL_SUFFIXES.has(lastTwo) ? labels.slice(-3).join(".") : lastTwo;
}

/**
 * Clé de comparaison d'une source : hôte en minuscules et chemin sans `/` final. Le protocole,
 * la requête et l'ancre ne distinguent pas deux sources.
 */
function sourceKey(url: string): string {
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    return `${parsed.host.toLowerCase()}${parsed.pathname.replace(/\/+$/, "")}`;
  } catch {
    return trimmed;
  }
}

export function isSameSourceUrl(a: string, b: string): boolean {
  return sourceKey(a) === sourceKey(b);
}

const DASH_FIELDS = [
  ["title", "Le titre"],
  ["court", "La juridiction"],
  ["description", "La description"],
  ["sourceTitle", "Le titre de la source"],
] as const;

/** Message si l'URL n'est pas une source acceptable, sinon `null`. */
function checkSourceUrl(url: string, label: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return `${label} n'est pas une adresse valide.`;
  }
  if (parsed.protocol !== "https:") return `${label} doit être en https.`;
  const blocked = BLOCKED_SOURCE_HOSTS.find((host) => matchesHost(url, host));
  if (blocked) return `${label} pointe vers ${blocked}, qui n'est pas une source acceptée.`;
  return null;
}

/**
 * Forme, plus tout ce qu'exige une publication. `today` sert à refuser une étape tenue datée
 * après le jour courant à Paris (début de sa période).
 */
export function checkEventPublishable(e: EventGuardInput, today: Date = new Date()): string[] {
  const errors = checkEventShape(e);

  if (e.occurrence === "HELD" && e.date.getTime() > parisDay(today).getTime()) {
    errors.push(
      "Une étape tenue ne peut pas être datée dans le futur : la marquer comme annoncée."
    );
  }

  if (LEGACY_EVENT_TYPES.includes(e.type)) {
    errors.push(
      "Ce type ancien n'est plus publiable : saisir un jugement ou un arrêt avec son issue."
    );
  }

  if (isDecision(e.type) && e.occurrence === "HELD" && !e.outcome) {
    errors.push("Une décision rendue doit porter son issue.");
  }

  if (!e.sourceUrl) {
    errors.push("La source est obligatoire.");
  } else {
    const sourceError = checkSourceUrl(e.sourceUrl, "La source");
    if (sourceError) errors.push(sourceError);
  }

  if (!e.sourceKind) {
    errors.push("La nature de la source (officielle ou presse) est obligatoire.");
  } else if (e.type === "REVELATION" && e.sourceKind !== "PRESS") {
    errors.push("Une révélation se source par un article de presse.");
  } else if (e.sourceUrl && !checkSourceUrl(e.sourceUrl, "La source")) {
    // The declared kind must match the address: an article marked « officielle » would
    // otherwise escape the two-source rule for a conviction.
    if (e.sourceKind === "OFFICIAL" && !isOfficialSourceUrl(e.sourceUrl)) {
      errors.push(
        "Cette adresse n'est pas celle d'une juridiction, d'une administration ou d'une assemblée : choisir « Presse »."
      );
    }
    if (e.sourceKind === "PRESS" && !isAcceptedPressUrl(e.sourceUrl)) {
      errors.push("Ce média ne figure pas dans la liste des sources de presse admises.");
    }
  }

  const title = e.title.trim();
  if (title.length === 0) {
    errors.push("Le titre est obligatoire.");
  } else if (title.length > EVENT_TITLE_MAX) {
    errors.push(`Le titre dépasse ${EVENT_TITLE_MAX} caractères.`);
  }
  for (const [field, label] of DASH_FIELDS) {
    if (/[–—]/.test(e[field] ?? "")) {
      errors.push(
        `${label} ne doit pas contenir de tiret long : utiliser une virgule ou deux-points.`
      );
    }
  }

  const needsCorroboration =
    isDecision(e.type) &&
    e.occurrence === "HELD" &&
    e.sourceKind === "PRESS" &&
    (e.outcome === "CONDAMNATION" || e.outcome === "RELAXE_PARTIELLE");
  if (needsCorroboration) {
    if (!e.corroborationUrl) {
      errors.push(
        "Une condamnation sourcée par la presse exige une seconde source d'un autre média."
      );
    } else {
      const corroborationError = checkSourceUrl(e.corroborationUrl, "La seconde source");
      if (corroborationError) {
        errors.push(corroborationError);
      } else if (
        !isAcceptedPressUrl(e.corroborationUrl) &&
        !isOfficialSourceUrl(e.corroborationUrl)
      ) {
        errors.push("La seconde source ne figure pas dans la liste des sources admises.");
      } else if (
        e.sourceUrl &&
        URL.canParse(e.sourceUrl) &&
        mediaOf(e.sourceUrl) === mediaOf(e.corroborationUrl)
      ) {
        errors.push("La seconde source doit venir d'un autre média que la première.");
      }
    }
  }

  return errors;
}
