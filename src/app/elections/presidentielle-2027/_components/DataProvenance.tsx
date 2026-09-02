import Link from "next/link";

/**
 * What the hub is built from, and where to check the method. No claim of neutrality here
 * (no "sans jugement", no "nous ne classons pas") : the provenance carries that weight on
 * its own.
 */
export function DataProvenance() {
  return (
    <section aria-labelledby="provenance-heading" className="rounded-2xl border border-border p-4">
      <h3 id="provenance-heading" className="text-base font-semibold">
        D&apos;où viennent les données
      </h3>
      <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
        <li>Programmes officiels publiés par les candidatures.</li>
        <li>Scrutins publics à l&apos;Assemblée nationale et au Sénat.</li>
        <li>Rapports publics et déclarations sourcées.</li>
      </ul>
      <p className="mt-3 text-sm">
        <Link
          href="/methodologie/mesures-presidentielle-2027"
          className="inline-flex min-h-11 items-center underline hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Méthode et sources
        </Link>
      </p>
    </section>
  );
}
