import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { getPrioritesData } from "@/lib/data/priorites";
import { PRESIDENTIELLE_2027_SLUG } from "@/lib/presidentielle/themes";
import { formatDate } from "@/lib/utils";
import { PrioritesGate } from "./_components/PrioritesGate";

// ISR: 24h backstop. Publishing or withdrawing a measure busts election-measures:<id> on demand,
// which is what actually moves the eligibility calculation.
export const revalidate = 86400;

/**
 * `robots: noindex` is unconditional here, and that is not a shortcut.
 *
 * The page has exactly one state today: the eligibility calculation. The distribution itself is not
 * built, because its editorial prerequisites (a published segmentation doctrine, a corpus of the
 * same nature) are not met and no amount of data satisfies them. Deriving robots from
 * `data.publishable` would therefore let a future flag flip send a page reading "corpus encore
 * insuffisant" into the index. The day the distribution ships, this returns to following
 * `isPrioritesPublishable`, and `data.publishable` already carries that answer.
 */
export const metadata: Metadata = {
  title: "Où chacun met l'accent : priorités des candidats | Poligraph",
  description:
    "La part du programme de chaque candidature consacrée à chaque thème, et les conditions à réunir avant de pouvoir la comparer.",
  robots: { index: false, follow: true },
  alternates: { canonical: "/elections/presidentielle-2027/priorites" },
};

export default async function PrioritesPage() {
  const data = await getPrioritesData(PRESIDENTIELLE_2027_SLUG);
  if (data === null) notFound();

  // Computed outside the cached read on purpose: a `new Date()` inside a "use cache" boundary would
  // freeze the day the entry was created and go on displaying it for as long as the cache lives.
  const evaluatedAt = formatDate(new Date());

  return (
    <div className="container mx-auto space-y-8 px-4 pt-4 pb-8">
      <Breadcrumb
        items={[
          { label: "Élections", href: "/elections" },
          { label: "Présidentielle 2027", href: "/elections/presidentielle-2027" },
          { label: "Priorités" },
        ]}
      />
      <PrioritesGate data={data} evaluatedAt={evaluatedAt} />
    </div>
  );
}
