import { getCandidates2027ForModeration } from "@/lib/data/candidates";
import { CandidatesListClient } from "./CandidatesListClient";

export const metadata = {
  title: "Candidats présidentielle 2027 (admin) | Poligraph",
  robots: { index: false },
};

export default async function AdminCandidatsPage() {
  const candidates = await getCandidates2027ForModeration();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-display font-bold tracking-tight">
          Candidats présidentielle 2027
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {candidates.length} candidatures enregistrées. Ajouter, modifier le slogan ou le rang, ou
          retirer un candidat.
        </p>
      </header>

      <CandidatesListClient initialCandidates={candidates} />

      <p className="text-xs text-muted-foreground">
        Note : cette page est admin-only. La surface publique{" "}
        <code>/elections/presidentielle-2027</code> existe, et elle reste hors des index tant que
        ses seuils de publication ne sont pas franchis.
      </p>
    </div>
  );
}
