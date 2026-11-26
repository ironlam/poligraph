import Link from "next/link";
import { PoliticianCreateForm } from "@/components/admin/PoliticianCreateForm";

export default function NewPoliticianPage() {
  return (
    <div className="max-w-3xl">
      <Link
        href="/admin/politiques"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        &larr; Retour à la liste
      </Link>
      <h1 className="mb-6 mt-2 text-2xl font-bold">Nouvelle fiche</h1>
      <PoliticianCreateForm />
    </div>
  );
}
