"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HexPattern } from "@/components/ui/HexPattern";
import { Logo } from "@/components/layout/Logo";

export default function Error({
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
    <div className="relative flex flex-col items-center justify-center min-h-[70vh] px-4 text-center bg-gradient-to-br from-primary/5 via-background to-accent/10">
      <HexPattern className="absolute inset-0 text-primary opacity-[0.03] dark:opacity-[0.05] pointer-events-none" />
      <div className="relative z-10 flex flex-col items-center">
        <Logo size={80} className="mb-6" />
        <h1 className="text-4xl font-display font-extrabold tracking-tight mb-3">
          Une erreur est survenue
        </h1>
        <p className="text-muted-foreground max-w-md mb-8">
          Quelque chose s&apos;est mal passé. Vous pouvez réessayer ou revenir à l&apos;accueil.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 items-center">
          <Button onClick={reset}>
            <RotateCcw className="h-4 w-4 mr-2" aria-hidden="true" />
            Réessayer
          </Button>
          <Button variant="outline" asChild>
            <Link href="/">Retour à l&apos;accueil</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
