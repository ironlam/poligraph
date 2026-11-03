import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ScrutinVideoLayout } from "./ScrutinVideoLayout";

function renderLayout(videoId: string | null) {
  return render(
    <ScrutinVideoLayout videoId={videoId} videoTitle="Un vote" header={<h1>En-tête du scrutin</h1>}>
      <p>Résultat officiel</p>
    </ScrutinVideoLayout>
  );
}

describe("ScrutinVideoLayout", () => {
  it("sans vidéo : en-tête, contenu et bandeau, pas de lecteur", () => {
    renderLayout(null);
    expect(screen.getByText("En-tête du scrutin")).toBeInTheDocument();
    expect(screen.getByText("Résultat officiel")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /s'abonner à la chaîne/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /lire la vidéo/i })).toBeNull();
  });

  it("avec vidéo : le lecteur remplace le bandeau", () => {
    renderLayout("abcdefghijk");
    expect(screen.getByRole("button", { name: /lire la vidéo/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /s'abonner à la chaîne/i })).toBeNull();
  });

  it("ordre du document : en-tête, puis vidéo, puis contenu (lecture mobile)", () => {
    renderLayout("abcdefghijk");
    const header = screen.getByText("En-tête du scrutin");
    const video = screen.getByRole("button", { name: /lire la vidéo/i });
    const content = screen.getByText("Résultat officiel");
    expect(header.compareDocumentPosition(video) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(video.compareDocumentPosition(content) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
