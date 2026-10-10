// Jour calendaire des horodatages `Mandate` (startDate, endDate, lastConfirmedAt).
// Ces colonnes sont des `timestamp` sans fuseau, enregistrés pour la plupart à minuit heure de
// Paris (22:00 ou 23:00 UTC) : leur jour est la date calendaire à Paris, pas en UTC.
// Les colonnes `@db.Date` reviennent à 00:00 UTC et se lisent en UTC (`toDay` de mapping.ts).

const PARIS_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Paris",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const PARIS_TIME = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Paris",
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** `YYYY-MM-DD` du jour à Paris contenant cet instant. */
export function parisDay(d: Date): string {
  return PARIS_DAY.format(d);
}

// Écart (ms) entre l'heure murale de Paris et l'UTC à cet instant.
function parisOffset(instant: number): number {
  const parts = Object.fromEntries(
    PARIS_TIME.formatToParts(new Date(instant)).map((p) => [p.type, p.value])
  );
  const wall = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return wall - Math.floor(instant / 1000) * 1000;
}

/** Instant UTC de 00:00 heure de Paris le jour `YYYY-MM-DD`, changement d'heure compris. */
export function parisMidnight(day: string): Date {
  const utcMidnight = Date.parse(`${day}T00:00:00Z`);
  let instant = utcMidnight - parisOffset(utcMidnight);
  // Le décalage peut changer entre les deux instants (jour de changement d'heure).
  instant = utcMidnight - parisOffset(instant);
  return new Date(instant);
}
