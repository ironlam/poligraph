"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { YOUTUBE_CHANNEL_URL } from "@/config/youtube";

const DISMISS_KEY = "youtube-banner-dismissed";

function wasDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberDismissal(): void {
  try {
    window.localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // Stockage indisponible : le bandeau se ferme pour cette page seulement.
  }
}

// Pictogramme décoratif : le bouton à côté porte déjà le sens pour les lecteurs d'écran.
function YoutubeLogo() {
  return (
    <svg
      data-testid="youtube-logo"
      aria-hidden="true"
      viewBox="0 0 28 20"
      className="h-12 w-[67px] shrink-0 sm:h-14 sm:w-[78px]"
    >
      <rect width="28" height="20" rx="5" fill="#FF0000" />
      <path d="M11 5.5 19 10l-8 4.5Z" fill="#FFFFFF" />
    </svg>
  );
}

// Visible dès le rendu serveur : un nouveau visiteur ne voit aucun décalage de la page.
// Au montage, on le masque s'il a déjà été fermé.
export function YoutubeBanner() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (wasDismissed()) setVisible(false);
  }, []);

  if (!visible) return null;

  return (
    <aside
      aria-label="Chaîne YouTube Poligraph"
      className="relative rounded-lg border bg-white p-4 pr-12 text-neutral-900 shadow-sm sm:flex sm:items-center sm:gap-6"
    >
      <YoutubeLogo />
      <div className="mt-3 sm:mt-0 sm:flex-1">
        <p className="font-display text-base font-bold">Poligraph est sur YouTube</p>
        <p className="mt-1 text-sm text-neutral-700">
          Nous y expliquons un vote en une minute, sources à l&apos;écran. Si les vidéos vous
          servent, un abonnement, un like ou un commentaire aident la chaîne à être vue, et le
          projet à continuer.
        </p>
      </div>
      <Button asChild className="mt-3 sm:mt-0 sm:shrink-0">
        <a href={YOUTUBE_CHANNEL_URL} target="_blank" rel="noopener noreferrer">
          S&apos;abonner à la chaîne
          <span className="sr-only"> (ouvre un nouvel onglet)</span>
        </a>
      </Button>
      <button
        type="button"
        aria-label="Fermer le bandeau"
        onClick={() => {
          rememberDismissal();
          setVisible(false);
        }}
        className="absolute right-2 top-2 rounded-md p-2 text-neutral-600 hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </aside>
  );
}
