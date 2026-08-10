import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SourceLine } from "../SourceLine";

describe("SourceLine", () => {
  it("accorde le libellé au nombre de sources", () => {
    const { unmount } = render(<SourceLine sources={[{ label: "Sénat" }]} />);
    expect(screen.getByText(/^Source :/)).toBeInTheDocument();
    unmount();

    render(<SourceLine sources={[{ label: "Sénat" }, { label: "HATVP" }]} />);
    expect(screen.getByText(/^Sources :/)).toBeInTheDocument();
  });

  it("ouvre un lien externe dans un nouvel onglet, en le disant", () => {
    render(<SourceLine sources={[{ label: "Sénat", url: "https://www.senat.fr/" }]} />);
    const link = screen.getByRole("link", { name: /Sénat/ });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(link).toHaveAttribute("rel", expect.stringContaining("noreferrer"));
    expect(link.getAttribute("aria-label")).toMatch(/nouvel onglet/);
  });

  it("laisse un lien interne en navigation normale", () => {
    render(<SourceLine sources={[{ label: "Méthodologie", url: "/methodologie" }]} />);
    const link = screen.getByRole("link", { name: "Méthodologie" });
    expect(link).not.toHaveAttribute("target");
  });

  it("rend une source sans URL en texte, pas en lien mort", () => {
    render(<SourceLine sources={[{ label: "Arrêté préfectoral" }]} reportHref={null} />);
    expect(screen.getByText("Arrêté préfectoral")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("date la consultation en français", () => {
    render(<SourceLine sources={[{ label: "Sénat" }]} consultedAt={new Date("2026-08-10")} />);
    expect(screen.getByText(/Consulté le 10 août 2026/)).toBeInTheDocument();
  });

  // formatDate(null) renvoie un tiret cadratin, banni de l'interface : sans date de
  // consultation la mention doit disparaître, pas s'afficher vide.
  it("n'affiche aucune mention de consultation sans date", () => {
    render(<SourceLine sources={[{ label: "Sénat" }]} consultedAt={null} />);
    expect(screen.queryByText(/Consulté le/)).toBeNull();
    expect(screen.queryByText(/—/)).toBeNull();
  });

  it("propose toujours de signaler une erreur, sauf demande explicite", () => {
    const { unmount } = render(<SourceLine sources={[{ label: "Sénat" }]} />);
    expect(screen.getByRole("link", { name: "Signaler une erreur" })).toBeInTheDocument();
    unmount();

    render(<SourceLine sources={[{ label: "Sénat" }]} reportHref={null} />);
    expect(screen.queryByRole("link", { name: "Signaler une erreur" })).toBeNull();
  });

  it("ignore une source au libellé vide plutôt que d'afficher un séparateur orphelin", () => {
    render(<SourceLine sources={[{ label: "  " }, { label: "Sénat" }]} reportHref={null} />);
    expect(screen.getByText(/^Source :/)).toBeInTheDocument();
  });

  it("porte la note méthodologique quand elle est fournie", () => {
    render(
      <SourceLine
        sources={[{ label: "Ministère de l'Intérieur" }]}
        note="Nuances regroupées en blocs"
      />
    );
    expect(screen.getByText("Nuances regroupées en blocs")).toBeInTheDocument();
  });
});
