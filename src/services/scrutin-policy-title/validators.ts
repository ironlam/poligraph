import type { EvidenceQuote, GenerationWarning, SubstanceTextBlock } from "./types";

export interface ValidatorInput {
  policyTitle: string;
  policySubtitle: string | null;
  evidenceQuotes: EvidenceQuote[];
  blocks: SubstanceTextBlock[];
  /** The scrutin's official (procedural) title. Optional: enables suppression +
   *  budgetary detection for the polarity validator. When absent, suppression is
   *  inferred from the amendment dispositif in `blocks`. */
  officialTitle?: string;
}

/** Lowercase + strip diacritics. */
function stripDiacritics(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Aggressive normalizer for fuzzy verbatim matching: strip diacritics, collapse
 *  whitespace, drop punctuation. */
function normalizeForMatch(s: string): string {
  return stripDiacritics(s)
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Procedural nouns (accent-normalized). A title built only of these has no
 *  concrete policy object. */
const PROCEDURAL_NOUNS = new Set<string>([
  "article",
  "articles",
  "amendement",
  "amendements",
  "sous-amendement",
  "sous-amendements",
  "projet",
  "proposition",
  "loi",
  "lecture",
  "examen",
  "scrutin",
  "motion",
  "vote",
  "votes",
]);

const STOPWORDS = new Set<string>([
  "aux",
  "avec",
  "cette",
  "dans",
  "des",
  "donc",
  "elle",
  "les",
  "leur",
  "leurs",
  "mais",
  "pour",
  "sans",
  "ses",
  "son",
  "sous",
  "sur",
  "tous",
  "tout",
  "toute",
  "toutes",
  "une",
  "vers",
  "votre",
  "vous",
  "que",
  "qui",
  "est",
  "etre",
  "fut",
  "ete",
  "presente",
  "present",
  "gouvernement",
  "assemblee",
  "deputes",
  "depute",
]);

/** Curated French policy verb-stems (accent-normalized substrings). */
const POLICY_VERBS = [
  "creer",
  "supprim",
  "retabli",
  "restrein",
  "autoris",
  "interdi",
  "etend",
  "redui",
  "simplifi",
  "acceler",
  "retard",
  "abrog",
  "modifi",
  "exoner",
  "limit",
  "renforc",
  "oblig",
  "encadr",
  "instaur",
  "elargi",
  "plafonn",
  "exclu",
  "inclu",
  "revis",
  "control",
] as const;

/** Matches an ellipsis marker an LLM inserts to bridge two non-adjacent spans:
 *  "[...]", "[ ... ]", "[…]", or a bare "…". */
const ELLIPSIS_MARKER = /\s*\[\s*(?:\.\.\.|…)\s*\]\s*|\s*…\s*/;

/** Verbatim-or-fuzzy quote match: exact substring first, else normalized
 *  (diacritics/punctuation/whitespace-insensitive) substring. A quote that
 *  stitches non-adjacent spans with an ellipsis marker (common in LLM-emitted
 *  quotes) can never be a single substring, so it grounds only if every fragment
 *  appears, in order, in the source. Shared by the EvidenceGrounding validator
 *  and the evidence-drift helper. */
export function quoteAppearsInText(quote: string, text: string): boolean {
  if (text.includes(quote)) return true;
  const normText = normalizeForMatch(text);
  if (normText.includes(normalizeForMatch(quote))) return true;
  if (!ELLIPSIS_MARKER.test(quote)) return false;
  const fragments = quote
    .split(ELLIPSIS_MARKER)
    .map(normalizeForMatch)
    .filter((f) => f.length > 0);
  if (fragments.length < 2) return false;
  let cursor = 0;
  for (const fragment of fragments) {
    const at = normText.indexOf(fragment, cursor);
    if (at < 0) return false;
    cursor = at + fragment.length;
  }
  return true;
}

function tokenize(title: string): string[] {
  return normalizeForMatch(title)
    .split(/\s+/)
    .filter((w) => w.length > 0);
}

/** Content nouns: tokens longer than 3 chars that are not stopwords nor
 *  procedural nouns. */
function contentNouns(title: string): string[] {
  return tokenize(title).filter(
    (w) => w.length > 3 && !STOPWORDS.has(w) && !PROCEDURAL_NOUNS.has(w)
  );
}

function hasPolicyVerb(title: string): boolean {
  const n = stripDiacritics(title);
  return POLICY_VERBS.some((stem) => n.includes(stem));
}

// ── Individual validators ────────────────────────────────────────────────────

function validateLength(title: string): GenerationWarning[] {
  const len = title.length;
  if (len > 140) {
    return [
      {
        code: "LENGTH",
        severity: "blocker",
        message: `Titre trop long (${len} > 140 caractères).`,
      },
    ];
  }
  if (len >= 91) {
    return [
      { code: "LENGTH", severity: "warn", message: `Titre long (${len} caractères, idéal < 91).` },
    ];
  }
  return [];
}

function validateProceduralOnly(title: string): GenerationWarning[] {
  if (contentNouns(title).length === 0) {
    return [
      {
        code: "PROCEDURAL_ONLY",
        severity: "blocker",
        message: "Le titre ne contient que des références procédurales, aucun objet concret.",
      },
    ];
  }
  return [];
}

function validateArticleOnly(title: string): GenerationWarning[] {
  const m = /^\s*(rétablir|modifier|supprimer|abroger)\s+l['’]?article\s+\d+/i.test(title);
  if (!m) return [];
  // Strip the lead "verbe l'article N", then strip a trailing bill-naming clause
  // ("du projet de loi agricole", "de la proposition de loi …") which only names
  // WHICH text, not the policy content. What remains must carry a concrete object.
  const rest = title
    .replace(/^\s*(rétablir|modifier|supprimer|abroger)\s+l['’]?article\s+\d+/i, "")
    .replace(/\s+(du|de la|de l['’]|des)\s+((projet|proposition)\s+de\s+)?loi\b.*$/i, "");
  if (contentNouns(rest).length === 0) {
    return [
      {
        code: "ARTICLE_ONLY",
        severity: "blocker",
        message: "Le titre ne fait que référencer un article, sans décrire son contenu.",
      },
    ];
  }
  return [];
}

function validateAmendmentNumberOnly(title: string): GenerationWarning[] {
  const mentionsAmendment = /(sous-?\s?)?amendement/i.test(title);
  const hasNumber = /\d/.test(title);
  if (!mentionsAmendment || !hasNumber) return [];
  // Blocker unless there is a policy verb AND a concrete object.
  if (!(hasPolicyVerb(title) && contentNouns(title).length > 0)) {
    return [
      {
        code: "AMENDMENT_NUMBER_ONLY",
        severity: "blocker",
        message:
          "Le titre ne fait que référencer un numéro d'amendement, sans décrire son contenu.",
      },
    ];
  }
  return [];
}

function blockKey(b: { sourceType: string; sourceId: string; field: string }): string {
  return `${b.sourceType}::${b.sourceId}::${b.field}`;
}

function validateEvidenceTrust(input: ValidatorInput): GenerationWarning[] {
  const byKey = new Map(input.blocks.map((b) => [blockKey(b), b]));
  for (const q of input.evidenceQuotes) {
    const block = byKey.get(blockKey(q));
    if (block && block.trust !== "official") {
      return [
        {
          code: "EVIDENCE_TRUST",
          severity: "blocker",
          message: "Une citation s'appuie sur un bloc non officiel.",
        },
      ];
    }
  }
  return [];
}

function validateEvidenceGrounding(input: ValidatorInput): GenerationWarning[] {
  if (input.evidenceQuotes.length === 0) {
    return [
      {
        code: "EVIDENCE_GROUNDING",
        severity: "blocker",
        message: "Aucune citation de preuve fournie.",
      },
    ];
  }
  const byKey = new Map(input.blocks.map((b) => [blockKey(b), b]));
  for (const q of input.evidenceQuotes) {
    const block = byKey.get(blockKey(q));
    if (!block) {
      return [
        {
          code: "EVIDENCE_GROUNDING",
          severity: "blocker",
          message: "Une citation référence une source absente des blocs.",
        },
      ];
    }
    if (!quoteAppearsInText(q.quote, block.text)) {
      return [
        {
          code: "EVIDENCE_GROUNDING",
          severity: "blocker",
          message: "Le texte d'une citation est introuvable dans la source citée.",
        },
      ];
    }
  }
  return [];
}

function validateSubTarget(input: ValidatorInput): GenerationWarning[] {
  const subBlocks = input.blocks.filter(
    (b) => b.sourceType === "subAmendment" && b.text.trim().length > 0
  );
  if (subBlocks.length === 0) {
    const anySub = input.blocks.some((b) => b.sourceType === "subAmendment");
    if (anySub) {
      return [
        {
          code: "SUB_TARGET_NO_TEXT",
          severity: "warn",
          message: "Un sous-amendement est présent mais sans texte exploitable.",
        },
      ];
    }
    return [];
  }
  const citesSub = input.evidenceQuotes.some((q) => q.sourceType === "subAmendment");
  if (!citesSub) {
    return [
      {
        code: "SUB_TARGET_NOT_CITED",
        severity: "blocker",
        message: "Un sous-amendement porte le texte décisif mais aucune citation ne s'y rapporte.",
      },
    ];
  }
  return [];
}

const RESULT_LEAKAGE_PATTERNS: RegExp[] = [
  /\b(les?\s+)?députés?\s+(rejett|adopt|vot|approuv|refus|valid)/i,
  /\bl['’]assemblée\s+(refuse|rejette|adopte|valide|approuve)/i,
  /\b(la\s+)?(mesure|disposition|amendement|motion)\s+(est|a été|fut)\s+(adopté|rejeté|approuvé)/i,
  /\b(adopter|rejeter|approuver)\s+(l['’]amendement|la motion|le sous-amendement|la proposition)\b/i,
];

function validateResultLeakage(title: string): GenerationWarning[] {
  if (RESULT_LEAKAGE_PATTERNS.some((re) => re.test(title))) {
    return [
      {
        code: "RESULT_LEAKAGE",
        severity: "blocker",
        message: "Le titre divulgue l'issue du vote au lieu de décrire la mesure.",
      },
    ];
  }
  return [];
}

const CHARGED_ADJECTIVES = [
  "scandaleux",
  "essentiel",
  "dangereux",
  "crucial",
  "ambitieux",
  "inacceptable",
];

function validateToneNeutrality(title: string): GenerationWarning[] {
  const n = stripDiacritics(title);
  if (CHARGED_ADJECTIVES.some((adj) => new RegExp(`\\b${adj}`, "i").test(n))) {
    return [
      {
        code: "TONE_NEUTRALITY",
        severity: "warn",
        message: "Le titre emploie un adjectif chargé, préférer un ton neutre.",
      },
    ];
  }
  return [];
}

function validateNoDash(title: string): GenerationWarning[] {
  if (/[—–]/.test(title)) {
    return [
      {
        code: "NO_DASH",
        severity: "warn",
        message: "Le titre contient un tiret cadratin ou demi-cadratin.",
      },
    ];
  }
  return [];
}

const ACCENT_REQUIRED =
  /\b(derogations?|qualite|elus?|deputes?|criteres?|egalement|reglement|prefet|securite|electeurs?)\b/i;

function validateAccents(title: string): GenerationWarning[] {
  if (ACCENT_REQUIRED.test(title)) {
    return [
      {
        code: "ACCENTS",
        severity: "blocker",
        message: "Le titre comporte des mots français sans leurs accents.",
      },
    ];
  }
  return [];
}

/** Leading verb stems (accent-normalized) that assert a CREATED / EXTENDED /
 *  REINFORCED policy. When a "de suppression" scrutin's title opens on one of
 *  these, it restates the suppressed article's content in positive polarity —
 *  i.e. the vote's meaning is inverted (voting to suppress ≠ enacting the
 *  article). Removal / negation / status-quo leads (supprimer, ne pas…,
 *  maintenir, rétablir) are deliberately absent: they are the correct framing. */
const CREATIVE_LEAD_STEMS = [
  "autoris",
  "creer",
  "cree",
  "prolong",
  "etend",
  "elargi",
  "instaur",
  "rendre",
  "augment",
  "oblig",
  "impos",
  "aggrav",
  "doubl",
  "renforc",
  "generalis",
  "facilit",
  "acceler",
  "octroi",
  "octroy",
  "attribu",
  "permett",
  "ajout",
  "consacr",
  "assujetti",
  "soumett",
] as const;

/** Full-article suppression dispositif ("Supprimer cet article." / "…l'article") —
 *  the AN-uniform content of a suppression amendment. Alinéa/word-level removals
 *  inside a modifying amendment do NOT match (they are not article suppressions). */
const SUPPRESSION_DISPOSITIF = /^\s*supprimer\s+(cet\s+article|l['’]?\s*article|les\s+articles)\b/i;

/** Official-title marker of a suppression scrutin ("… de suppression de l'article X …"). */
const SUPPRESSION_TITLE = /\bde suppression\b/i;

/** Budgetary bills (PLF / PLFSS): suppressing a credit-cutting article legitimately
 *  restores or raises credits, so a "creative" verb there is a valid double
 *  negative, not an inversion. */
const BUDGETARY_TITLE =
  /\b(projet de loi de finances|loi de finances|financement de la s[eé]curit[eé] sociale|plf(ss)?)\b/i;

function titleLeadsCreative(title: string): boolean {
  const n = stripDiacritics(title)
    .replace(/^[\s"«»'’()-]+/, "")
    .trim();
  if (/^ne\s+(pas|plus)\b/.test(n)) return false; // explicit negation → not inverted
  const first = n.split(/\s+/)[0] ?? "";
  return CREATIVE_LEAD_STEMS.some((stem) => first.startsWith(stem));
}

function isSuppressionScrutin(input: ValidatorInput): boolean {
  if (input.officialTitle && SUPPRESSION_TITLE.test(input.officialTitle)) return true;
  return input.blocks.some(
    (b) => b.field === "Amendment.content" && SUPPRESSION_DISPOSITIF.test(b.text)
  );
}

/**
 * Suppression-polarity guard. A "de suppression" amendment removes an article, so
 * a faithful title describes what the removal DOES (a removal / negation /
 * status-quo framing). When the title instead opens on a creation or extension
 * verb, it restates the suppressed article's content in positive polarity and
 * inverts the vote's meaning — the systemic bug that mislabelled 9 published
 * titles. Budgetary (PLF/PLFSS) suppressions are excluded: restoring cut credits
 * with a "creative" verb is a legitimate double negative.
 */
function validateSuppressionPolarity(input: ValidatorInput): GenerationWarning[] {
  if (!isSuppressionScrutin(input)) return [];
  if (input.officialTitle && BUDGETARY_TITLE.test(input.officialTitle)) return [];
  if (!titleLeadsCreative(input.policyTitle)) return [];
  return [
    {
      code: "SUPPRESSION_POLARITY",
      severity: "blocker",
      message:
        "Le titre décrit le contenu de l'article en polarité positive alors que l'amendement le supprime : le sens du vote est inversé.",
    },
  ];
}

/**
 * Runs every rule-based validator on a candidate policy title and its grounding
 * evidence. Pure function: concatenates all flags, no side effects.
 */
export function runValidators(input: ValidatorInput): GenerationWarning[] {
  const { policyTitle } = input;
  return [
    ...validateLength(policyTitle),
    ...validateProceduralOnly(policyTitle),
    ...validateArticleOnly(policyTitle),
    ...validateAmendmentNumberOnly(policyTitle),
    ...validateResultLeakage(policyTitle),
    ...validateEvidenceTrust(input),
    ...validateEvidenceGrounding(input),
    ...validateSubTarget(input),
    ...validateSuppressionPolarity(input),
    ...validateToneNeutrality(policyTitle),
    ...validateNoDash(policyTitle),
    ...validateAccents(policyTitle),
  ];
}
