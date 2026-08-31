import Link from "next/link";
import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { db } from "@/lib/db";
import { ReaderGuideAdmin } from "./ReaderGuideAdmin";

export const metadata = {
  title: "Repères des mesures (admin) | Poligraph",
  robots: { index: false },
};

export default async function ReaderGuidesAdminPage() {
  if (!(await isAuthenticated())) redirect("/admin/login");
  const guides = await db.measureReaderGuide.findMany({
    orderBy: [{ publicationStatus: "asc" }, { label: "asc" }],
    select: {
      id: true,
      slug: true,
      label: true,
      definition: true,
      aliases: true,
      active: true,
      sourceKind: true,
      sourceUrl: true,
      sourceLabel: true,
      sourcePublisher: true,
      sourceRevisionId: true,
      publicationStatus: true,
    },
  });
  return (
    <div className="space-y-6">
      <header>
        <Link
          href="/admin/mesures"
          className="inline-flex min-h-11 items-center text-sm font-bold text-primary underline"
        >
          Retour aux mesures
        </Link>
        <h1 className="font-display text-2xl font-bold tracking-tight">Repères pour comprendre</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Définitions réutilisables, sourcées et validées indépendamment des suggestions produites
          pour chaque mesure.
        </p>
      </header>
      <ReaderGuideAdmin guides={guides} />
    </div>
  );
}
