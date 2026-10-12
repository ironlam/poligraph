import Link from "next/link";
import { TERRITOIRES_PATH } from "@/lib/territoires/paths";

export default function CommuneElectionsNotFound() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-16">
      <h1 className="font-display text-3xl font-extrabold tracking-tight">
        Aucun résultat d{"'"}élection enregistré
      </h1>
      <p className="mt-3 text-muted-foreground">
        Poligraph n{"'"}a pas encore de résultat de scrutin pour cette commune. Un scrutin n{"'"}
        apparaît ici qu{"'"}une fois ses résultats importés depuis les fichiers officiels.
      </p>
      <Link
        href={TERRITOIRES_PATH}
        prefetch={false}
        className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"
      >
        Chercher une commune
      </Link>
    </div>
  );
}
