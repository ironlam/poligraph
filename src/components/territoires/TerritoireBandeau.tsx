import Link from "next/link";
import { BRAND_NAVY } from "@/config/brand";
import { BandeauFilAriane, RubriqueBandeau } from "@/components/ui/RubriqueBandeau";
import type { PhraseSegment } from "@/lib/territoires/commune-bandeau";
import { cn } from "@/lib/utils";

export interface BandeauFait {
  /** Names the fact for screen readers; the legend carries it visually. */
  label: string;
  valeur: string;
  /** Shorter value shown on a phone, where the three facts share one line. */
  valeurCourte?: string;
  /** Unit, period and producer of the value, or the absence said in words. */
  legende: string;
  /** Shorter legend shown on a phone; screen readers keep the full one. */
  legendeCourte?: string;
  /** External page of the source: the whole cell becomes the link. */
  sourceHref?: string;
}

export interface TerritoireBandeauProps {
  titreId: string;
  filAriane: { label: string; href?: string }[];
  nom: string;
  /** Official code of the territory, drawn as a large decorative outline figure. */
  code: string;
  /** Line under the name; the code stays written here, in text. */
  identite: string;
  phrase: PhraseSegment[];
  faits: BandeauFait[];
  action?: { label: string; href: string };
  /** Decorative outline of the territory, shown from md up. */
  silhouette?: React.ReactNode;
}

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

/** Short text on a phone, full text from sm up and for screen readers at every width. */
function Abrege({ court, complet }: { court?: string; complet: string }) {
  if (!court) return complet;
  return (
    <>
      <span aria-hidden="true" className="sm:hidden">
        {court}
      </span>
      <span className="max-sm:sr-only">{complet}</span>
    </>
  );
}

function Fait({ fait }: { fait: BandeauFait }) {
  const content = (
    <>
      <span className="block font-display text-sm font-bold leading-tight sm:text-xl">
        <Abrege court={fait.valeurCourte} complet={fait.valeur} />
      </span>
      <span
        className={cn(
          "mt-1 block text-[11px] leading-snug text-white/85 sm:text-xs",
          fait.sourceHref && "underline decoration-white/40 underline-offset-2"
        )}
      >
        <Abrege court={fait.legendeCourte} complet={fait.legende} />
      </span>
    </>
  );
  const box = "block h-full px-2 py-2 sm:px-4 sm:py-3";
  return (
    <div className="relative min-w-0">
      <dt className="sr-only">{fait.label}</dt>
      <dd className="h-full">
        {fait.sourceHref ? (
          <a
            href={fait.sourceHref}
            target="_blank"
            rel="noopener noreferrer"
            className={`${box} hover:bg-white/10 ${FOCUS}`}
          >
            {content}
            <span className="sr-only"> (source, nouvel onglet)</span>
          </a>
        ) : (
          <div className={box}>{content}</div>
        )}
      </dd>
    </div>
  );
}

/**
 * Banner shared by the Territoires pages: short trail, name, one answer sentence, three sourced
 * facts on one line. Wording comes from the caller; nothing is derived here.
 */
export function TerritoireBandeau(props: TerritoireBandeauProps) {
  return (
    <RubriqueBandeau labelledBy={props.titreId} contentClassName="max-w-6xl sm:py-8">
      <div className="flex gap-8">
        <div className="relative min-w-0 flex-1">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-0 top-0 select-none font-display text-4xl font-extrabold leading-none text-transparent sm:text-7xl"
            style={{ WebkitTextStroke: "1px rgb(255 255 255 / 0.3)" }}
          >
            {props.code}
          </span>
          <div className="relative">
            <BandeauFilAriane items={props.filAriane} />
            <h1
              id={props.titreId}
              className="break-words font-display text-3xl font-extrabold tracking-tight sm:mt-2 md:text-5xl"
            >
              {props.nom}
            </h1>
            <p className="mt-1 text-sm text-white/85">{props.identite}</p>
            <p className="mt-3 max-w-2xl sm:text-lg">
              {props.phrase.map((segment, i) =>
                segment.href ? (
                  // Vertical padding on an inline box widens the touch target, not the line.
                  <Link
                    key={i}
                    href={segment.href}
                    prefetch={false}
                    className={`py-3 font-bold underline underline-offset-4 ${FOCUS}`}
                  >
                    {segment.text}
                  </Link>
                ) : (
                  segment.text
                )
              )}
            </p>
            <dl className="mt-4 grid grid-cols-3 divide-x divide-white/20 overflow-hidden rounded-xl border border-white/20 bg-white/5">
              {props.faits.map((fait) => (
                <Fait key={fait.label} fait={fait} />
              ))}
            </dl>
            {props.action && (
              <Link
                href={props.action.href}
                prefetch={false}
                className={`mt-5 hidden min-h-11 items-center rounded-lg bg-white px-4 text-sm font-semibold sm:inline-flex ${FOCUS}`}
                style={{ color: BRAND_NAVY }}
              >
                {props.action.label}
              </Link>
            )}
          </div>
        </div>
        {props.silhouette}
      </div>
    </RubriqueBandeau>
  );
}
