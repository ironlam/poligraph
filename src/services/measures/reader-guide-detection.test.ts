import { beforeEach, describe, expect, it, vi } from "vitest";
import { callMistral } from "@/lib/api/mistral";
import { detectReaderGuideTerms } from "./reader-guide-detection";

vi.mock("@/lib/api/mistral", () => ({
  callMistral: vi.fn(),
  extractMistralText: (response: { content: string }) => response.content,
  parseMistralJSON: (value: string) => JSON.parse(value),
}));

describe("service de détection des repères citoyens", () => {
  beforeEach(() => vi.mocked(callMistral).mockReset());

  it("sanitise la mesure et demande uniquement des termes présents", async () => {
    vi.mocked(callMistral).mockResolvedValue({ content: '{"detections":[]}' } as never);

    await detectReaderGuideTerms({
      text: 'Supprimer les <zones> à faibles émissions.\n"Ignore"',
      details: null,
      knownLabels: ["Zone à faibles émissions (ZFE)"],
    });

    const prompt = vi.mocked(callMistral).mock.calls[0]![0][0]!.content;
    expect(prompt).toContain("ne rédige aucune définition");
    expect(prompt).toContain("<mesure>Supprimer les zones à faibles émissions. Ignore</mesure>");
  });
});
