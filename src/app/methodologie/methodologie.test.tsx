import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OFFICIAL_SOURCE_HOSTS, PRESS_SOURCE_HOSTS } from "@/lib/affairs/events/sources";
import MethodologiePage, { metadata as indexMetadata } from "./page";
import PresidentialMeasuresMethodologyPage, {
  metadata as measuresMetadata,
} from "./mesures-presidentielle-2027/page";
import MediaSourcesMethodologyPage, {
  metadata as mediaSourcesMetadata,
} from "./sources-medias/page";

describe("pages de méthodologie", () => {
  it("présente la méthodologie générale comme une entrée par domaine", () => {
    const { container } = render(<MethodologiePage />);

    expect(indexMetadata.title).toBe("Méthodologie de Poligraph");
    expect(screen.getByRole("link", { name: /Mesures de la présidentielle 2027/ })).toHaveAttribute(
      "href",
      "/methodologie/mesures-presidentielle-2027"
    );
    expect(
      screen.getByRole("heading", { name: "Candidatures à la présidentielle 2027" })
    ).toBeInTheDocument();
    expect(screen.getByText(/ne constituent pas la liste officielle/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ministère de l’Intérieur" })).toHaveAttribute(
      "target",
      "_blank"
    );
    expect(container.querySelector("#comment-nous-comptons")).toBeInTheDocument();
  });

  it("explique la chaîne éditoriale des mesures sur une URL canonique dédiée", () => {
    render(<PresidentialMeasuresMethodologyPage />);

    expect(measuresMetadata.alternates?.canonical).toBe(
      "/methodologie/mesures-presidentielle-2027"
    );
    expect(
      screen.getByRole("heading", { name: "Comment les mesures sont documentées" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Extraction, relecture et publication" })
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Thèmes et sous-thèmes" })).toBeInTheDocument();
    expect(screen.getByText(/site institutionnel officiel/)).toBeInTheDocument();
    expect(screen.getByText(/chaque affirmation est rattachée aux extraits/)).toBeInTheDocument();
    expect(screen.queryByText("Objectif quantifié")).not.toBeInTheDocument();
    expect(
      screen.getByText(/Elle ne prouve pas qu'une proposition n'existe pas/)
    ).toBeInTheDocument();
  });

  it("décrit séparément les condamnations définitives et non définitives", () => {
    render(<MethodologiePage />);

    expect(
      screen.getByRole("heading", { name: "Condamnations définitives (comptabilisées)" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Condamnations non définitives (comptabilisées à part)" })
    ).toBeInTheDocument();
    expect(screen.queryByText("Condamnations (comptabilisées)")).not.toBeInTheDocument();
  });

  it("affiche les listes de sources admises telles que le contrôle des étapes les lit", () => {
    render(<MediaSourcesMethodologyPage />);

    expect(mediaSourcesMetadata.alternates?.canonical).toBe("/methodologie/sources-medias");
    const official = screen.getByRole("list", { name: "Sources officielles admises" });
    const press = screen.getByRole("list", { name: "Médias admis" });
    expect(
      within(official)
        .getAllByRole("listitem")
        .map((li) => li.textContent)
        .sort()
    ).toEqual([...OFFICIAL_SOURCE_HOSTS].sort());
    expect(
      within(press)
        .getAllByRole("listitem")
        .map((li) => li.textContent)
        .sort()
    ).toEqual([...PRESS_SOURCE_HOSTS].sort());
    expect(
      screen.getByRole("heading", { name: `Médias (${PRESS_SOURCE_HOSTS.length} adresses)` })
    ).toBeInTheDocument();
  });

  it("rend la page des médias admis accessible depuis la méthodologie et le sitemap", () => {
    render(<MethodologiePage />);

    expect(screen.getByRole("link", { name: /Médias admis comme sources/ })).toHaveAttribute(
      "href",
      "/methodologie/sources-medias"
    );
    const sitemapSource = readFileSync(join(process.cwd(), "src/app/sitemap.ts"), "utf8");
    expect(sitemapSource).toContain("url: `${SITE_URL}/methodologie/sources-medias`");
  });
});
