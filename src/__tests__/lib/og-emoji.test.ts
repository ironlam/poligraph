import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { OG_EMOJI, ogEmojiSrc } from "@/lib/og/emoji";

/**
 * Two ways the vendored emoji can rot, both silent, both guarded here.
 *
 * The data URIs in emoji.ts are generated from the SVG files next to them. Editing one without
 * re-encoding leaves the two disagreeing, and nothing at runtime would notice.
 *
 * An emoji used in an OG route but absent from the map is worse. `OgEmoji` renders null for an
 * unknown one, so the card ships with a hole rather than an error. Catching it here is the only
 * cheap moment: the alternative is spotting a missing picture on a social preview.
 */

const TWEMOJI_DIR = join(process.cwd(), "src/lib/og/twemoji");

/** Twemoji naming: lowercase hex codepoints joined by "-", FE0F dropped unless a ZWJ is present. */
function toCodePoint(emoji: string): string {
  const points = [...emoji].map((c) => c.codePointAt(0)!);
  const kept = points.includes(0x200d) ? points : points.filter((p) => p !== 0xfe0f);
  return kept.map((p) => p.toString(16)).join("-");
}

describe("emoji Open Graph embarqués", () => {
  it("contient les 11 emoji utilisés par les cartes", () => {
    expect(Object.keys(OG_EMOJI)).toHaveLength(11);
  });

  it("ne référence que des data URI, donc aucun appel réseau", () => {
    for (const [emoji, src] of Object.entries(OG_EMOJI)) {
      expect(src, emoji).toMatch(/^data:image\/svg\+xml;base64,/);
      expect(src, emoji).not.toContain("http");
    }
  });

  it("reste synchronisé avec les fichiers SVG dont il est issu", () => {
    for (const [emoji, src] of Object.entries(OG_EMOJI)) {
      const file = join(TWEMOJI_DIR, `${toCodePoint(emoji)}.svg`);
      const attendu = `data:image/svg+xml;base64,${readFileSync(file).toString("base64")}`;
      expect(src, `${emoji} diverge de ${toCodePoint(emoji)}.svg`).toBe(attendu);
    }
  });

  it("n'embarque aucun SVG devenu inutile", () => {
    const surDisque = readdirSync(TWEMOJI_DIR)
      .filter((f) => f.endsWith(".svg"))
      .map((f) => f.replace(/\.svg$/, ""))
      .sort();
    const référencés = Object.keys(OG_EMOJI).map(toCodePoint).sort();
    expect(surDisque).toEqual(référencés);
  });

  it("rend undefined pour un emoji non embarqué, sans repli silencieux", () => {
    expect(ogEmojiSrc("🎉")).toBeUndefined();
  });
});

describe("couverture des routes Open Graph", () => {
  it("embarque chaque emoji que les routes affichent", () => {
    // Les caractères pictographiques, sans les sélecteurs de variante ni les chiffres-clavier.
    const pictos = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]\u{FE0F}?/gu;
    const fichiers = readdirSync(join(process.cwd(), "src/app"), { recursive: true })
      .map(String)
      .filter((f) => f.endsWith("opengraph-image.tsx"))
      .map((f) => join("src/app", f));

    expect(fichiers.length, "aucune route OG trouvée, le garde-fou lirait le vide").toBeGreaterThan(
      10
    );

    const manquants = new Map<string, string>();
    for (const rel of fichiers) {
      const source = readFileSync(join(process.cwd(), rel), "utf8");
      for (const [trouvé] of source.matchAll(pictos)) {
        if (!ogEmojiSrc(trouvé) && !manquants.has(trouvé)) manquants.set(trouvé, rel);
      }
    }

    expect(
      [...manquants].map(([e, f]) => `${e} dans ${f}`),
      "un emoji affiché sans être embarqué rendrait une carte trouée"
    ).toEqual([]);
  });
});
