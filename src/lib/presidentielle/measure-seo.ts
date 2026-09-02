export function truncateAtWord(text: string, maxLength: number): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  const cut = normalized.slice(0, maxLength - 1);
  const boundary = cut.lastIndexOf(" ");
  return `${cut.slice(0, boundary > maxLength / 2 ? boundary : cut.length).trim()}…`;
}

export function buildMeasureSeoDescription(input: {
  candidateName: string;
  themeLabel: string;
  text: string;
  details: string | null;
}): string {
  const subject = input.details?.trim() || input.text;
  return truncateAtWord(
    `Présidentielle 2027 : mesure de ${input.candidateName} sur ${input.themeLabel}. ${subject} Sources et votes parlementaires liés.`,
    160
  );
}
