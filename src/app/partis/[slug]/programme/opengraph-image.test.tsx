import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  imageResponses: [] as Array<{ element: ReactNode; options: unknown }>,
  platformFindFirst: vi.fn(),
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
  OgCategoryLabel: ({ label }: { label: string }) => <span>{label}</span>,
}));
vi.mock("@/lib/db", () => ({
  db: { platform: { findFirst: mocks.platformFindFirst } },
}));

import Image from "./opengraph-image";

function textContent(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!node || typeof node === "boolean" || Array.isArray(node)) {
    return Array.isArray(node) ? node.map(textContent).join(" ") : "";
  }
  if (typeof node === "object" && "props" in node) {
    return textContent((node.props as { children?: ReactNode }).children);
  }
  return "";
}

describe("Open Graph du programme", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.imageResponses.length = 0;
  });

  it("n'expose pas l'identité d'un parti non public via une plateforme publiée", async () => {
    mocks.platformFindFirst.mockImplementation(async (args: unknown) => {
      const publicOnly = JSON.stringify(args).includes(
        '"politicians":{"some":{"publicationStatus":"PUBLISHED"}}'
      );
      return publicOnly
        ? null
        : {
            id: "platform-hidden",
            publicationStatus: "PUBLISHED",
            party: {
              name: "Parti DRAFT",
              shortName: "PD",
              color: "#123456",
              logoUrl: "https://example.test/draft.svg",
            },
            election: { title: "Élection interne" },
            _count: { proposals: 9 },
          };
    });

    await Image({ params: Promise.resolve({ slug: "parti-draft" }) });

    const renderedText = textContent(mocks.imageResponses[0]?.element);
    expect(renderedText).toContain("Programme non trouvé");
    expect(renderedText).not.toContain("Parti DRAFT");
    expect(renderedText).not.toContain("PD");
    expect(renderedText).not.toContain("Élection interne");
  });
});
