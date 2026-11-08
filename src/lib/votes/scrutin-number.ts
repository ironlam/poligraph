/** "VTANR5L17V5729" → "5729", Sénat "2024-63" → "63", anything else → null. */
export function extractScrutinNumber(externalId: string): string | null {
  const anMatch = externalId.match(/V(\d+)$/);
  if (anMatch?.[1]) return anMatch[1];
  const senatMatch = externalId.match(/-(\d+)$/);
  if (senatMatch?.[1]) return senatMatch[1];
  return null;
}
