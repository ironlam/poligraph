"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AdminError({
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
        Erreur dans l&apos;administration
      </h1>
      <p className="text-muted-foreground max-w-md mb-8">
        Une erreur est survenue dans cette page d&apos;administration. Vous pouvez réessayer ou
        revenir au tableau de bord.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 items-center">
        <Button onClick={reset}>
          <RotateCcw className="h-4 w-4 mr-2" aria-hidden="true" />
          Réessayer
        </Button>
        <Button variant="outline" asChild>
          <Link href="/admin">Retour au tableau de bord</Link>
        </Button>
      </div>
    </div>
  );
}
