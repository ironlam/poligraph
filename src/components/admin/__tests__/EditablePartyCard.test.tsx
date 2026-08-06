import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
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

describe("EditablePartyCard — add affiliation form", () => {
  it("opens the form even when the history is empty", async () => {
    setup({ partyHistory: [] });

    await userEvent.click(screen.getByRole("button", { name: "Ajouter une affiliation" }));

    expect(screen.getByLabelText("Parti de l'affiliation")).toBeInTheDocument();
  });

  it("shows the mode choice only when the end date is empty", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Ajouter une affiliation" }));

    expect(screen.getByRole("radio", { name: /^Ce parti devient/i })).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Date de fin de l'affiliation"), "2018-01-01");

    expect(screen.queryByRole("radio", { name: /^Ce parti devient/i })).not.toBeInTheDocument();
  });

  it("hides the parallel option when there is no current party", async () => {
    setup({ currentParty: null, partyHistory: [] });
    await userEvent.click(screen.getByRole("button", { name: "Ajouter une affiliation" }));

    expect(screen.queryByRole("radio", { name: /en parallèle/i })).not.toBeInTheDocument();
  });

  it("keeps the submit button disabled in succession mode without a start date", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Ajouter une affiliation" }));
    await userEvent.selectOptions(screen.getByLabelText("Parti de l'affiliation"), "p_ps");

    expect(screen.getByRole("button", { name: "Ajouter" })).toBeDisabled();
  });

  it("posts the body matching the chosen mode", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Ajouter une affiliation" }));
    await userEvent.selectOptions(screen.getByLabelText("Parti de l'affiliation"), "p_ps");
    await userEvent.type(screen.getByLabelText("Date de début de l'affiliation"), "1997-06-03");
    await userEvent.type(screen.getByLabelText("Date de fin de l'affiliation"), "2018-01-01");
    await userEvent.selectOptions(screen.getByLabelText("Rôle dans l'affiliation"), "MEMBRE");
    await userEvent.click(screen.getByRole("button", { name: "Ajouter" }));

    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] ?? [];
    expect(url).toBe("/api/admin/politiques/pol_1/party-membership");
    expect(JSON.parse(init.body)).toEqual({
      mode: "closed",
      partyId: "p_ps",
      startDate: "1997-06-03",
      endDate: "2018-01-01",
      role: "MEMBRE",
    });
  });

  it("posts mode succeeds when the end date is empty and succession is chosen", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Ajouter une affiliation" }));
    await userEvent.selectOptions(screen.getByLabelText("Parti de l'affiliation"), "p_ps");
    await userEvent.type(screen.getByLabelText("Date de début de l'affiliation"), "1997-06-03");
    await userEvent.click(screen.getByRole("button", { name: "Ajouter" }));

    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] ?? [];
    expect(url).toBe("/api/admin/politiques/pol_1/party-membership");
    expect(JSON.parse(init.body)).toEqual({
      mode: "succeeds",
      partyId: "p_ps",
      startDate: "1997-06-03",
    });
  });

  it("posts mode parallel when the end date is empty and parallel affiliation is chosen", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Ajouter une affiliation" }));
    await userEvent.selectOptions(screen.getByLabelText("Parti de l'affiliation"), "p_ps");
    await userEvent.type(screen.getByLabelText("Date de début de l'affiliation"), "1997-06-03");
    await userEvent.click(screen.getByRole("radio", { name: /en parallèle/i }));
    await userEvent.click(screen.getByRole("button", { name: "Ajouter" }));

    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] ?? [];
    expect(url).toBe("/api/admin/politiques/pol_1/party-membership");
    expect(JSON.parse(init.body)).toEqual({
      mode: "parallel",
      partyId: "p_ps",
      startDate: "1997-06-03",
    });
  });

  it("shows returned warnings alongside the success message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          warnings: [
            {
              type: "OVERLAP",
              // A party not already present in the fixtures (TDP is the current party
              // badge, PS is an <option> in both selects): both already render their
              // own text elsewhere on screen, which would make the assertion below
              // match more than one element.
              partyId: "p_modem",
              partyShortName: "MODEM",
              startDate: new Date("2020-01-01").toISOString(),
              endDate: null,
            },
          ],
        }),
      }))
    );
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Ajouter une affiliation" }));
    await userEvent.selectOptions(screen.getByLabelText("Parti de l'affiliation"), "p_ps");
    await userEvent.type(screen.getByLabelText("Date de début de l'affiliation"), "1997-06-03");
    await userEvent.type(screen.getByLabelText("Date de fin de l'affiliation"), "2018-01-01");
    await userEvent.click(screen.getByRole("button", { name: "Ajouter" }));

    expect(await screen.findByText(/Chevauchements détectés/)).toBeInTheDocument();
    expect(screen.getByText(/MODEM/)).toBeInTheDocument();
    expect(screen.getByText("Affiliation ajoutée")).toBeInTheDocument();
  });

  it("clears previous warnings on the next submission", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          warnings: [
            {
              type: "OVERLAP",
              partyId: "p_tdp",
              partyShortName: "TDP",
              startDate: null,
              endDate: null,
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, warnings: [] }),
      });
    vi.stubGlobal("fetch", fetchMock);

    setup();

    async function submitClosed(partyId: string) {
      await userEvent.click(screen.getByRole("button", { name: "Ajouter une affiliation" }));
      await userEvent.selectOptions(screen.getByLabelText("Parti de l'affiliation"), partyId);
      await userEvent.type(screen.getByLabelText("Date de début de l'affiliation"), "1997-06-03");
      await userEvent.type(screen.getByLabelText("Date de fin de l'affiliation"), "2018-01-01");
      await userEvent.click(screen.getByRole("button", { name: "Ajouter" }));
    }

    await submitClosed("p_ps");
    expect(await screen.findByText(/Chevauchements détectés/)).toBeInTheDocument();

    await submitClosed("p_tdp");
    expect(screen.queryByText(/Chevauchements détectés/)).not.toBeInTheDocument();
  });

  it("keeps the amber banner past the 3-second status auto-clear", async () => {
    // shouldAdvanceTime is required here: plain fake timers make userEvent's
    // internal pointer/keyboard mechanics hang (no way to make them progress).
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          warnings: [
            {
              type: "OVERLAP",
              partyId: "p_modem",
              partyShortName: "MODEM",
              startDate: null,
              endDate: null,
            },
          ],
        }),
      }))
    );
    setup();
    await user.click(screen.getByRole("button", { name: "Ajouter une affiliation" }));
    await user.selectOptions(screen.getByLabelText("Parti de l'affiliation"), "p_ps");
    await user.type(screen.getByLabelText("Date de début de l'affiliation"), "1997-06-03");
    await user.type(screen.getByLabelText("Date de fin de l'affiliation"), "2018-01-01");
    await user.click(screen.getByRole("button", { name: "Ajouter" }));

    expect(screen.getByText(/Chevauchements détectés/)).toBeInTheDocument();
    expect(screen.getByText("Affiliation ajoutée")).toBeInTheDocument();

    // vi.advanceTimersByTimeAsync does not reliably fire the pending timer once
    // shouldAdvanceTime is on (silently no-ops); wrapping a sync advance in act()
    // does.
    await act(async () => {
      vi.advanceTimersByTime(3100);
    });

    expect(screen.getByText(/Chevauchements détectés/)).toBeInTheDocument();
    expect(screen.queryByText("Affiliation ajoutée")).not.toBeInTheDocument();
  });
});
