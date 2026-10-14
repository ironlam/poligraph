import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { ParlementBandeauSearch } from "@/components/parlement/ParlementBandeauSearch";

const SUGGESTIONS = {
  parlementaires: [{ slug: "eric-ciotti", fullName: "Éric Ciotti", role: "Député" }],
  groupes: [{ slug: "udr-17", name: "Union des droites", code: "UDR", chamber: "AN" }],
  scrutins: [],
  dossiers: [],
};

describe("ParlementBandeauSearch", () => {
  beforeEach(() => {
    push.mockClear();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(SUGGESTIONS) })
    );
  });

  it("propose les familles trouvées et mène au choix fait au clavier", async () => {
    render(<ParlementBandeauSearch />);
    const input = screen.getByRole("combobox", {
      name: "Rechercher un parlementaire, un groupe ou un scrutin",
    });
    fireEvent.change(input, { target: { value: "ciotti" } });

    await waitFor(() => expect(input).toHaveAttribute("aria-expanded", "true"));
    expect(screen.getByRole("group", { name: "Parlementaires" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Scrutins" })).toBeNull();

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(push).toHaveBeenCalledWith("/parlement/groupes/udr-17");
  });

  it("présente chaque suggestion comme un vrai lien", async () => {
    render(<ParlementBandeauSearch />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "ciotti" } });
    const option = await screen.findByRole("option", { name: /Éric Ciotti/ });
    expect(option.querySelector("a")).toHaveAttribute("href", "/politiques/eric-ciotti/votes");
  });

  it("n'ouvre pas une suggestion de la saisie précédente pendant qu'on retape", async () => {
    render(<ParlementBandeauSearch />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "ciotti" } });
    await waitFor(() => expect(input).toHaveAttribute("aria-expanded", "true"));
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.change(input, { target: { value: "ciotti retraites" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(push).not.toHaveBeenCalled();
    expect(input).toHaveAttribute("aria-expanded", "false");
  });

  it("reste un formulaire GET vers les scrutins, sans liste ouverte", () => {
    render(<ParlementBandeauSearch />);
    const form = screen.getByRole("search");
    expect(form).toHaveAttribute("action", "/parlement/votes");
    expect(screen.getByRole("combobox")).toHaveAttribute("name", "search");
    expect(screen.getByRole("combobox")).toHaveAttribute("aria-expanded", "false");
  });
});
