import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import PropositionsPage from "./page";

const PRESS_URL = "https://press.example.test/politique/article-test.html";

function listResponse() {
  return {
    rows: [
      {
        id: "proposal-press-1",
        importer: "press-analysis",
        extractorVersion: "v1",
        proposedPatch: { court: "Tribunal judiciaire de Paris" },
        payloadKind: "PATCH",
        acceptanceEligible: true,
        validationIssues: [],
        eventPreview: null,
        observedValues: { court: null },
        affairSnapshot: {
          publicId: "PG000001",
          slug: "affaire-test",
          title: "Affaire test",
          politicianSlug: "personne-test",
          politicianName: "Personne Test",
        },
        source: "PRESSE",
        sourceUrl: PRESS_URL,
        sourceLink: { rawUrl: PRESS_URL, safeUrl: PRESS_URL },
        officialId: null,
        sourceContentHash: null,
        sourceExcerpt: null,
        confidence: 80,
        riskLevel: "MEDIUM",
        rationale: "Article soumis à une revue humaine.",
        status: "PENDING",
        conflictDetail: null,
        reviewedAt: null,
        reviewedBy: null,
        reviewNotes: null,
        createdAt: "2026-08-19T09:00:00.000Z",
        officialEvidence: {
          required: false,
          acceptable: false,
          canonicalUrl: null,
          requestedUrl: null,
          status: null,
          checkedAt: null,
          matchedIdentifiers: [],
          issues: [],
        },
        affair: null,
      },
    ],
    total: 1,
    page: 1,
    totalPages: 1,
    counts: { PENDING: 1 },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("admin affair proposal ordinary sources", () => {
  it("keeps a safe press source clickable without disabling acceptance", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(listResponse()), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      )
    );

    render(<PropositionsPage />);

    const sourceLink = await screen.findByRole("link", {
      name: /Ouvrir la source PRESSE dans un nouvel onglet/i,
    });
    expect(sourceLink).toHaveAttribute("href", PRESS_URL);
    expect(screen.getByRole("button", { name: "Accepter et appliquer" })).toBeEnabled();
    expect(screen.queryByText(/Décision officielle non vérifiée/i)).not.toBeInTheDocument();
  });

  it("présente un événement comme une opération lisible", async () => {
    const response = listResponse();
    Object.assign(response.rows[0] as unknown as Record<string, unknown>, {
      proposedPatch: {
        addEvent: {
          date: "2026-08-27T08:00:00.000Z",
          type: "REVELATION",
          title: "Publication d’une nouvelle source sur l’évolution de l’affaire",
        },
      },
      observedValues: {
        addEvent: { identityVersion: "press-revelation-v2", identityKey: "a".repeat(64) },
      },
      payloadKind: "ADD_EVENT",
      eventPreview: {
        date: "2026-08-27T08:00:00.000Z",
        type: "REVELATION",
        title: "Publication d’une nouvelle source sur l’évolution de l’affaire",
        description: null,
        sourceUrl: PRESS_URL,
        sourceTitle: "Titre original de l’article",
        identityKey: "a".repeat(64),
        publisher: "Le Monde",
      },
      riskLevel: "HIGH",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(response), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      )
    );

    render(<PropositionsPage />);

    expect(await screen.findByText("Nouvel événement")).toBeInTheDocument();
    expect(screen.getByText("Ajout proposé à la chronologie")).toBeInTheDocument();
    expect(screen.getByText("Titre original de l’article")).toBeInTheDocument();
    expect(screen.getByText("Le Monde")).toBeInTheDocument();
    expect(screen.queryByText("[object Object]")).not.toBeInTheDocument();
  });

  it("désactive l’acceptation lorsque la provenance est invalide", async () => {
    const response = listResponse();
    Object.assign(response.rows[0] as unknown as Record<string, unknown>, {
      payloadKind: "INVALID",
      acceptanceEligible: false,
      validationIssues: ["Métadonnées de provenance absentes"],
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(response), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      )
    );

    render(<PropositionsPage />);

    expect(await screen.findByText("Proposition non applicable")).toBeInTheDocument();
    expect(screen.getByText("Métadonnées de provenance absentes")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accepter et appliquer" })).toBeDisabled();
  });
});
