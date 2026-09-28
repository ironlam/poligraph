import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * Chaque producteur de mandats horodate ce que sa source vient de confirmer.
 *
 * Sans cet horodatage, rien ne distingue un mandat qu'une source affirme aujourd'hui d'un
 * mandat que personne n'a confirmé depuis six mois. C'est ce qui rend indécidables les cumuls
 * parlementaire + maire : le vote dit que le siège est tenu, le registre dit que la mairie
 * l'est aussi, et aucune date ne permet de dire laquelle des deux sources parle du présent.
 */
const PRODUCERS = [
  "src/services/sync/deputes.ts",
  "src/services/sync/senateurs.ts",
  "src/services/sync/rne.ts",
  "src/services/sync/gouvernement.ts",
  "src/services/sync/europarl.ts",
];

describe("producteurs de mandats", () => {
  it.each(PRODUCERS)("%s horodate ce que sa source confirme", (path) => {
    // Les commentaires sont retirés avant la recherche : sinon la garde se satisferait du mot
    // écrit dans un commentaire et passerait au vert sans qu'une ligne soit écrite.
    const source = readFileSync(path, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");

    expect(source).toMatch(/lastConfirmedAt\s*:/);
  });
});
