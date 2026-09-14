import Link from "next/link";

export function DossierAliasChoices({
  matches,
}: {
  matches: { id: string; slug: string | null; title: string; number: string | null }[];
}) {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold">Nom d’usage partagé : choisir un dossier</h1>
      <p>Consultez les dossiers législatifs associés à ce nom d’usage.</p>
      <ul>
        {matches.map((match) => (
          <li key={match.id}>
            <Link
              prefetch={false}
              className="inline-flex min-h-11 items-center underline"
              href={`/parlement/dossiers/${match.slug || match.id}`}
            >
              {match.title}
              {match.number ? ` (${match.number})` : ""}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
