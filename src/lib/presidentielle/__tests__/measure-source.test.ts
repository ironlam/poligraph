import { describe, expect, it } from "vitest";
import { pickMeasureSourceUrl } from "../measure-source";

const INTERVIEW = { url: "https://presse.example/interview", tier: "SECONDARY" };
const PROGRAMME = { url: "https://parti.example/programme.pdf", tier: "PRIMARY" };

describe("pickMeasureSourceUrl", () => {
  it("préfère la source primaire, même arrivée après une secondaire", () => {
    // La régression que ça verrouille : les sources sont triées par `publishedAt asc`, donc
    // `sources[0]` est la PLUS ANCIENNE. Sur une mesure annoncée en interview puis inscrite au
    // programme, citer la première revient à citer l'interview à côté d'une mesure que le
    // programme porte.
    expect(pickMeasureSourceUrl([INTERVIEW, PROGRAMME])).toBe(PROGRAMME.url);
  });

  it("prend la primaire quand elle est déjà la première", () => {
    expect(pickMeasureSourceUrl([PROGRAMME, INTERVIEW])).toBe(PROGRAMME.url);
  });

  it("retombe sur la source disponible quand aucune n'est primaire", () => {
    // `PUBLIC_MEASURE_WHERE` exige UNE source, pas une source primaire : une mesure adossée à un
    // seul article est publiable et doit montrer d'où elle vient. Renvoyer null masquerait une
    // source réelle pour faire respecter une préférence.
    expect(pickMeasureSourceUrl([INTERVIEW])).toBe(INTERVIEW.url);
  });

  it("prend la plus ancienne des secondaires, l'ordre du chargement faisant foi", () => {
    const seconde = { url: "https://presse.example/plus-tard", tier: "SECONDARY" };
    expect(pickMeasureSourceUrl([INTERVIEW, seconde])).toBe(INTERVIEW.url);
  });

  it("renvoie null sans aucune source", () => {
    expect(pickMeasureSourceUrl([])).toBeNull();
  });
});
