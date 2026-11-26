interface SourceVerdictProps {
  source: string;
  /** The newsroom's own wording, as imported ("Plutôt faux", "C'est plus compliqué", a sentence...). */
  verdict: string;
}

/**
 * The newsroom's verdict, in its own words, under Poligraph's normalised badge.
 *
 * The badge maps every outlet onto one scale ("C'est plus compliqué" becomes "Invérifiable",
 * "En partie vrai" becomes "Partiellement vrai"). Showing the original wording keeps the verdict
 * attributed to the newsroom that wrote it, and lets the reader see how it was normalised.
 */
export function SourceVerdict({ source, verdict }: SourceVerdictProps) {
  const text = verdict.trim();
  if (!text) return null;

  const sourceName = source.trim();

  return (
    <p className="mt-3 text-sm text-muted-foreground">
      {sourceName ? (
        <>
          Verdict de <span className="font-medium text-foreground">{sourceName}</span>
        </>
      ) : (
        "Verdict d'origine"
      )}{" "}
      : &laquo;&nbsp;{text}&nbsp;&raquo;
    </p>
  );
}
