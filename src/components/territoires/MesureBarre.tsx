/**
 * One measure of a Territoires block: label and value on one line, a navy bar under them. Server
 * component. The bar only repeats the written value, so it is hidden from assistive technology;
 * a figure that is not established gets no bar and its reason in words, never a zero.
 */
export function MesureBarre({
  label,
  valeur,
  ratio,
  detail,
  nonEtabli,
}: {
  label: string;
  /** Written value, e.g. "934 €". Null when not established. */
  valeur: string | null;
  /** Share of the bar, 0 to 1, on the scale the block chose. */
  ratio: number | null;
  /** Second line, e.g. the total amount. */
  detail?: string | null;
  /** Reason shown in place of a figure that is not established. */
  nonEtabli?: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-sm">{label}</span>
        {valeur !== null && <b className="font-display tabular-nums">{valeur}</b>}
      </div>
      {valeur !== null && ratio !== null && (
        <div aria-hidden="true" className="h-2 overflow-hidden rounded bg-primary/15">
          <div
            className="h-full rounded bg-primary"
            style={{ width: `${Math.round(Math.min(1, Math.max(0, ratio)) * 100)}%` }}
          />
        </div>
      )}
      {detail && <p className="text-xs text-muted-foreground tabular-nums">{detail}</p>}
      {valeur === null && (
        <p className="text-xs text-muted-foreground">{nonEtabli ?? "Non établi."}</p>
      )}
    </div>
  );
}
