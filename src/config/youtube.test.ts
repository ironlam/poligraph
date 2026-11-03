import { describe, expect, it } from "vitest";
import {
  SCRUTIN_VIDEOS,
  YOUTUBE_CHANNEL_URL,
  YOUTUBE_ID_PATTERN,
  getScrutinVideoId,
} from "./youtube";

describe("youtube config", () => {
  it("pointe vers la chaîne Poligraph", () => {
    expect(YOUTUBE_CHANNEL_URL).toBe("https://www.youtube.com/@poligraph_fr");
  });

  it("n'accepte que des identifiants de vidéo de 11 caractères", () => {
    expect(YOUTUBE_ID_PATTERN.test("0D3Oys-MlEs")).toBe(true);
    expect(YOUTUBE_ID_PATTERN.test("https://youtu.be/x")).toBe(false);
    expect(YOUTUBE_ID_PATTERN.test("abcdefghij")).toBe(false);
  });

  it("n'a que des identifiants valides dans la table des scrutins", () => {
    for (const [slug, id] of Object.entries(SCRUTIN_VIDEOS)) {
      expect(YOUTUBE_ID_PATTERN.test(id), `${slug} -> ${id}`).toBe(true);
    }
  });

  it("renvoie null pour un slug absent, nul ou hérité de Object", () => {
    expect(getScrutinVideoId(null)).toBeNull();
    expect(getScrutinVideoId(undefined)).toBeNull();
    expect(getScrutinVideoId("slug-inconnu")).toBeNull();
    expect(getScrutinVideoId("constructor")).toBeNull();
  });

  it("renvoie l'identifiant d'un scrutin connu", () => {
    const [slug, id] = Object.entries(SCRUTIN_VIDEOS)[0] ?? [];
    expect(slug).toBeDefined();
    expect(getScrutinVideoId(slug)).toBe(id);
  });
});
