import Link from "next/link";
import { ChevronRight, Landmark, Vote, UserRound } from "lucide-react";

interface Acces {
  href: string;
  title: string;
  detail: string;
  icon: typeof Landmark;
}

/**
 * Shortcuts to the existing sections that answer by territory. Mon député follows its feature
 * flag: a shortcut to a page that answers 404 is a link without a destination.
 */
export function EntreeAccesRapides({ monDepute }: { monDepute: boolean }) {
  const acces: Acces[] = [
    {
      href: "/elections/municipales-2026",
      title: "Municipales 2026",
      detail: "Listes candidates et résultats, commune par commune.",
      icon: Vote,
    },
    ...(monDepute
      ? [
          {
            href: "/mon-depute",
            title: "Mon député",
            detail: "Députés et sénateurs à partir d'un code postal.",
            icon: UserRound,
          },
        ]
      : []),
    {
      href: "/elections/presidentielle-2027",
      title: "Présidentielle 2027",
      detail: "Candidatures déclarées et mesures des programmes, avec leurs sources.",
      icon: Landmark,
    },
  ];

  return (
    <section aria-labelledby="acces-rapides-titre">
      <h2 id="acces-rapides-titre" className="font-display text-2xl font-extrabold text-primary">
        Accès rapides
      </h2>
      <ul className="mt-4 grid gap-3 md:grid-cols-3">
        {acces.map(({ href, title, detail, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className="flex h-full min-h-11 items-start gap-3 rounded-xl border border-border bg-card p-4 hover:border-primary/40 hover:bg-muted/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <span
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
                aria-hidden="true"
              >
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-display text-lg font-bold text-primary">{title}</span>
                <span className="mt-1 block text-sm text-muted-foreground">{detail}</span>
              </span>
              <ChevronRight
                className="mt-1 h-4 w-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
