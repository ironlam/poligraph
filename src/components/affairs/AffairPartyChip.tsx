import Link from "next/link";

/**
 * Party chip tinted by the party's own colour, theme-safe by construction: the
 * hue rides a solid dot and a low tint mixed toward var(--card), while the label
 * stays var(--foreground) so it reads in both themes (no ensureContrast guess
 * against a single background, no colour-only signal). Renders as a link when a
 * slug is given, a span otherwise.
 */
interface AffairPartyChipProps {
  name: string;
  shortName: string;
  color: string | null;
  href?: string;
  /** Append "à l'époque" when the party differs from the politician's current one. */
  atTime?: boolean;
  className?: string;
}

export function AffairPartyChip({
  name,
  shortName,
  color,
  href,
  atTime = false,
  className = "",
}: AffairPartyChipProps) {
  const tint = color
    ? {
        backgroundColor: `color-mix(in oklch, ${color} 12%, var(--card))`,
        borderColor: `color-mix(in oklch, ${color} 32%, var(--border))`,
      }
    : undefined;

  const label = shortName && shortName !== name ? `${name} (${shortName})` : name;

  const inner = (
    <span
      className="inline-flex min-h-[1.75rem] items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold text-foreground"
      style={tint}
    >
      {color && (
        <span
          aria-hidden="true"
          className="inline-block size-2 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
        />
      )}
      {label}
      {atTime && <span className="font-normal text-muted-foreground">à l&apos;époque</span>}
    </span>
  );

  if (href) {
    return (
      <Link
        href={href}
        className={`inline-flex rounded-full outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${className}`}
      >
        {inner}
      </Link>
    );
  }

  return <span className={className}>{inner}</span>;
}
