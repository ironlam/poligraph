/** Public shape of the reasons shown on a vote page. One reason is one distinct idea,
 * carried by one or several speakers. Speakers and quotes are derived by the code from
 * the quotes a reason cites, never written by the model. */
export interface ReasonSpeaker {
  name: string;
  /** Official actor id (Assemblée "PA…"), used to find the politician sheet and group. */
  actorRef: string | null;
  role: string | null;
}
export interface ReasonQuote {
  speaker: string;
  text: string;
}
export interface Reason {
  text: string;
  /** The reason comes from a discussion shared with other amendments. */
  shared: boolean;
  speakers: ReasonSpeaker[];
  quotes: ReasonQuote[];
}
export interface ReasonsPayload {
  v: 1;
  for: Reason[];
  against: Reason[];
}

const str = (v: unknown): v is string => typeof v === "string";

function parseReason(raw: unknown): Reason | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!str(r.text) || !r.text.trim() || typeof r.shared !== "boolean") return null;
  if (!Array.isArray(r.speakers) || !Array.isArray(r.quotes) || r.quotes.length === 0) return null;
  const speakers: ReasonSpeaker[] = [];
  for (const s of r.speakers) {
    if (!s || typeof s !== "object") return null;
    const o = s as Record<string, unknown>;
    if (!str(o.name) || !o.name.trim()) return null;
    speakers.push({
      name: o.name,
      actorRef: str(o.actorRef) ? o.actorRef : null,
      role: str(o.role) ? o.role : null,
    });
  }
  const quotes: ReasonQuote[] = [];
  for (const q of r.quotes) {
    if (!q || typeof q !== "object") return null;
    const o = q as Record<string, unknown>;
    if (!str(o.speaker) || !str(o.text) || !o.text.trim()) return null;
    quotes.push({ speaker: o.speaker, text: o.text });
  }
  return { text: r.text, shared: r.shared, speakers, quotes };
}

/** Read the stored JSON defensively: anything malformed means "no structured reasons",
 * and the page falls back to the plain text of the analysis. */
export function parseReasons(value: unknown): ReasonsPayload | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (v.v !== 1 || !Array.isArray(v.for) || !Array.isArray(v.against)) return null;
  const side = (items: unknown[]): Reason[] | null => {
    const out: Reason[] = [];
    for (const item of items) {
      const reason = parseReason(item);
      if (!reason) return null;
      out.push(reason);
    }
    return out;
  };
  const f = side(v.for);
  const a = side(v.against);
  return f && a ? { v: 1, for: f, against: a } : null;
}
