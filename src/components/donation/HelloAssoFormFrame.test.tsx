import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HelloAssoFormFrame } from "./HelloAssoFormFrame";

const props = {
  src: "https://www.helloasso.com/associations/association-sankofa/formulaires/1/widget?view=form",
  title: "Formulaire de don HelloAsso",
  fallbackUrl: "https://www.helloasso.com/associations/association-sankofa/formulaires/1",
};

describe("HelloAssoFormFrame", () => {
  it("ne monte pas l'iframe avant clic en mode requireClick", async () => {
    render(<HelloAssoFormFrame {...props} requireClick onActivate={vi.fn()} />);
    expect(screen.queryByTitle(props.title)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /charger le formulaire/i }));
    expect(screen.getByTitle(props.title)).toBeInTheDocument();
  });
  it("appelle onActivate au clic de chargement", async () => {
    const onActivate = vi.fn();
    render(<HelloAssoFormFrame {...props} requireClick onActivate={onActivate} />);
    await userEvent.click(screen.getByRole("button", { name: /charger le formulaire/i }));
    expect(onActivate).toHaveBeenCalledOnce();
  });
  it("monte l'iframe immédiatement et affiche le fallback si requireClick est faux", () => {
    render(<HelloAssoFormFrame {...props} />);
    expect(screen.getByTitle(props.title)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /ouvrir le formulaire sécurisé sur helloasso/i })
    ).toHaveAttribute("href", props.fallbackUrl);
  });
});
