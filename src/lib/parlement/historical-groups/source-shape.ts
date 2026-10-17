/**
 * Reading helpers for the official JSON files (lot 5, phase 5A-2).
 *
 * The Assemblée nationale files are converted from XML, so one field can be an object, a list or
 * `null` depending on how many elements the XML had. Nothing here guesses: a value either has the
 * shape asked for or the helper says so, and the parsers turn that into a typed rejection.
 */

export type RawRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is RawRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * `null` or absent is an empty list, a list is itself, anything else is a list of one. Elements are
 * not checked: a `null` inside a list stays visible to the caller.
 */
export function listOf(value: unknown): unknown[] {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * A non-empty string, or the `#text` of a typed XML element (`{"@xsi:type": ..., "#text": "PA1"}`).
 * Surrounding spaces make the value invalid rather than being trimmed: an identifier is compared
 * as published.
 */
export function textOf(value: unknown): string | null {
  const candidate = isRecord(value) ? value["#text"] : value;
  if (typeof candidate !== "string") return null;
  if (candidate === "" || candidate !== candidate.trim()) return null;
  return candidate;
}

/** A count published as a string or a number: digits only, no sign, no fraction. */
export function countOf(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }
  if (typeof value === "string" && /^\d{1,9}$/.test(value)) return Number(value);
  return null;
}

/** An integer published as a string (`"16"`): digits only. */
export const integerOf = countOf;

/** `null` and absent mean "not published". Used to tell "absent" from "present but invalid". */
export function isAbsent(value: unknown): boolean {
  return value === null || value === undefined;
}
