import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  imageResponses: [] as Array<{ element: ReactNode; options: unknown }>,
  findUnique: vi.fn(),
  loadOgPortrait: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/og", () => ({
  ImageResponse: class {
    element: ReactNode;
    options: unknown;

    constructor(element: ReactNode, options: unknown) {
      this.element = element;
      this.options = options;
      mocks.imageResponses.push({ element, options });
    }
  },
}));
vi.mock("@/lib/og-utils", () => ({
  OG_SIZE: { width: 1200, height: 630 },
  OgLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
  loadOgPortrait: (url: string | null | undefined) => mocks.loadOgPortrait(url),
}));
vi.mock("@/lib/db", () => ({
  db: { politician: { findUnique: mocks.findUnique } },
}));

import Image from "../opengraph-image";

function textContent(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textContent).join(" ");
  if (!node || typeof node === "boolean") return "";
  if (typeof node === "object" && "props" in node) {
    return textContent((node.props as { children?: ReactNode }).children);
  }
  return "";
}

function imgSources(node: ReactNode): string[] {
  if (Array.isArray(node)) return node.flatMap(imgSources);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const props = node.props as { children?: ReactNode; src?: string };
  const own = node.type === "img" && props.src ? [props.src] : [];
  return [...own, ...imgSources(props.children)];
}

const politician = (overrides: Record<string, unknown> = {}) => ({
  fullName: "Camille Rivière",
  firstName: "Camille",
  lastName: "Rivière",
  civility: "Mme",
  photoUrl: "https://source.test/camille.jpg",
  blobPhotoUrl: "https://blob.test/camille-portrait.jpg",
  candidacies: [{ id: "cand-1" }],
  ...overrides,
});

describe("Open Graph d'une fiche de candidature", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.imageResponses.length = 0;
    mocks.loadOgPortrait.mockResolvedValue("data:image/jpeg;base64,portrait");
  });

  it("rend le portrait du candidat, en préférant la copie Blob recadrée", async () => {
    mocks.findUnique.mockResolvedValue(politician());

    await Image({ params: Promise.resolve({ slug: "camille-riviere" }) });

    expect(mocks.loadOgPortrait).toHaveBeenCalledWith("https://blob.test/camille-portrait.jpg");
    const element = mocks.imageResponses[0]?.element;
    expect(imgSources(element)).toContain("data:image/jpeg;base64,portrait");
    const rendered = textContent(element);
    expect(rendered).toContain("Camille Rivière");
    expect(rendered).toContain("Candidate à la présidentielle");
  });

  it("retombe sur les initiales quand la photo est absente ou illisible", async () => {
    mocks.findUnique.mockResolvedValue(politician({ photoUrl: null, blobPhotoUrl: null }));
    mocks.loadOgPortrait.mockResolvedValue(null);

    await Image({ params: Promise.resolve({ slug: "camille-riviere" }) });

    const element = mocks.imageResponses[0]?.element;
    expect(imgSources(element)).toHaveLength(0);
    expect(textContent(element)).toContain("CR");
  });

  it("n'expose aucune donnée périssable : ni statut, ni parti, ni compteur de mesures", async () => {
    mocks.findUnique.mockResolvedValue(politician());

    await Image({ params: Promise.resolve({ slug: "camille-riviere" }) });

    const selected = JSON.stringify(mocks.findUnique.mock.calls[0]?.[0]?.select ?? {});
    expect(selected).not.toContain("partyLabel");
    const rendered = textContent(mocks.imageResponses[0]?.element);
    expect(rendered).not.toContain("Candidature annoncée");
    expect(rendered).not.toContain("mesure");
  });

  it("n'expose pas l'identité d'une personne sans candidature sourcée", async () => {
    mocks.findUnique.mockResolvedValue(politician({ candidacies: [] }));

    await Image({ params: Promise.resolve({ slug: "camille-riviere" }) });

    const rendered = textContent(mocks.imageResponses[0]?.element);
    expect(rendered).toContain("Candidature non trouvée");
    expect(rendered).not.toContain("Camille Rivière");
  });

  it("ne lit que les personnes publiées", async () => {
    mocks.findUnique.mockResolvedValue(null);

    await Image({ params: Promise.resolve({ slug: "brouillon" }) });

    expect(JSON.stringify(mocks.findUnique.mock.calls[0]?.[0]?.where)).toContain("PUBLISHED");
    expect(textContent(mocks.imageResponses[0]?.element)).toContain("Candidature non trouvée");
  });
});
