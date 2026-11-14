/**
 * Splits an official "vote on the whole bill" title into what a reader needs: the bill and the
 * reading. "l'ensemble du projet de loi relatif à X (première lecture)." becomes
 * { bill: "Projet de loi relatif à X", reading: "Première lecture" }.
 *
 * Display only: the stored title is untouched and stays the official wording on the vote page.
 * A title that does not match keeps its text, capitalised, with no reading.
 */
export interface GovernmentProjectTitleParts {
  bill: string;
  reading: string | null;
}

const WHOLE_TEXT_PREFIX = /^l['’]ensemble (?:du |de la |des |de l['’])/i;
const TRAILING_READING = /\s*\(([^()]+)\)\s*$/;
const READING_LABELS: Record<string, string> = {
  "texte de la commission mixte paritaire": "Commission mixte paritaire",
};

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function governmentProjectTitleParts(title: string): GovernmentProjectTitleParts {
  let bill = title.trim().replace(/\.$/, "");
  bill = bill.replace(WHOLE_TEXT_PREFIX, "");

  let reading: string | null = null;
  const match = bill.match(TRAILING_READING);
  if (match?.[1] && match.index !== undefined) {
    const raw = match[1].trim();
    reading = READING_LABELS[raw.toLowerCase()] ?? capitalize(raw);
    bill = bill.slice(0, match.index);
  }

  return { bill: capitalize(bill.trim()), reading };
}
