"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AffairesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
      <h1 className="text-3xl font-display font-extrabold tracking-tight mb-3">
        Une erreur est survenue
      </h1>
      <p className="text-muted-foreground max-w-md mb-8">
        Impossible d&apos;afficher cette page. Vous pouvez réessayer ou revenir à la liste des
        affaires.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 items-center">
        <Button onClick={reset}>
          <RotateCcw className="h-4 w-4 mr-2" aria-hidden="true" />
          Réessayer
        </Button>
        <Button variant="outline" asChild>
          <Link href="/affaires">Voir toutes les affaires</Link>
        </Button>
      </div>
    </div>
  );
}
