import type { Metadata } from "next";
import { Rss } from "lucide-react";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { getPublishedChangelog } from "@/lib/data/changelog";
import { ChangelogList } from "./_components/ChangelogList";

export const metadata: Metadata = {
  title: "Journal des évolutions",
  description:
    "Nouvelles pages, corrections et mises à jour de données de Poligraph, chaque entrée avec sa source.",
  alternates: { canonical: "/changelog", types: { "application/rss+xml": "/changelog/rss.xml" } },
};

export default async function ChangelogPage() {
  const entries = await getPublishedChangelog();

  return (
    <>
      <Breadcrumb items={[{ label: "Journal des évolutions" }]} />
      <div className="container mx-auto max-w-4xl space-y-8 px-4 pb-16">
        <header className="max-w-2xl space-y-3">
          <h1 className="font-display text-4xl font-extrabold tracking-tight text-primary">
            Ce qui change sur Poligraph
          </h1>
          <p className="text-lg">
            Nouvelles pages, corrections et mises à jour de données. Chaque entrée renvoie à sa
            source : vous pouvez vérifier ce qui a été modifié, et quand.
          </p>
          <a
            href="/changelog/rss.xml"
            className="inline-flex min-h-11 items-center gap-2 text-sm text-primary hover:underline"
          >
            <Rss className="h-4 w-4" aria-hidden="true" />
            S&apos;abonner au flux RSS
          </a>
        </header>
        <ChangelogList entries={entries} />
      </div>
    </>
  );
}
