import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { themeToSlug } from "@/lib/theme-utils";
import { themeSeoPhrase } from "@/lib/seo/theme-metadata";
import type { ThemeCategory } from "@/generated/prisma";

interface ThemeVotesLinkProps {
  theme: ThemeCategory;
  className?: string;
}

/**
 * Contextual link from a themed surface (scrutin page, dossier) to its thematic
 * landing, with a descriptive anchor ("Voir tous les votes sur la santé") rather
 * than the bare label already carried by the theme badge.
 */
export function ThemeVotesLink({ theme, className }: ThemeVotesLinkProps) {
  return (
    <Button
      asChild
      variant="outline"
      size="lg"
      className={`h-auto min-h-11 max-w-full shrink whitespace-normal py-2 text-center ${className ?? ""}`}
    >
      <Link href={`/parlement/votes/themes/${themeToSlug(theme)}`}>
        Voir tous les votes sur {themeSeoPhrase(theme)}
        <ArrowRight aria-hidden="true" />
      </Link>
    </Button>
  );
}
