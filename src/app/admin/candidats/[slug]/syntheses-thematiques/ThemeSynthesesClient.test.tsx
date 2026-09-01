import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminCandidacyThemeSyntheses } from "@/lib/data/candidacy-theme-syntheses";
import { ThemeSynthesesClient } from "./ThemeSynthesesClient";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const data = (state: "MISSING" | "PENDING_REVIEW" = "MISSING") =>
  ({
    candidacyId: "cand-1",
    candidateName: "Camille Démonstration",
    politicianSlug: "camille-demonstration",
    themes: [
      {
        theme: "SANTE",
        measureCount: 2,
        measures: [
          { id: "measure-1", ref: "M1", text: "Créer un centre de santé." },
          { id: "measure-2", ref: "M2", text: "Former davantage de médecins." },
        ],
        currentCorpusFingerprint: "a".repeat(64),
        state,
        synthesis:
          state === "PENDING_REVIEW"
            ? {
                id: "synthesis-1",
                text: "Les mesures portent sur les soins de proximité.",
                corpusFingerprint: "a".repeat(64),
                contentFingerprint: "c".repeat(64),
                model: "mistral-large-2508",
                generatedAt: new Date("2026-09-01T00:00:00Z"),
                validatedAt: null,
                claims: [],
              }
            : null,
      },
    ],
  }) satisfies AdminCandidacyThemeSyntheses;

describe("ThemeSynthesesClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("prévisualise par un dry-run sans demander de persistance", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          text: "Les mesures portent sur les soins de proximité.",
          model: "mistral-large-2508",
          measureCount: 2,
          claims: [
            {
              text: "Les mesures portent sur les soins de proximité.",
              measureRefs: ["M1"],
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    render(<ThemeSynthesesClient data={data()} />);

    fireEvent.click(screen.getByRole("button", { name: "Prévisualiser" }));

    await screen.findByText("Prévisualisation, non enregistrée");
    expect(screen.getByRole("link", { name: /M1 : Créer un centre de santé/ })).toHaveAttribute(
      "href",
      "/admin/mesures/measure-1"
    );
    expect(fetch).toHaveBeenCalledWith(
      "/api/admin/candidats/cand-1/theme-syntheses/generate",
      expect.objectContaining({ body: JSON.stringify({ theme: "SANTE", persist: false }) })
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it("publie explicitement le brouillon relu avec l'empreinte affichée", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    render(<ThemeSynthesesClient data={data("PENDING_REVIEW")} />);

    fireEvent.click(screen.getByRole("button", { name: "Valider et publier" }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetch).toHaveBeenCalledWith(
      "/api/admin/candidats/cand-1/theme-syntheses/publish",
      expect.objectContaining({
        body: JSON.stringify({
          synthesisId: "synthesis-1",
          corpusFingerprint: "a".repeat(64),
          contentFingerprint: "c".repeat(64),
        }),
      })
    );
  });
});
