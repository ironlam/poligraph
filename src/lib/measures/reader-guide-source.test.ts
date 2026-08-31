import { describe, expect, it } from "vitest";
import { isOfficialInstitutionUrl } from "./reader-guide-source";

describe("sources institutionnelles des repères", () => {
  it("accepte les domaines publics officiels en HTTPS", () => {
    expect(
      isOfficialInstitutionUrl(
        "https://www.ecologie.gouv.fr/politiques-publiques/zones-faibles-emissions-zfe"
      )
    ).toBe(true);
    expect(isOfficialInstitutionUrl("https://www.service-public.fr/particuliers/vosdroits")).toBe(
      true
    );
  });

  it("refuse HTTP, les domaines ressemblants et les identifiants intégrés", () => {
    expect(isOfficialInstitutionUrl("http://www.ecologie.gouv.fr/page")).toBe(false);
    expect(isOfficialInstitutionUrl("https://ecologie.gouv.fr.example.org/page")).toBe(false);
    expect(isOfficialInstitutionUrl("https://user@ecologie.gouv.fr/page")).toBe(false);
  });
});
