import Link from "next/link";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HexPattern } from "@/components/ui/HexPattern";
import { Logo } from "@/components/layout/Logo";

export default function NotFound() {
  return (
    <div className="relative flex flex-col items-center justify-center min-h-[70vh] px-4 text-center bg-gradient-to-br from-primary/5 via-background to-accent/10">
      <HexPattern className="absolute inset-0 text-primary opacity-[0.03] dark:opacity-[0.05] pointer-events-none" />
      <div className="relative z-10 flex flex-col items-center">
        <Logo size={80} className="mb-6" />
        <h1 className="text-4xl font-display font-extrabold tracking-tight mb-3">
          Page introuvable
        </h1>
        <p className="text-muted-foreground max-w-md mb-8">
          La page que vous recherchez n&apos;existe pas ou a été déplacée.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 items-center">
          <Button asChild>
            <Link href="/">Retour à l&apos;accueil</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/recherche">
              <Search className="h-4 w-4 mr-2" aria-hidden="true" />
              Rechercher
            </Link>
          </Button>
          <Button variant="link" asChild>
            <Link href="/politiques">Explorer les représentants</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
