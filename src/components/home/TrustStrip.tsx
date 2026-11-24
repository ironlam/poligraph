import Link from "next/link";

const LINK_CLASS =
  "inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-4 hover:no-underline";

export function TrustStrip() {
  return (
    <section className="text-sm text-muted-foreground">
      <h2 className="font-display text-base font-bold text-foreground">
        D{"'"}où viennent nos données
      </h2>
      <p className="mt-1 max-w-3xl">
        Données publiques de l{"'"}Assemblée nationale, du Sénat, du Parlement européen et de la
        HATVP, complétées par des sources de presse vérifiées.
      </p>
      <p className="flex flex-wrap gap-x-6">
        <Link href="/sources" className={LINK_CLASS}>
          Sources et principes
        </Link>
        <Link href="/methodologie" className={LINK_CLASS}>
          Méthodologie
        </Link>
      </p>
    </section>
  );
}
