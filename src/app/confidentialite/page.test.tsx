import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ConfidentialitePage from "./page";

describe("page confidentialité : YouTube", () => {
  const html = renderToStaticMarkup(<ConfidentialitePage />);

  it("annonce que la vidéo n'est chargée qu'au clic, sans requête avant", () => {
    expect(html).toMatch(/Vidéos YouTube/);
    expect(html).toMatch(/Lire la vidéo/);
    expect(html).toMatch(/aucune requête n&#x27;est envoyée à YouTube/);
  });

  it("cite YouTube (Google) parmi les destinataires et prestataires", () => {
    const recipients = html.slice(html.indexOf("Destinataires et prestataires"));
    expect(recipients).toMatch(/YouTube \(Google\)/);
  });

  it("précise que la fermeture du bandeau reste dans le navigateur", () => {
    expect(html).toMatch(/bandeau/i);
    expect(html).toMatch(/stockage local/i);
  });
});
