import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AdminEntityPicker } from "@/components/admin/AdminEntityPicker";

type Result = { id: string; name: string };

beforeEach(() => vi.useRealTimers());

describe("AdminEntityPicker", () => {
  it("debounces, ignores an obsolete response and selects with Enter", async () => {
    let firstResolve: ((value: Result[]) => void) | undefined;
    const search = vi.fn((query: string) =>
      query === "ab"
        ? new Promise<Result[]>((resolve) => {
            firstResolve = resolve;
          })
        : Promise.resolve([{ id: "new", name: "Nouveau résultat" }])
    );
    const onChange = vi.fn();
    render(
      <AdminEntityPicker<Result>
        value={null}
        onChange={onChange}
        search={search}
        resolve={async () => null}
        renderResult={(result) => <span>{result.name}</span>}
        label="Politicien"
        placeholder="Rechercher..."
      />
    );
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "ab" } });
    await waitFor(() => expect(search).toHaveBeenCalledWith("ab", expect.anything()));
    fireEvent.change(input, { target: { value: "abc" } });
    await waitFor(() => expect(search).toHaveBeenCalledWith("abc", expect.anything()));
    firstResolve?.([{ id: "old", name: "Ancien résultat" }]);
    await waitFor(() => expect(screen.queryByText("Ancien résultat")).not.toBeInTheDocument());
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(
      "new",
      expect.objectContaining({ name: "Nouveau résultat" })
    );
  });

  it("supports arrows, Escape and clearing the current value", async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <AdminEntityPicker<Result>
        value="p-1"
        onChange={onChange}
        search={async () => []}
        resolve={async (id) => ({ id, name: "Jean Dupont" })}
        renderResult={(result) => <span>{result.name}</span>}
        label="Politicien"
        placeholder="Rechercher..."
      />
    );
    await waitFor(() => expect(screen.getByText("Jean Dupont")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Effacer la sélection" }));
    expect(onChange).toHaveBeenCalledWith(null, null);
    rerender(
      <AdminEntityPicker<Result>
        value={null}
        onChange={onChange}
        search={async () => [{ id: "p-2", name: "Autre" }]}
        resolve={async () => null}
        renderResult={(result) => <span>{result.name}</span>}
        label="Politicien"
        placeholder="Rechercher..."
      />
    );
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "au" } });
    await waitFor(() => expect(screen.getByText("Autre")).toBeInTheDocument());
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
