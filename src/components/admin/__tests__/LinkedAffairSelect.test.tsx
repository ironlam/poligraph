import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LinkedAffairSelect } from "@/components/admin/LinkedAffairSelect";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async (url: string) => ({
      ok: true,
      json: async () => ({
        results: url.includes("id=")
          ? [
              {
                id: "a-2",
                title: "Affaire liée",
                slug: "affaire-liee",
                involvement: "DIRECT",
                linkedAffairId: "a-3",
                politician: { id: "p-2", fullName: "Jean Dupont", slug: "jean-dupont" },
              },
            ]
          : [
              {
                id: "a-2",
                title: "Affaire liée",
                slug: "affaire-liee",
                involvement: "DIRECT",
                linkedAffairId: "a-3",
                politician: { id: "p-2", fullName: "Jean Dupont", slug: "jean-dupont" },
              },
            ],
      }),
    }))
  );
});

describe("LinkedAffairSelect", () => {
  it("keeps the current warnings and supports a searchable selection", async () => {
    const onChange = vi.fn();
    render(<LinkedAffairSelect value={null} onChange={onChange} currentInvolvement="DIRECT" />);
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "Affaire" } });
    await waitFor(() => expect(screen.getByText("Affaire liée")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Affaire liée/ }));
    expect(onChange).toHaveBeenCalledWith("a-2");
    expect(screen.getByText(/même rôle/)).toBeInTheDocument();
    expect(screen.getByText(/créerait une chaîne/)).toBeInTheDocument();
  });
});
