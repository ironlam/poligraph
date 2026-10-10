"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function GouvernementsError({
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
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <h1 className="mb-3 font-display text-3xl font-extrabold tracking-tight">
        Service indisponible
      </h1>
      <p className="mb-8 max-w-md text-muted-foreground">
        Les données n&apos;ont pas pu être chargées. Cela ne signifie pas que la composition est
        vide.
      </p>
      <div className="flex flex-col items-center gap-3 sm:flex-row">
        <Button onClick={reset} className="min-h-11">
          <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
          Réessayer
        </Button>
        <Button variant="outline" asChild className="min-h-11">
          <Link href="/politiques">Voir les responsables politiques</Link>
        </Button>
      </div>
    </div>
  );
}
