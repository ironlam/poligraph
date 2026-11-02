import { describe, expect, it } from "vitest";
import {
  formatTimecode,
  isVideoSource,
  isYouTubeUrl,
  parseTimecode,
  videoSourceHref,
} from "./video-source";

describe("parseTimecode", () => {
  it("lit minutes:secondes", () => {
    expect(parseTimecode("22:41")).toBe(22 * 60 + 41);
    expect(parseTimecode("08:28")).toBe(8 * 60 + 28);
    expect(parseTimecode("0:05")).toBe(5);
  });

  it("lit heures:minutes:secondes", () => {
    expect(parseTimecode("1:05:09")).toBe(3600 + 5 * 60 + 9);
    expect(parseTimecode("01:33:39")).toBe(3600 + 33 * 60 + 39);
  });

  it("refuse ce qui n'est pas un horodatage", () => {
    for (const bad of [
      "",
      "22",
      "22:61",
      "1:75:09",
      "abc",
      "22:4",
      "12:34:56:78",
      "-3:10",
      "p. 12",
    ]) {
      expect(parseTimecode(bad), bad).toBeNull();
    }
  });

  it("tolère les espaces autour", () => {
    expect(parseTimecode("  22:41 ")).toBe(1361);
  });
});

describe("formatTimecode", () => {
  it("formate sous une heure en mm:ss", () => {
    expect(formatTimecode(1361)).toBe("22:41");
    expect(formatTimecode(5)).toBe("00:05");
  });

  it("formate à partir d'une heure en h:mm:ss", () => {
    expect(formatTimecode(3600 + 5 * 60 + 9)).toBe("1:05:09");
  });

  it("est l'inverse de parseTimecode", () => {
    for (const s of [0, 59, 60, 1361, 3599, 3600, 5619, 9399]) {
      expect(parseTimecode(formatTimecode(s)), String(s)).toBe(s);
    }
  });
});

describe("détection et lien", () => {
  const watch = "https://www.youtube.com/watch?v=-Nb_bTgARWw";

  it("reconnaît les hôtes YouTube et rien d'autre", () => {
    expect(isYouTubeUrl(watch)).toBe(true);
    expect(isYouTubeUrl("https://youtu.be/abc")).toBe(true);
    expect(isYouTubeUrl("https://evil-youtube.com/watch?v=x")).toBe(false);
    expect(isYouTubeUrl("https://youtube.com.evil.fr/watch?v=x")).toBe(false);
    expect(isYouTubeUrl("javascript:alert(1)")).toBe(false);
    expect(isYouTubeUrl("pas une url")).toBe(false);
  });

  it("traite comme vidéo une source horodatée ou hébergée sur YouTube", () => {
    expect(isVideoSource(watch, null)).toBe(true);
    expect(isVideoSource("https://rassemblementnational.fr/videos/x", 1361)).toBe(true);
    expect(isVideoSource("https://melenchon.fr/2026/10/15/billet/", null)).toBe(false);
    expect(isVideoSource("https://melenchon.fr/2026/10/15/billet/", undefined)).toBe(false);
  });

  it("ajoute le départ à un lien YouTube sans casser les autres paramètres", () => {
    expect(videoSourceHref(watch, 1361)).toBe(
      "https://www.youtube.com/watch?v=-Nb_bTgARWw&t=1361s"
    );
    expect(videoSourceHref("https://youtu.be/abc?si=zz", 90)).toBe(
      "https://youtu.be/abc?si=zz&t=90s"
    );
  });

  it("remplace un départ déjà présent plutôt que d'en empiler deux", () => {
    expect(videoSourceHref(`${watch}&t=5s`, 1361)).toBe(`${watch}&t=1361s`);
  });

  it("laisse intacte une URL non YouTube ou sans horodatage", () => {
    const rn = "https://rassemblementnational.fr/videos/x";
    expect(videoSourceHref(rn, 1361)).toBe(rn);
    expect(videoSourceHref(watch, null)).toBe(watch);
    expect(videoSourceHref(watch, undefined)).toBe(watch);
  });
});
