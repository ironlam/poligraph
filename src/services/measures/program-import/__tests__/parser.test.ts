import { describe, expect, it, vi } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { acquireDocument } from "../acquisition";
import {
  analyzePdfTextLayerGeometry,
  canonicalizePdfTechnicalText,
  parseDocument,
  parseHtml,
  parsePdfText,
  restorePdfReadingOrder,
} from "../parser";

describe("parsing documentaire", () => {
  it("segmente un document HTML", () => {
    const parsed = parseHtml(
      "<html><main><h2>Énergie</h2><p>Réduire la TVA sur l'électricité à 5,5 %.</p></main></html>"
    );
    expect(parsed.mediaType).toBe("html");
    expect(parsed.segments[0]).toMatchObject({ heading: "Énergie", page: null });
    expect(parsed.blocks).toEqual([
      expect.objectContaining({
        id: "html-b001",
        order: 0,
        kind: "HEADING",
        text: "Énergie",
      }),
      expect.objectContaining({
        id: "html-b002",
        order: 1,
        kind: "CONTENT",
        heading: "Énergie",
        text: "Réduire la TVA sur l'électricité à 5,5 %.",
      }),
    ]);
  });

  it("rejette un contenu HTML vide", () =>
    expect(() => parseHtml("<html><script>vide</script></html>")).toThrow("vide"));

  it("rejette un PDF invalide", async () => {
    await expect(parseDocument(Buffer.from("%PDF invalide"), "application/pdf")).rejects.toThrow(
      "PDF invalide"
    );
  });

  it("segmente le texte natif extrait d'un PDF en conservant les pages", () => {
    const parsed = parsePdfText(
      [
        "Réduire la TVA sur l'électricité à cinq virgule cinq pour cent.",
        "Construire de nouveaux logements dans les zones tendues.",
      ].join("\f")
    );
    expect(parsed.mediaType).toBe("pdf");
    expect(parsed.scannedPdf).toBe(false);
    expect(parsed.segments.map((segment) => segment.page)).toEqual([1, 2]);
    expect(parsed.segments.every((segment) => segment.provenance?.extractionAllowed)).toBe(true);
    expect(parsed.blocks).toEqual([
      expect.objectContaining({ id: "pdf-1-1", order: 0, page: 1, kind: "CONTENT" }),
      expect.objectContaining({ id: "pdf-2-1", order: 1, page: 2, kind: "CONTENT" }),
    ]);
    expect(parsed.units.every((unit) => unit.blockId.startsWith("pdf-"))).toBe(true);
  });

  it("sépare déterministement narration, témoignage et voix du document dans un même bloc", () => {
    const parsed = parsePdfText(
      "Marie, aide-soignante, témoigne : « Nous devons travailler jusqu'à vingt heures. » Nous proposons donc de plafonner l'amplitude horaire."
    );

    expect(parsed.units.map((unit) => [unit.kind, unit.text])).toEqual([
      ["SENTENCE", "Marie, aide-soignante, témoigne :"],
      ["QUOTATION", "« Nous devons travailler jusqu'à vingt heures. »"],
      ["SENTENCE", "Nous proposons donc de plafonner l'amplitude horaire."],
    ]);
  });

  it("conserve une citation de témoignage sur plusieurs blocs sans contaminer la page suivante", () => {
    const parsed = parsePdfText(
      [
        "Témoignage de Nathalie\n\n“ Nous, on est humains, ce ne sont pas que des “clients”.\n\nOn veut juste être reconnues pour ce qu'on fait. ”",
        "Proposition 2\nCRÉER UN DROIT À LA RECONVERSION.\n\nCe droit sera financé par un fonds public.",
      ].join("\f")
    );

    expect(
      parsed.units.find((unit) => unit.text.includes("On veut juste être reconnues"))?.kind
    ).toBe("QUOTATION");
    expect(parsed.units.find((unit) => unit.text.startsWith("Proposition 2"))?.kind).toBe(
      "HEADING"
    );
  });

  it("distingue les nombres structurels des nombres de contenu", () => {
    const parsed = parsePdfText(
      "Proposition 2\nRÉDUIRE LES COUPURES.\n\nSystématiser la rémunération des coupures de plus de 2 h et porter l'indemnité à 15 %."
    );
    const numbers = parsed.units.flatMap((unit) => unit.numbers);

    expect(numbers).toEqual([
      { raw: "2", normalized: "2", role: "STRUCTURAL" },
      { raw: "2", normalized: "2", role: "CONTENT" },
      { raw: "15", normalized: "15", role: "CONTENT" },
    ]);
  });

  it("restaure l'ordre démontrable des colonnes sans fusion sémantique", () => {
    const layout = [
      "SALAIRES :                                                                  Qui est concerné ?",
      "DÉSMICARDISATION                                                            1,4 millions de salariés à bas salaires dont 600 000 salariés",
      "ET REVALORISATION                                                           de 40 ans ou plus.",
      "Proposition 1                                                               Proposition 3",
      "GARANTIR UN DROIT À LA RETRAITE ANTICIPÉE.                                  GARANTIR UN DROIT À LA",
      "Pour compenser la pénibilité.                                               RECONVERSION PROFESSIONNELLE.",
    ].join("\n");

    const restored = restorePdfReadingOrder(layout);
    const reconversionIndex = restored.indexOf("GARANTIR UN DROIT À LA\nRECONVERSION");
    const retraiteIndex = restored.indexOf("GARANTIR UN DROIT À LA RETRAITE");
    expect(retraiteIndex).toBeGreaterThanOrEqual(0);
    expect(reconversionIndex).toBeGreaterThan(retraiteIndex);
    expect(restored).toContain(
      "Qui est concerné ?\n1,4 millions de salariés à bas salaires dont 600 000 salariés\nde 40 ans ou plus."
    );
    expect(restored).not.toContain("Proposition 1 RECONVERSION");
  });

  it("laisse intacte une page sans gouttière stable", () => {
    const singleColumn =
      "Nous instaurerons un droit automatique à un premier départ collectif.\n" +
      "Chaque enfant pourra bénéficier d'un séjour collectif financé.";
    expect(restorePdfReadingOrder(singleColumn)).toBe(singleColumn);
  });

  it("conserve un titre pleine largeur avant deux colonnes", () => {
    const layout = [
      "UN PROGRAMME POUR LES LOISIRS ET LA CULTURE",
      "",
      "Première action                                                        Deuxième action",
      "Créer des lieux publics.                                               Financer les associations.",
      "Dans toutes les communes.                                              Avec des conventions longues.",
      "Un suivi sera publié.                                                  Un bilan sera présenté.",
      "Les habitants participeront.                                           Les usagers seront consultés.",
    ].join("\n");
    const restored = restorePdfReadingOrder(layout);
    expect(restored).toMatch(/^UN PROGRAMME POUR LES LOISIRS ET LA CULTURE/);
    expect(restored.indexOf("Première action")).toBeLessThan(restored.indexOf("Deuxième action"));
  });

  it("restaure des listes dans deux colonnes sans mélanger leurs éléments", () => {
    const layout = [
      "MESURES                                                               PUBLICS",
      "1. Créer un fonds national.                                            A. Enfants et adolescents",
      "2. Financer les communes.                                              B. Associations locales",
      "3. Publier un bilan annuel.                                            C. Collectivités rurales",
      "4. Évaluer les résultats.                                              D. Établissements publics",
    ].join("\n");
    const restored = restorePdfReadingOrder(layout);
    expect(restored.indexOf("4. Évaluer")).toBeLessThan(restored.indexOf("A. Enfants"));
    expect(restored).not.toContain("fonds national. A. Enfants");
  });

  it("ne déduit pas deux colonnes d'un encadré ou d'une colonne étroite isolée", () => {
    const layout = [
      "Titre principal",
      "Une phrase longue occupe toute la largeur utile de la page.",
      "Encadré        Note courte",
      "Le texte principal continue sans séparation géométrique répétée.",
    ].join("\n");
    expect(restorePdfReadingOrder(layout)).toBe(layout);
  });

  it("bloque une page à colonnes lorsque la frontière ne permet pas de prouver l'ordre", () => {
    const layout = [
      "MESURES                                                               PUBLICS",
      "Créer un fonds public.                                                Associations locales",
      "Financer les communes.                                                Collectivités rurales",
      "Publier un bilan annuel.                                              Établissements publics",
      "Évaluer les résultats.                                                Usagers concernés",
      "Ce fragment de gauche traverse sans gouttière la frontière et fusionne un autre contenu documentaire",
      "Une seconde ligne ambiguë traverse elle aussi la frontière et mélange deux flux documentaires distincts",
    ].join("\n");
    const parsed = parsePdfText(layout);

    expect(parsed.pageDiagnostics[0]).toMatchObject({
      status: "TEXT_LAYER_SUSPECT",
      reason: "AMBIGUOUS_COLUMN_BOUNDARY",
      extractionAllowed: false,
    });
    expect(parsed.blocks.every((item) => !item.provenance.extractionAllowed)).toBe(true);
  });

  it("retire uniquement les caractères de contrôle techniques et conserve le brut", () => {
    const raw = "Nous créerons un\u0003 fonds public pour les loisirs.";
    expect(canonicalizePdfTechnicalText(raw)).toBe(
      "Nous créerons un fonds public pour les loisirs."
    );
    const parsed = parsePdfText(raw);
    expect(parsed.blocks[0]).toMatchObject({
      rawText: raw,
      text: "Nous créerons un fonds public pour les loisirs.",
    });
    expect(canonicalizePdfTechnicalText("Coût : 5 €\nCondition : locale.")).toBe(
      "Coût : 5 €\nCondition : locale."
    );
  });

  it("détecte une couche texte parasite par recouvrement géométrique", () => {
    const bbox = `<?xml version="1.0"?><doc><page width="368" height="595"><flow><block>
      <line xMin="50" yMin="100" xMax="250" yMax="112"><word>Texte visible un</word></line>
      <line xMin="50" yMin="120" xMax="250" yMax="132"><word>Texte visible deux</word></line>
      <line xMin="50" yMin="140" xMax="250" yMax="152"><word>Texte visible trois</word></line>
      <line xMin="50" yMin="160" xMax="250" yMax="172"><word>Texte visible quatre</word></line>
      <line xMin="50" yMin="180" xMax="250" yMax="192"><word>Texte visible cinq</word></line>
      <line xMin="50" yMin="200" xMax="250" yMax="212"><word>Texte visible six</word></line>
      <line xMin="50" yMin="220" xMax="250" yMax="232"><word>Texte visible sept</word></line>
      <line xMin="50" yMin="240" xMax="250" yMax="252"><word>Texte visible huit</word></line>
    </block></flow><flow><block>
      <line xMin="80" yMin="100" xMax="280" yMax="112"><word>Couche fantôme un</word></line>
      <line xMin="80" yMin="120" xMax="280" yMax="132"><word>Couche fantôme deux</word></line>
      <line xMin="80" yMin="140" xMax="280" yMax="152"><word>Couche fantôme trois</word></line>
      <line xMin="80" yMin="160" xMax="280" yMax="172"><word>Couche fantôme quatre</word></line>
      <line xMin="80" yMin="180" xMax="280" yMax="192"><word>Couche fantôme cinq</word></line>
      <line xMin="80" yMin="200" xMax="280" yMax="212"><word>Couche fantôme six</word></line>
      <line xMin="80" yMin="220" xMax="280" yMax="232"><word>Couche fantôme sept</word></line>
      <line xMin="80" yMin="240" xMax="280" yMax="252"><word>Couche fantôme huit</word></line>
    </block></flow></page></doc>`;
    expect(analyzePdfTextLayerGeometry(bbox)).toEqual([
      {
        page: 1,
        lineCount: 16,
        overlappingLinePairs: 8,
        status: "TEXT_LAYER_CORRUPTED",
        reason: "OVERLAPPING_TEXT_LAYERS",
        extractionAllowed: false,
      },
    ]);
  });

  it("bloque les segments d'une page dont la géométrie est corrompue", () => {
    const parsed = parsePdfText("Texte visible. Texte fantôme intercalé.", [
      {
        page: 1,
        lineCount: 40,
        overlappingLinePairs: 12,
        status: "TEXT_LAYER_CORRUPTED",
        reason: "OVERLAPPING_TEXT_LAYERS",
        extractionAllowed: false,
      },
    ]);
    expect(parsed.segments[0]?.provenance).toEqual({
      status: "TEXT_LAYER_CORRUPTED",
      reason: "OVERLAPPING_TEXT_LAYERS",
      extractionAllowed: false,
    });
    expect(parsed.blocks[0]?.provenance.extractionAllowed).toBe(false);
  });

  it("signale un timeout réseau", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("timeout", "TimeoutError")));
    await expect(
      acquireDocument({
        id: "timeout-test",
        url: "https://example.test",
        cacheDir: "/tmp/poligraph-timeout-test",
        timeoutMs: 1,
        forceRefetch: true,
      })
    ).rejects.toThrow();
    vi.unstubAllGlobals();
  });

  it("rejette un téléchargement vide", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(new Uint8Array(), { status: 200 }))
    );
    await expect(
      acquireDocument({
        id: "empty-test",
        url: "https://example.test",
        cacheDir: "/tmp/poligraph-empty-test",
        forceRefetch: true,
      })
    ).rejects.toThrow("vide");
    vi.unstubAllGlobals();
  });

  it("invalide le cache lorsque l'URL de l'édition change", async () => {
    const cacheDir = await mkdtemp(path.join(tmpdir(), "program-cache-url-"));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("ancien", { status: 200 }))
      .mockResolvedValueOnce(new Response("nouveau", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await acquireDocument({ id: "edition", url: "https://example.test/v1", cacheDir });
    const acquired = await acquireDocument({
      id: "edition",
      url: "https://example.test/v2",
      cacheDir,
    });
    expect(acquired.bytes.toString()).toBe("nouveau");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });

  it("revalide un cache périmé avec son ETag", async () => {
    const cacheDir = await mkdtemp(path.join(tmpdir(), "program-cache-etag-"));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("stable", { status: 200, headers: { ETag: '"version-1"' } })
      )
      .mockResolvedValueOnce(new Response(null, { status: 304 }));
    vi.stubGlobal("fetch", fetchMock);
    await acquireDocument({ id: "edition", url: "https://example.test/programme", cacheDir });
    const acquired = await acquireDocument({
      id: "edition",
      url: "https://example.test/programme",
      cacheDir,
      cacheMaxAgeMs: -1,
    });
    expect(acquired.fromCache).toBe(true);
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      headers: expect.objectContaining({ "If-None-Match": '"version-1"' }),
    });
    vi.unstubAllGlobals();
  });
});
