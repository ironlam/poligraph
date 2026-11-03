import type { ReactNode } from "react";
import { YoutubeBanner } from "./YoutubeBanner";
import { YoutubeShortPlayer } from "./YoutubeShortPlayer";

interface ScrutinVideoLayoutProps {
  videoId: string | null;
  videoTitle: string;
  header: ReactNode;
  children: ReactNode;
}

// Avec vidéo : à partir de `lg`, l'en-tête et le contenu à gauche, le Short sur les deux rangées de
// droite. En dessous de `lg`, une seule colonne dans l'ordre du document : en-tête, vidéo, contenu.
// Sans vidéo : le bandeau s'intercale entre l'en-tête et le contenu, en pleine largeur.
export function ScrutinVideoLayout({
  videoId,
  videoTitle,
  header,
  children,
}: ScrutinVideoLayoutProps) {
  if (!videoId) {
    return (
      <>
        {header}
        <div className="mb-8">
          <YoutubeBanner />
        </div>
        {children}
      </>
    );
  }

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-x-8">
      <div className="min-w-0 lg:col-start-1 lg:row-start-1">{header}</div>
      <div className="mb-8 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mb-0">
        <YoutubeShortPlayer videoId={videoId} title={videoTitle} />
      </div>
      <div className="min-w-0 lg:col-start-1 lg:row-start-2">{children}</div>
    </div>
  );
}
