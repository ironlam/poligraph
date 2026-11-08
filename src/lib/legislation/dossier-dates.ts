/**
 * Date de dépôt d'un dossier législatif.
 *
 * La plus ancienne date d'un acte n'est pas le dépôt : une nomination de
 * rapporteur ou une saisine pour avis peut précéder le dépôt de plusieurs
 * mois (PLF 2027 : nomination le 2025-10-02, dépôt le 2026-10-01). Le dépôt
 * initial est donc la source, la plus ancienne date n'est qu'un repli.
 */

export interface ResolvedFilingDate {
  filingDate: Date | null;
  /** Jour calendaire français à midi UTC, pour préfixer un slug sans décalage. */
  slugDate: Date | null;
}

function frenchCalendarDay(date: Date): Date {
  // Les actes AN sont datés à minuit heure de Paris : en UTC cela tombe la veille.
  const day = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(date);
  return new Date(`${day}T12:00:00.000Z`);
}

export function resolveFilingDate(
  initialDepositDate: string | null,
  allActDates: Date[]
): ResolvedFilingDate {
  if (initialDepositDate) {
    const deposit = new Date(initialDepositDate);
    if (!Number.isNaN(deposit.getTime())) {
      return { filingDate: deposit, slugDate: frenchCalendarDay(deposit) };
    }
  }

  if (allActDates.length === 0) return { filingDate: null, slugDate: null };
  const earliest = allActDates.reduce((min, d) => (d.getTime() < min.getTime() ? d : min));
  return { filingDate: earliest, slugDate: frenchCalendarDay(earliest) };
}
