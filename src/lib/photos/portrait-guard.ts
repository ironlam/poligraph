/**
 * Quality gate deciding whether a Commons image may be auto-cropped to a
 * portrait, and whether a newly discovered image may be attached at all.
 *
 * The asymmetry that shapes every rule here: showing the wrong person's face on
 * a politician's page is a serious data error, while not cropping is merely a
 * cosmetic one. So the gate errs towards refusing, and a refusal never removes
 * an existing photo — it only means "leave this one alone".
 */

export type PortraitRejectionReason =
  | "non-portrait-subject"
  /** Another person is named in the frame, joined by "et", "avec", "&". */
  | "multiple-subjects"
  /**
   * Words in the filename we cannot account for. Measured over 554 real files,
   * these are mostly places and event descriptions ("Roeulx", "Toulouse",
   * "quatre jours de Dunkerque") rather than second people, so calling them
   * `multiple-subjects` would state something false in the report. Either way
   * the framing cannot be trusted, so the crop is refused.
   */
  | "unexplained-words"
  | "too-wide"
  | "too-small";

export type PortraitVerdict =
  | { ok: true }
  | { ok: false; reason: PortraitRejectionReason; detail: string };

const PASS: PortraitVerdict = { ok: true };

function reject(reason: PortraitRejectionReason, detail: string): PortraitVerdict {
  return { ok: false, reason, detail };
}

/**
 * Tokens that mean the image is of something other than the person: a grave, a
 * statue, a coat of arms, a signature. Matched on whole tokens, so "cim" cannot
 * fire inside an unrelated word.
 */
const NON_PORTRAIT_TOKENS = new Set([
  "tombe",
  "tombeau",
  "sepulture",
  "grave",
  "cimetiere",
  "cim",
  "funerailles",
  "obseques",
  "monument",
  "memorial",
  "plaque",
  "commemorative",
  "statue",
  "buste",
  "bust",
  "blason",
  "armoiries",
  "logo",
  "signature",
  "caricature",
  "timbre",
  "affiche",
  "banderole",
  "manifestation",
  "meeting",
]);

/**
 * Words that routinely appear in Commons filenames without naming a person.
 * Anything left over after this list is treated as a possible second subject.
 */
const NON_PERSON_TOKENS = new Set([
  // provenance and framing
  "file",
  "image",
  "fichier",
  "wikipedia",
  "wikimedia",
  "commons",
  "cropped",
  "crop",
  "recadre",
  "portrait",
  "photo",
  "picture",
  "img",
  "dsc",
  "scan",
  "detail",
  "version",
  "copie",
  "copy",
  // roles and institutions
  "monsieur",
  "madame",
  "mme",
  "president",
  "presidente",
  "ministre",
  "secretaire",
  "depute",
  "deputee",
  "senateur",
  "senatrice",
  "maire",
  "conseiller",
  "candidat",
  "candidate",
  "official",
  "officiel",
  "officielle",
  "assemblee",
  "nationale",
  "senat",
  "gouvernement",
  "government",
  "parlement",
  "parliament",
  "european",
  "europeen",
  "commission",
  "commissioner",
  "minister",
  "ministry",
  "sncf",
  "edf",
  "ratp",
  "onu",
  "unesco",
  // dates
  "janvier",
  "fevrier",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "aout",
  "septembre",
  "octobre",
  "novembre",
  "decembre",
  "january",
  "february",
  "march",
  "april",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
  // scene words
  "lors",
  "des",
  "voeux",
  "extract",
  "extrait",
  "mini",
  "session",
  "plenary",
  "pleniere",
  "conference",
  "presse",
  "press",
  "interview",
  "discours",
  "speech",
  "visite",
  "visit",
  "courtesy",
  "call",
  "reunion",
  "sommet",
  "summit",
  "campagne",
  "campaign",
  "congres",
  "congress",
  "debat",
  "debate",
  "ceremonie",
  "ceremony",
  "salon",
  "forum",
  "culture",
  "cultural",
  "affairs",
  "french",
  "france",
  "paris",
  "bruxelles",
  "brussels",
  "strasbourg",
]);

/** Marks left by a contributor who already framed the image on one person. */
const HUMAN_CROPPED_MARKERS = [/\(\s*cropped\s*\)/i, /\(\s*recadr\w*\s*\)/i, /_cropped/i];

/**
 * Photographer attribution, which on Commons follows the subject's name:
 * "Jean-Marie Bockel par Claude Truong-Ngoc juin 2014.jpg". Everything from the
 * marker on names the photographer, not another person in the frame, so it is
 * cut before the filename is read. The subject always precedes it, so a second
 * subject written before the credit is still caught.
 */
const CREDIT_MARKER = /[_\s-](par|by|photo de|foto)[_\s]/i;

/**
 * Joins two people in a filename: "Fernand et Carl", "Ségolène Royal & Guillaume
 * Coutey". This is the only positive evidence of a second subject we can read
 * from a filename, so it is what separates `multiple-subjects` from words we
 * merely fail to recognise.
 */
const COMPANION_CONJUNCTION = /[_\s](et|avec|and|with)[_\s]|&/i;

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Drop the file extension so it is not mistaken for a name token. */
function dropExtension(filename: string): string {
  return filename.replace(/\.(jpe?g|png|gif|tiff?|webp|svg)$/i, "");
}

/** Lowercase, accent-free alphabetic tokens. Digits and punctuation split. */
function tokenize(value: string): string[] {
  return stripAccents(value)
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);
}

/** Levenshtein distance, capped early since we only care about <= 1. */
function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;

  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < shorter.length && j < longer.length) {
    if (shorter[i] === longer[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (shorter.length === longer.length) i++;
    j++;
  }
  return edits + (longer.length - j) + (shorter.length - i) <= 1;
}

/**
 * True when `token` plausibly belongs to the politician's own name. Short
 * tokens must match exactly; longer ones tolerate a single typo, because
 * Commons filenames misspell surnames often enough to matter (our record says
 * "Quilliot", the file says "Quillot").
 */
function matchesOwnName(token: string, nameTokens: string[]): boolean {
  return nameTokens.some((part) =>
    token.length >= 5 && part.length >= 5 ? withinOneEdit(token, part) : token === part
  );
}

/**
 * True when a token is just the politician's name written without separators —
 * `Hervemorin2008`, `LaurentHénart`, `AlfonsiFrancois`. Tokenising on
 * non-letters leaves these as one long token that matches neither name part, so
 * they used to read as a stranger.
 *
 * The name parts are consumed as substrings in either order; a token that
 * disappears was the politician's own name. `SegoleneRoyal` on Guillaume
 * Coutey's file leaves `segoleneroyal` behind and is still refused.
 */
function isGluedOwnName(token: string, nameTokens: string[]): boolean {
  let remaining = token;
  for (const part of nameTokens) {
    if (part.length < 3) continue;
    remaining = remaining.replace(part, "");
  }
  return remaining.length < 3;
}

/**
 * Screen a Commons filename for subjects that are not a lone portrait of the
 * politician.
 */
export function screenFilename(filename: string, politicianName: string): PortraitVerdict {
  const stem = dropExtension(filename);
  const tokens = tokenize(stem);

  const subjectHit = tokens.find((token) => NON_PORTRAIT_TOKENS.has(token));
  if (subjectHit) {
    return reject("non-portrait-subject", `filename mentions "${subjectHit}"`);
  }

  // A contributor-cropped file is framed on one person by construction; the
  // other names in its filename describe the original scene.
  if (HUMAN_CROPPED_MARKERS.some((marker) => marker.test(filename))) return PASS;

  const credited = stem.split(CREDIT_MARKER)[0] ?? stem;
  const nameTokens = tokenize(politicianName);
  const leftovers = tokenize(credited).filter(
    (token) =>
      token.length >= 3 &&
      !NON_PERSON_TOKENS.has(token) &&
      !matchesOwnName(token, nameTokens) &&
      !isGluedOwnName(token, nameTokens)
  );

  if (leftovers.length === 0) return PASS;

  // A conjunction is the one signal that positively means "and this other
  // person", as opposed to a word we simply do not recognise.
  if (COMPANION_CONJUNCTION.test(credited)) {
    return reject("multiple-subjects", `another person named alongside: ${leftovers.join(", ")}`);
  }

  return reject("unexplained-words", `cannot account for: ${leftovers.join(", ")}`);
}

/** Widest aspect ratio we still treat as a portrait rather than a scene. */
const MAX_ASPECT_RATIO = 1.4;

/** Below this, cropping would visibly degrade the image. */
const MIN_SIDE_PX = 200;

export function screenGeometry(dimensions: {
  width?: number | null;
  height?: number | null;
}): PortraitVerdict {
  const { width, height } = dimensions;
  if (!width || !height) {
    return reject("too-small", "image dimensions unavailable");
  }
  if (width < MIN_SIDE_PX || height < MIN_SIDE_PX) {
    return reject("too-small", `${width}x${height} is under ${MIN_SIDE_PX}px`);
  }
  if (width / height > MAX_ASPECT_RATIO) {
    return reject(
      "too-wide",
      `aspect ratio ${(width / height).toFixed(2)} exceeds ${MAX_ASPECT_RATIO}`
    );
  }
  return PASS;
}

export function screenPortrait(input: {
  filename: string;
  politicianName: string;
  width?: number | null;
  height?: number | null;
}): PortraitVerdict {
  const byFilename = screenFilename(input.filename, input.politicianName);
  if (!byFilename.ok) return byFilename;
  return screenGeometry({ width: input.width, height: input.height });
}
