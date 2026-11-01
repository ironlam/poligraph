/**
 * PURE matcher: given a debate transcript (séance text) and the amendment(s) a
 * scrutin voted on, decide whether the text contains a STRONG, verifiable mention
 * of that amendment, and extract a BOUNDED excerpt.
 *
 * PROVISIONAL: regex calibrated on real AN séance transcripts ("l'amendement no
 * 2084", "amendements nos 27, 16 et 23"), but still to be confirmed against a
 * wider sample before the resolver is trusted for anything but read-only audit.
 * No DB, no model, no I/O — fully unit-testable.
 */

export type DebateContextConfidence = "HIGH" | "MEDIUM" | "LOW" | "NONE";

export interface AmendmentRef {
  number: string;
  authorSurname?: string | null;
  article?: string | null;
}

export interface AmendmentMention {
  confidence: DebateContextConfidence;
  reason: string;
  /** Bounded window around the match, never the whole transcript. */
  excerpt: string | null;
  /** Longer passage that follows a HIGH match (the speeches on that amendment),
   *  the only text allowed to ground for/against arguments. Null otherwise. */
  context: string | null;
  matchedAmendmentNumber: string | null;
  /** Only HIGH is trustworthy enough to feed a future generation. */
  usableForGeneration: boolean;
  /** Diagnostic only: a HIGH match where the author or article is also cited near
   *  the number. Strengthens confidence but is NEVER required to classify. */
  reinforced: boolean;
}

const NONE: AmendmentMention = {
  confidence: "NONE",
  reason: "Aucune mention claire de l'amendement dans le débat.",
  excerpt: null,
  context: null,
  matchedAmendmentNumber: null,
  usableForGeneration: false,
  reinforced: false,
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Lowercase + fold French accents + normalise unusual spaces. LENGTH-PRESERVING
 *  (each replacement is 1 char → 1 char) so indices map 1:1 to `normalizeSpaces`. */
function foldLower(s: string): string {
  return s
    .toLowerCase()
    .replace(/[àâä]/g, "a")
    .replace(/[éèêë]/g, "e")
    .replace(/[îï]/g, "i")
    .replace(/[ôö]/g, "o")
    .replace(/[ùûü]/g, "u")
    .replace(/ç/g, "c")
    .replace(/[   ]/g, " ");
}

/** NBSP variants → regular space. LENGTH-PRESERVING. Keeps original case/accents
 *  for excerpt extraction. */
function normalizeSpaces(s: string): string {
  return s.replace(/[   ]/g, " ");
}

/** "600 (Rect)" → "600" ; "CL8" → "CL8" ; "I-390" → "I-390" ; "2084" → "2084". */
function coreNumber(n: string): string {
  return n.replace(/\s*\(.*?\)\s*$/, "").trim();
}

/** Characters of debate kept after a HIGH match for the model to read. */
const DEBATE_CONTEXT_CHARS = 3500;
/** How far past a mention to look for the end of that amendment's discussion. */
const DISCUSSION_SEARCH_CHARS = 8000;
/** Below this, the passage is a bare vote announcement, not a discussion. */
const DISCUSSION_MIN_CHARS = 300;

function windowAround(text: string, idx: number, before = 120, after = 220): string {
  const start = Math.max(0, idx - before);
  const end = Math.min(text.length, idx + after);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

/**
 * Index (in folded/spaced coordinates) of an explicit "amendement(s) n.. <number>"
 * mention, or -1. Scans each "amendement(s) n" anchor and looks for the number as
 * a standalone token within a short window after it (covers "no 2084", "n° 2084",
 * "numéro 2084", "nos 27, 16 et 2084").
 */
/**
 * Index of `bare` inside the amendment-number list that opens `win` ("o 1358",
 * "os 2080 et 2084", "° 3915"), or -1. Only a number syntactically part of that list
 * counts: "no 42 à l'article 15" does not cite amendment 15.
 */
const NUMBER_LIST_RE = /^\s*(?:os?|°|umeros?)?\s*((?:\d+(?:\s*\([^)]*\))?(?:\s*(?:,|et)\s*)?)+)/;
function bareNumberIndexInList(win: string, bare: string): number {
  const m = NUMBER_LIST_RE.exec(win);
  if (!m?.[1]) return -1;
  const listStart = m[0].length - m[1].length;
  for (const n of m[1].matchAll(/\d+/g)) {
    if (n[0] === bare) return listStart + n.index;
  }
  return -1;
}

function highMatchIndex(
  folded: string,
  core: string,
  /** Accepts a match written without the finance-bill part ("no 1358" for "I-1358"). */
  corroborate?: (idx: number) => boolean
): number {
  const token = foldLower(core);
  const numRe = new RegExp(`(?<![\\w-])${escapeRegExp(token)}(?![\\w-])`);
  // Finance-bill amendments are numbered per part ("I-1358") but the séance text
  // says "l'amendement no 1358". The bare number also names the other part, so it
  // only counts when the caller can corroborate it.
  const bare = /^ii?-(\d+)$/.exec(token)?.[1];
  // Allow a comma between "amendements" and the "n" prefix: real séance text
  // says "amendements, nos 1403, 1984 et 1977".
  const anchorRe = /\bamendements?[\s,]+n/g;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(folded)) !== null) {
    const winStart = m.index + m[0].length;
    const win = folded.slice(winStart, winStart + 45);
    const nm = numRe.exec(win);
    if (nm) return winStart + nm.index;
    if (bare && corroborate) {
      const at = bareNumberIndexInList(win, bare);
      if (at >= 0 && corroborate(winStart + at)) return winStart + at;
    }
  }
  return -1;
}

/** Stage direction that closes an amendment: "(L'amendement no 1358 est adopté.)". */
const CLOSING_RE = /\(l.amendement[^)]{0,100}?(?:adopte|rejete|repousse|retire|tombe)[^)]*\)/;

/**
 * Where the discussion of the amendment that starts at `idx` ends, in folded
 * coordinates: the closing stage direction, or the next mention of a different
 * amendment, whichever comes first. -1 when neither is found within reach, so the
 * caller omits the passage rather than pass on speeches about other amendments.
 */
function discussionEnd(folded: string, idx: number, core: string): number {
  const token = foldLower(core);
  const numRe = new RegExp(`(?<![\\w-])${escapeRegExp(token)}(?![\\w-])`);
  const bare = /^ii?-(\d+)$/.exec(token)?.[1];
  const limit = Math.min(folded.length, idx + DISCUSSION_SEARCH_CHARS);
  const zone = folded.slice(idx, limit);

  let end = -1;
  const closing = CLOSING_RE.exec(zone);
  if (closing) end = idx + closing.index + closing[0].length;

  const anchorRe = /\bamendements?[\s,]+n/g;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(zone)) !== null) {
    const winStart = m.index + m[0].length;
    const win = zone.slice(winStart, winStart + 45);
    const ours = numRe.test(win) || (bare !== undefined && bareNumberIndexInList(win, bare) >= 0);
    if (!ours) {
      const at = idx + m.index;
      if (at > idx && (end < 0 || at < end)) end = at;
      break;
    }
  }
  return end;
}

/** The passage that follows a HIGH match, cut at the end of that amendment's discussion. */
function discussionContext(
  spaced: string,
  folded: string,
  idx: number,
  core: string
): string | null {
  const end = discussionEnd(folded, idx, core);
  if (end < 0 || end - idx < DISCUSSION_MIN_CHARS) return null;
  return windowAround(spaced, idx, 200, Math.min(end - idx, DEBATE_CONTEXT_CHARS));
}

function extractArticleNumber(article: string): string | null {
  const f = foldLower(article);
  const re = /(?:article\s+)?(\d+(?:\s*(?:bis|ter|quater|quinquies))?)/;
  const m = f.match(/article\s+(\d+(?:\s*(?:bis|ter|quater|quinquies))?)/) ?? f.match(re);
  const captured = m?.[1];
  return captured ? captured.replace(/\s+/g, " ").trim() : null;
}

function articleIndexIn(folded: string, articleNum: string): number {
  const re = new RegExp(`article\\s+${escapeRegExp(articleNum)}(?![\\d])`);
  const m = re.exec(folded);
  return m ? m.index : -1;
}

/** Diagnostic: does the author surname or article number appear within ~300 chars
 *  of the number match? Reinforces a HIGH, never required to classify it. */
function reinforcedNear(folded: string, idx: number, amd: AmendmentRef): boolean {
  const win = folded.slice(Math.max(0, idx - 300), idx + 300);
  const surname =
    amd.authorSurname && amd.authorSurname.trim().length >= 3
      ? foldLower(amd.authorSurname.trim())
      : "";
  const articleNum = amd.article ? extractArticleNumber(amd.article) : null;
  const hasSurname = surname.length > 0 && win.includes(surname);
  const hasArticle =
    articleNum != null && new RegExp(`article\\s+${escapeRegExp(articleNum)}(?![\\d])`).test(win);
  return hasSurname || hasArticle;
}

export function findAmendmentMention(
  transcriptText: string,
  amendments: AmendmentRef[]
): AmendmentMention {
  if (!transcriptText || !transcriptText.trim() || amendments.length === 0) return NONE;

  const spaced = normalizeSpaces(transcriptText);
  const folded = foldLower(spaced);

  // HIGH: explicit amendment number. Strongest, the only "usable" signal.
  for (const amd of amendments) {
    const idx = highMatchIndex(folded, coreNumber(amd.number), (i) =>
      reinforcedNear(folded, i, amd)
    );
    if (idx >= 0) {
      return {
        confidence: "HIGH",
        reason: `Numéro d'amendement « ${amd.number} » cité explicitement dans le débat.`,
        excerpt: windowAround(spaced, idx),
        context: discussionContext(spaced, folded, idx, coreNumber(amd.number)),
        matchedAmendmentNumber: amd.number,
        usableForGeneration: true,
        reinforced: reinforcedNear(folded, idx, amd),
      };
    }
  }

  // MEDIUM / LOW: author + article proximity, never usable for generation.
  let low: AmendmentMention | null = null;
  for (const amd of amendments) {
    const surname =
      amd.authorSurname && amd.authorSurname.trim().length >= 3
        ? foldLower(amd.authorSurname.trim())
        : "";
    const articleNum = amd.article ? extractArticleNumber(amd.article) : null;
    const surnameIdx = surname ? folded.indexOf(surname) : -1;
    const articleIdx = articleNum ? articleIndexIn(folded, articleNum) : -1;

    if (surnameIdx >= 0 && articleIdx >= 0 && Math.abs(surnameIdx - articleIdx) <= 300) {
      return {
        confidence: "MEDIUM",
        reason: "Auteur et article cités à proximité, sans le numéro d'amendement.",
        excerpt: windowAround(spaced, Math.min(surnameIdx, articleIdx)),
        context: null,
        matchedAmendmentNumber: amd.number,
        usableForGeneration: false,
        reinforced: false,
      };
    }
    if (!low && (surnameIdx >= 0 || articleIdx >= 0)) {
      low = {
        confidence: "LOW",
        reason: "Signal faible (auteur ou article seul), non exploitable pour la génération.",
        excerpt: windowAround(spaced, surnameIdx >= 0 ? surnameIdx : articleIdx),
        context: null,
        matchedAmendmentNumber: amd.number,
        usableForGeneration: false,
        reinforced: false,
      };
    }
  }

  return low ?? NONE;
}

/**
 * A number cited in several same-day séances cannot be tied to one debate: such a
 * match stays a diagnostic, never feeds a generation.
 */
export function applyAmbiguity<T extends AmendmentMention>(m: T, citingSeances: number): T {
  if (citingSeances <= 1 || !m.usableForGeneration) return m;
  return {
    ...m,
    usableForGeneration: false,
    context: null,
    reason: `Plusieurs séances du jour citent l'amendement (${citingSeances}): correspondance ambiguë.`,
  };
}
