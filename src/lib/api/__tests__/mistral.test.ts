import { describe, it, expect, vi, beforeEach } from "vitest";
import { callMistral, callMistralEmbeddings, parseMistralJSON } from "../mistral";

describe("callMistral", () => {
  beforeEach(() => {
    vi.stubEnv("MISTRAL_API_KEY", "test-key");
  });

  it("throws when MISTRAL_API_KEY is missing", async () => {
    vi.stubEnv("MISTRAL_API_KEY", "");
    await expect(callMistral([{ role: "user", content: "test" }])).rejects.toThrow(
      "MISTRAL_API_KEY"
    );
  });

  it("sends correct headers and body", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: "response" } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await callMistral([{ role: "user", content: "hello" }], {
      model: "mistral-large-latest",
      maxTokens: 500,
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.mistral.ai/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-key",
          "Content-Type": "application/json",
        }),
      })
    );

    const body = JSON.parse(mockFetch.mock.calls[0]![1].body);
    expect(body.model).toBe("mistral-large-latest");
    expect(body.max_tokens).toBe(500);
  });

  it("throws on API error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: () => Promise.resolve("Rate limited"),
      })
    );

    await expect(callMistral([{ role: "user", content: "test" }])).rejects.toThrow(
      "Mistral API error 429"
    );
  });
});

describe("callMistralEmbeddings", () => {
  it("envoie un lot au point d’entrée d’embeddings", async () => {
    vi.stubEnv("MISTRAL_API_KEY", "test-key");
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          model: "mistral-embed",
          data: [{ index: 0, embedding: [0.1] }],
          usage: { prompt_tokens: 3, total_tokens: 3 },
        }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await callMistralEmbeddings(["logement"], { model: "mistral-embed" });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.mistral.ai/v1/embeddings",
      expect.objectContaining({ method: "POST" })
    );
    expect(JSON.parse(mockFetch.mock.calls[0]![1].body)).toEqual({
      model: "mistral-embed",
      input: ["logement"],
      encoding_format: "float",
    });
  });

  it("refuse un lot vide sans appel réseau", async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
    await expect(callMistralEmbeddings([], { model: "mistral-embed" })).rejects.toThrow(
      "at least one input"
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("parseMistralJSON", () => {
  it("parses JSON from markdown fences", () => {
    const result = parseMistralJSON<{ a: number }>('```json\n{"a": 1}\n```');
    expect(result).toEqual({ a: 1 });
  });

  it("parses raw JSON", () => {
    const result = parseMistralJSON<{ b: string }>('{"b": "hello"}');
    expect(result).toEqual({ b: "hello" });
  });
});
