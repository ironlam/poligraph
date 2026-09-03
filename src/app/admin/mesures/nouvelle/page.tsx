import Link from "next/link";
import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { NewMeasureForm } from "../_components/NewMeasureForm";
import { listPresidentialCandidacies } from "../_data/candidacies-query";

export const metadata = {
  title: "Nouvelle mesure (admin)",
  robots: { index: false },
};

export default async function NewMeasurePage() {
  // Same reason as the other two screens: the admin layout renders its children when the visitor is
  // not authenticated, so a page without its own guard is served to anonymous requests.
  if (!(await isAuthenticated())) redirect("/admin/login");

  const candidacies = await listPresidentialCandidacies();

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <Link href="/admin/mesures" prefetch={false} className="text-sm text-primary underline">
          Retour à la file
        </Link>
        <h1 className="font-display text-2xl font-bold tracking-tight">Nouvelle mesure</h1>
        <p className="text-sm text-muted-foreground">
          À partir d&apos;une candidature, qui fournit le politicien et l&apos;élection. Les
          candidatures sont listées par ordre alphabétique.
        </p>
      </header>

      <NewMeasureForm candidacies={candidacies} />
    </div>
  );
}
