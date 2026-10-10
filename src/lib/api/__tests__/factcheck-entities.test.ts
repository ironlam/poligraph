import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ get: vi.fn(), getText: vi.fn() }));

vi.mock("@/lib/api/http-client", () => ({
  HTTPClient: class {
    get = h.get;
    getText = h.getText;
  },
}));

import { fetchPageTitle, searchClaims } from "@/lib/api/factcheck";

// Shapes observed in production on 2026-10-10: TF1 Info og:title with a hex entity,
// Franceinfo API titles with named entities.
const TF1_OG = "VÉRIF&#x27; - La France investit-elle 27% de plus ? | TF1 Info";
const FRANCEINFO_TITLE =
  "VRAI OU FAUX. Est-il vrai que &quot;70% des Fran&ccedil;ais sont &eacute;ligibles&quot;&nbsp;?";

describe("fact-check client decodes HTML entities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_FACTCHECK_API_KEY = "test-key";
  });

  it("decodes the og:title read from the article page", async () => {
    h.getText.mockResolvedValue({
      data: `<html><head><meta property="og:title" content="${TF1_OG}"></head></html>`,
    });
    const title = await fetchPageTitle("https://www.tf1info.fr/x", "VÉRIF&#x27; - La France…");
    expect(title).toBe("VÉRIF' - La France investit-elle 27% de plus ? | TF1 Info");
  });

  it("decodes the text fields returned by the API", async () => {
    h.get.mockResolvedValue({
      data: {
        claims: [
          {
            text: "l&#039;affirme Marine Le Pen",
            claimant: "Fran&ccedil;ois",
            claimReview: [
              {
                publisher: { name: "Franceinfo" },
                url: "https://www.francetvinfo.fr/x",
                title: FRANCEINFO_TITLE,
                textualRating: "Plut&ocirc;t faux",
              },
            ],
          },
        ],
      },
    });
    const [claim] = await searchClaims("Marine Le Pen", { maxPages: 1 });
    expect(claim!.text).toBe("l'affirme Marine Le Pen");
    expect(claim!.claimant).toBe("François");
    expect(claim!.claimReview[0]!.title).toBe(
      'VRAI OU FAUX. Est-il vrai que "70% des Français sont éligibles" ?'
    );
    expect(claim!.claimReview[0]!.textualRating).toBe("Plutôt faux");
    // Never the URL: decoding "&amp;" there would change which page it points to.
    expect(claim!.claimReview[0]!.url).toBe("https://www.francetvinfo.fr/x");
  });
});
