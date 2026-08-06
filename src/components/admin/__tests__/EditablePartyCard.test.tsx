import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), back: vi.fn() }),
}));

import { EditablePartyCard } from "@/components/admin/EditablePartyCard";

const TDP = { id: "p_tdp", name: "Territoires de progrès", shortName: "TDP", color: "#e91e63" };
const PS = { id: "p_ps", name: "Parti socialiste", shortName: "PS", color: "#ff8080" };

function setup(overrides: Partial<Parameters<typeof EditablePartyCard>[0]> = {}) {
  return render(
    <EditablePartyCard
      politicianId="pol_1"
      currentParty={TDP}
      partyHistory={[
        {
          id: "m_tdp",
          partyId: "p_tdp",
          role: "MEMBRE",
          startDate: new Date("2020-01-01"),
          endDate: null,
          party: TDP,
        },
      ]}
      allParties={[TDP, PS]}
      {...overrides}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ success: true, warnings: [] }),
    }))
  );
});

describe("EditablePartyCard — affiliation dates", () => {
  it("renders an ongoing affiliation as such", () => {
    setup();

    expect(screen.getByText("En cours")).toBeInTheDocument();
  });

  // A null startDate used to render "En cours" in the Début column, which states
  // something false.
  it("renders an unknown start date as a dash, not as ongoing", () => {
    setup({
      partyHistory: [
        {
          id: "m_ps",
          partyId: "p_ps",
          role: "MEMBRE",
          startDate: null,
          endDate: new Date("2018-01-01"),
          party: PS,
        },
      ],
    });

    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText("En cours")).not.toBeInTheDocument();
  });
});
