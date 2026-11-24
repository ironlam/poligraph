import { afterEach, describe, expect, it, vi } from "vitest";
import {
  UMAMI_BEFORE_SEND_HANDLER,
  UMAMI_BEFORE_SEND_SCRIPT,
  UMAMI_EXCLUDE_META_NAME,
  matchesExcludeSignature,
  parseExcludeSignature,
  serializeExcludeSignature,
  type ExcludeSignature,
} from "./umami-bot-filter";

// Valeurs fictives : la vraie signature vit dans Vercel, jamais dans le dépôt public.
const SIGNATURE: ExcludeSignature = {
  screen: "1111x2222",
  language: "xx-YY",
  userAgentFragment: "FakeOS 1.0",
};
const MATCHING_UA = "Mozilla/5.0 (FakeOS 1.0) AppleWebKit/537.36 Chrome/131.0.0.0";
const OTHER_UA = "Mozilla/5.0 (OtherOS 2.0) AppleWebKit/537.36 Chrome/131.0.0.0";
const matchingPayload = { screen: "1111x2222", language: "xx-YY", url: "/" };

describe("parseExcludeSignature", () => {
  it("lit les trois critères", () => {
    expect(parseExcludeSignature("1111x2222;xx-YY;FakeOS 1.0")).toEqual(SIGNATURE);
  });

  it("fait l'aller-retour avec serializeExcludeSignature", () => {
    expect(parseExcludeSignature(serializeExcludeSignature(SIGNATURE))).toEqual(SIGNATURE);
  });

  // Une configuration incomplète ne doit jamais dégénérer en filtre sur un critère seul.
  it.each([
    ["absente", undefined],
    ["vide", ""],
    ["à deux critères", "1111x2222;xx-YY"],
    ["à quatre critères", "a;b;c;d"],
    ["avec un critère vide", "1111x2222;;FakeOS"],
    ["avec des caractères inattendus", '1111x2222;xx-YY;"><script>'],
  ])("désactive le filtre si la variable est %s", (_label, raw) => {
    expect(parseExcludeSignature(raw)).toBeNull();
  });
});

describe("matchesExcludeSignature", () => {
  it("reconnaît la combinaison complète", () => {
    expect(matchesExcludeSignature(matchingPayload, MATCHING_UA, SIGNATURE)).toBe(true);
  });

  // Chaque critère seul est porté par de vrais visiteurs : un seul écart doit suffire à laisser passer.
  it.each([
    ["écran différent", { ...matchingPayload, screen: "1111x2223" }, MATCHING_UA],
    ["langue différente", { ...matchingPayload, language: "fr-FR" }, MATCHING_UA],
    ["user-agent différent", matchingPayload, OTHER_UA],
    ["payload sans écran", { language: "xx-YY" }, MATCHING_UA],
  ])("laisse passer un visiteur avec %s", (_label, payload, ua) => {
    expect(matchesExcludeSignature(payload, ua, SIGNATURE)).toBe(false);
  });
});

describe("UMAMI_BEFORE_SEND_SCRIPT", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.head.innerHTML = "";
  });

  function loadHandler(userAgent: string, metaContent?: string) {
    if (metaContent !== undefined) {
      const meta = document.createElement("meta");
      meta.name = UMAMI_EXCLUDE_META_NAME;
      meta.content = metaContent;
      document.head.appendChild(meta);
    }
    const win: Record<string, unknown> = {};
    vi.stubGlobal("navigator", { userAgent });
    new Function("window", UMAMI_BEFORE_SEND_SCRIPT)(win);
    return win[UMAMI_BEFORE_SEND_HANDLER] as (type: string, payload: unknown) => unknown;
  }

  it("annule l'envoi quand la signature correspond, quel que soit le type", () => {
    const handler = loadHandler(MATCHING_UA, serializeExcludeSignature(SIGNATURE));
    expect(handler("event", matchingPayload)).toBeFalsy();
    expect(handler("identify", matchingPayload)).toBeFalsy();
  });

  it("laisse tout passer sans balise meta (variable non configurée)", () => {
    const handler = loadHandler(MATCHING_UA);
    expect(handler("event", matchingPayload)).toBe(matchingPayload);
  });

  it("rend le même verdict que matchesExcludeSignature", () => {
    const cases = [
      [matchingPayload, MATCHING_UA],
      [{ ...matchingPayload, language: "fr-FR" }, MATCHING_UA],
      [matchingPayload, OTHER_UA],
    ] as const;
    for (const [payload, ua] of cases) {
      document.head.innerHTML = "";
      const handler = loadHandler(ua, serializeExcludeSignature(SIGNATURE));
      expect(!handler("event", payload)).toBe(matchesExcludeSignature(payload, ua, SIGNATURE));
    }
  });

  // Le script est écrit en littéral : ce test empêche qu'il diverge des constantes exportées.
  it("cible le handler et la balise meta exportés", () => {
    expect(UMAMI_BEFORE_SEND_SCRIPT).toContain(`window.${UMAMI_BEFORE_SEND_HANDLER}=`);
    expect(UMAMI_BEFORE_SEND_SCRIPT).toContain(`meta[name="${UMAMI_EXCLUDE_META_NAME}"]`);
  });
});
