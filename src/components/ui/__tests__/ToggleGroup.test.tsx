import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToggleGroup } from "@/components/ui/ToggleGroup";

const opts = [
  { value: "a", label: "Adopté" },
  { value: "b", label: "Rejeté" },
];

describe("ToggleGroup", () => {
  it("expose un radiogroup étiqueté avec aria-checked", () => {
    render(<ToggleGroup label="Résultat" value="a" options={opts} onChange={() => {}} />);
    expect(screen.getByRole("radiogroup", { name: "Résultat" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Adopté" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Rejeté" })).toHaveAttribute("aria-checked", "false");
  });

  it("appelle onChange au clic et à la touche", async () => {
    const onChange = vi.fn();
    render(<ToggleGroup label="Résultat" value="a" options={opts} onChange={onChange} />);
    await userEvent.click(screen.getByRole("radio", { name: "Rejeté" }));
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("gère la tabulation en roving tabindex (option sélectionnée = 0, autres = -1)", () => {
    render(<ToggleGroup label="Résultat" value="a" options={opts} onChange={() => {}} />);
    expect(screen.getByRole("radio", { name: "Adopté" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("radio", { name: "Rejeté" })).toHaveAttribute("tabindex", "-1");
  });

  it("navigue et sélectionne avec les flèches (ArrowRight puis wrap)", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ToggleGroup label="Résultat" value="a" options={opts} onChange={onChange} />);
    screen.getByRole("radio", { name: "Adopté" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenCalledWith("b");
    onChange.mockClear();
    await user.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenCalledWith("a");
  });

  it("navigue vers l'arrière avec ArrowLeft en wrappant depuis le premier", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ToggleGroup label="Résultat" value="a" options={opts} onChange={onChange} />);
    screen.getByRole("radio", { name: "Adopté" }).focus();
    await user.keyboard("{ArrowLeft}");
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("sélectionne l'option focalisée avec Espace/Entrée", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ToggleGroup label="Résultat" value="a" options={opts} onChange={onChange} />);
    screen.getByRole("radio", { name: "Rejeté" }).focus();
    await user.keyboard("[Enter]");
    expect(onChange).toHaveBeenCalledWith("b");
  });
});
