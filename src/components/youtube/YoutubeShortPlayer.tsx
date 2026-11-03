"use client";

import { useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";

interface YoutubeShortPlayerProps {
  videoId: string;
  title: string;
}

// Aucune requête vers YouTube avant le clic : pas d'image d'aperçu, l'iframe n'existe qu'ensuite.
export function YoutubeShortPlayer({ videoId, title }: YoutubeShortPlayerProps) {
  const [playing, setPlaying] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Le bouton disparaît au clic : sans cela, le focus clavier retombe sur le corps de la page.
  useEffect(() => {
    if (playing) iframeRef.current?.focus();
  }, [playing]);

  return (
    <section aria-label="Vidéo de la chaîne Poligraph" className="w-full max-w-[320px]">
      <div className="relative aspect-[9/16] overflow-hidden rounded-lg bg-[#002654]">
        {playing ? (
          <iframe
            ref={iframeRef}
            title={title}
            src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`}
            allow="autoplay; encrypted-media"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            className="absolute inset-0 size-full border-0"
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-white"
          >
            <Play className="size-12" aria-hidden="true" />
            <span className="text-sm font-medium">Lire la vidéo</span>
          </button>
        )}
      </div>
      <a
        href={`https://www.youtube.com/shorts/${videoId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-block text-sm text-primary hover:underline"
      >
        Voir sur YouTube
        <span className="sr-only"> (ouvre un nouvel onglet)</span>
      </a>
    </section>
  );
}
