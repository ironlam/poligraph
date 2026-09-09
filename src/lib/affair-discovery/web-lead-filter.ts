/**
 * Deciding which web results are worth an AI call.
 *
 * The discovery pass runs one Brave query per politician. Judging every result
 * with a model would cost one call per result for a base rate that measurement
 * puts very low: on the press queue, a sample of twelve "best" candidates held
 * one real hit, the rest being homonyms or officials quoted about someone
 * else's case.
 *
 * So the model is only asked the question it alone can answer, "is this person
 * the subject", and only about results that already carry a judicial predicate
 * and the person's surname. Everything else is dropped for free.
 */

/** Words that mark an actual judicial procedure, not a comment about one. */
const JUDICIAL_TERMS = [
  "condamn", // condamné, condamnation, condamnée
  "mis en examen",
  "mise en examen",
  "prévenu",
  "relaxe",
  "relaxé",
  "procès",
  "jugé",
  "jugement",
  "tribunal correctionnel",
  "garde à vue",
  "poursuivi",
  "inculp",
  "plainte contre",
  "détournement",
  "prise illégale",
  "abus de confiance",
  "favoritisme",
  "prison avec sursis",
  "inéligibilité",
];

/**
 * Titles that name a case belonging to someone else. The dominant French press
 * pattern is `Affaire X : "quote", selon Y`, which puts both names in the title
 * and makes a name match meaningless on its own.
 */
const OTHERS_CASE =
  // [Aa] explicite plutôt que le drapeau i : celui-ci rendrait aussi
  // [A-ZÉÈÀÂÎÔÛ] insensible à la casse, or c'est la majuscule qui distingue un
  // nom propre d'un mot courant.
  /\b[Aa]ffaire\s+(?!de\s|du\s|des\s)((?:[A-ZÉÈÀÂÎÔÛ][\wéèàâîôûç-]+)(?:\s+(?:de|du|des|la|le|von|van)?\s*[A-ZÉÈÀÂÎÔÛ][\wéèàâîôûç-]+)*)/;

import { isVerifiedAffairPressUrl } from "@/config/affair-sources";

export interface WebResult {
  title: string;
  url: string;
  description: string;
  publisher: string | null;
}

export interface LeadDecision {
  keep: boolean;
  /** Why it was dropped, for the report. Never null when keep is false. */
  reason: string | null;
}

export function normalize(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function hasJudicialTerm(haystack: string): boolean {
  return JUDICIAL_TERMS.some((term) => haystack.includes(normalize(term)));
}

/**
 * Does the title present a case belonging to a different person?
 *
 * The gate only fires when it is CERTAIN the case is someone else's. A
 * single-word capture broke on compound surnames: "Affaire Le Pen" captured
 * "Le", which does not contain "le pen", so an article about that politician's
 * own case was discarded. The pattern now takes consecutive capitalised words
 * and their particles.
 *
 * When the captured name contains the surname the case may well be theirs, so
 * the result goes through to the judge rather than being dropped here. That
 * costs one call on an ambiguous title, which is the right side to err on.
 */
function namesSomeoneElsesCase(title: string, surname: string): boolean {
  const match = OTHERS_CASE.exec(title);
  if (!match) return false;
  return !normalize(match[1]!).includes(normalize(surname));
}

/**
 * Keep a result only if it is from a trusted publisher, names the politician,
 * carries a judicial term, and does not announce someone else's case.
 */
/**
 * Editorial article, or something the publisher merely hosts?
 *
 * `isVerifiedAffairPressUrl` accepts any subdomain of an allowed host, which is
 * right for the ingested press feeds that share it but wrong here: a Brave
 * query surfaced `blogs.mediapart.fr/<pseudo>/liste-de-responsables-condamnes`,
 * reader-published content carrying the trust of the masthead, and
 * `lefigaro.fr/tag/detournement-de-fonds-publics`, an index page that names an
 * offence next to whoever happens to be listed. Both reached the judge and both
 * were caught further down by luck rather than by design.
 *
 * Kept local to the discovery screen on purpose: the shared helper also serves
 * `press-analysis`, and narrowing it there is a separate decision.
 */
function isHostedRatherThanEdited(rawUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return true;
  }
  const host = url.hostname.toLowerCase();
  if (/^blogs?\./.test(host)) return true;

  // Index pages list an offence, they do not report one about a named person.
  const path = url.pathname.toLowerCase();
  return /(^|\/)(tag|tags|mots-cles|theme|thematique|sujet)(\/|$)/.test(path);
}

export function screenWebResult(
  result: WebResult,
  politician: { firstName: string; lastName: string }
): LeadDecision {
  if (!result.publisher) {
    return { keep: false, reason: "éditeur hors liste de confiance" };
  }
  // TRUSTED_PUBLISHERS compte 25 domaines, dont BFMTV et 20 Minutes. La règle 4
  // d'AGENTS.md en admet huit pour porter un fait judiciaire, et c'est cette
  // liste-là qui compte : la source découverte devient l'unique source du
  // brouillon, et la garde de publication vérifie qu'une source existe, pas
  // qu'elle est admissible.
  if (!isVerifiedAffairPressUrl(result.url)) {
    return { keep: false, reason: "éditeur non admis pour un fait judiciaire" };
  }
  if (isHostedRatherThanEdited(result.url)) {
    return { keep: false, reason: "billet de blog ou page d'index, pas un article" };
  }

  const haystack = normalize(`${result.title} ${result.description}`);
  const surname = normalize(politician.lastName);

  if (surname.length < 3) {
    // A two-letter surname matches everywhere; the noise is not worth the call.
    return { keep: false, reason: "patronyme trop court pour être discriminant" };
  }
  if (!haystack.includes(surname)) {
    return { keep: false, reason: "patronyme absent du résultat" };
  }
  if (!hasJudicialTerm(haystack)) {
    return { keep: false, reason: "aucun terme judiciaire" };
  }
  if (namesSomeoneElsesCase(result.title, politician.lastName)) {
    return { keep: false, reason: "le titre nomme l'affaire d'un tiers" };
  }

  return { keep: true, reason: null };
}
