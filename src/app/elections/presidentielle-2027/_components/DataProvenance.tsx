import Link from "next/link";

/**
 * What the hub is built from, and where to check the method. No claim of neutrality here
 * (no "sans jugement", no "nous ne classons pas") : the provenance carries that weight on
 * its own.
 */
export function DataProvenance() {
  return (
    <section aria-labelledby="provenance-heading" className="rounded-lg border border-border p-4">
      <h2 id="provenance-heading" className="text-base font-semibold">
        D&apos;où viennent les données
      </h2>
      <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
        <li>Programmes officiels publiés par les candidatures.</li>
        <li>Scrutins publics à l&apos;Assemblée nationale et au Sénat.</li>
        <li>Rapports publics et déclarations sourcées.</li>
      </ul>
      <p className="mt-3 text-sm">
        <Link href="/methodologie" className="underline hover:text-primary">
          Méthode et sources
        </Link>
      </p>
    </section>
  );
}
