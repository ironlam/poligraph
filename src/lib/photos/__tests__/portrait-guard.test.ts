import { describe, it, expect } from "vitest";
import { screenFilename, screenGeometry, screenPortrait } from "../portrait-guard";

/**
 * The fixtures below are real P18 filenames pulled from the politicians in our
 * base on 2026-08-05, not invented examples.
 */

describe("screenFilename — non-portrait subjects", () => {
  const cases: [string, string][] = [
    ["Tombe d'André Fosset (1918–2001) 2.jpg", "André Fosset"],
    ["Tombe de François Doubin (1933–2019) 3.jpg", "François Doubin"],
    ["Tombe d'André Postel-Vinay (1911–2007) 1.jpg", "André Postel-Vinay"],
    ["HC ICART F CIM-Nice-Caucade 2024-02.jpg", "Fernand Icart"],
  ];

  it.each(cases)("rejects %s", (filename, politician) => {
    const verdict = screenFilename(filename, politician);
    expect(verdict.ok).toBe(false);
  });

  it("names the subject reason so the report is readable", () => {
    const verdict = screenFilename("Tombe de François Doubin (1933–2019) 3.jpg", "François Doubin");
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toBe("non-portrait-subject");
  });

  it("rejects coats of arms, statues and signatures", () => {
    expect(screenFilename("Blason ville fr Paris.svg", "Jean Dupont").ok).toBe(false);
    expect(screenFilename("Statue de Jean Jaurès Toulouse.jpg", "Jean Jaurès").ok).toBe(false);
    expect(screenFilename("Signature de Jean Dupont.svg", "Jean Dupont").ok).toBe(false);
    expect(screenFilename("Plaque commemorative Jean Dupont.jpg", "Jean Dupont").ok).toBe(false);
  });
});

describe("screenFilename — several people in frame", () => {
  it("rejects an explicit two-person filename", () => {
    const verdict = screenFilename("Fernand et Carl.jpg", "Fernand Le Rachinel");
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toBe("multiple-subjects");
  });

  it("rejects a filename naming another politician", () => {
    expect(screenFilename("Azzedine Taibi Michel Fourcade.jpg", "Azzédine Taïbi").ok).toBe(false);
    expect(screenFilename("Mitterrand-Baumet.jpg", "Gilbert Baumet").ok).toBe(false);
    expect(
      screenFilename("René Tomasini- Jean-Pierre Cassabel- Carcassonne 1971.jpg", "René Tomasini")
        .ok
    ).toBe(false);
  });

  it("reserves multiple-subjects for a conjunction, and reports the rest honestly", () => {
    // Measured over 554 real files: most unaccounted words are places and event
    // descriptions, so claiming a second person would be a false statement.
    const place = screenFilename("Eric_Bocquet,_sénateur,_2023_à_Roeulx,.jpg", "Eric Bocquet");
    expect(place.ok).toBe(false);
    if (!place.ok) expect(place.reason).toBe("unexplained-words");

    const scene = screenFilename(
      "Frédéric_Delannoy_Aniche_quatre_jours_de_Dunkerque.jpg",
      "Frédéric Delannoy"
    );
    expect(scene.ok).toBe(false);
    if (!scene.ok) expect(scene.reason).toBe("unexplained-words");

    const companion = screenFilename("Ségolène_Royal_&_Guillaume_Coutey.jpg", "Guillaume Coutey");
    expect(companion.ok).toBe(false);
    if (!companion.ok) expect(companion.reason).toBe("multiple-subjects");
  });

  it("accepts a photo a Commons contributor already cropped to one person", () => {
    // "(cropped)" means a human framed it on the subject; the extra names in
    // the filename describe the original scene, not what is in the frame.
    expect(
      screenFilename(
        "Catherine Pégard - courtesy call Catherine Pégard French Minister of Culture " +
          "Gakuji Ito Commissioner for Cultural Affairs 20260402 3 (cropped).jpg",
        "Catherine Pégard"
      ).ok
    ).toBe(true);
    expect(
      screenFilename(
        "Marie-Christine Boutonnet at a EP Plenary session (Cropped).jpg",
        "Marie-Christine Boutonnet"
      ).ok
    ).toBe(true);
  });
});

describe("screenFilename — own name written without separators", () => {
  // Commons filenames often glue the name together. Splitting on non-letters
  // then leaves one long token that matches neither first nor last name.
  const cases: [string, string][] = [
    ["Hervemorin2008_recadre.PNG", "Hervé Morin"],
    ["LaurentHénart.jpg", "Laurent Hénart"],
    ["AlfonsiFrancois.jpg", "François Alfonsi"],
    ["Ericka14Juillet.jpg", "Ericka Bareigts"],
  ];

  it.each(cases)("accepts %s", (filename, politician) => {
    expect(screenFilename(filename, politician).ok).toBe(true);
  });

  it("still refuses a glued name that is not the politician's", () => {
    expect(screenFilename("SegoleneRoyal.jpg", "Guillaume Coutey").ok).toBe(false);
  });
});

describe("screenFilename — photographer credits", () => {
  // "par <photographer>" is the Commons convention for attribution, and Claude
  // Truong-Ngoc alone shot a large share of the French political portraits.
  it.each([
    ["Jean-Marie_Bockel_par_Claude_Truong-Ngoc_juin_2014.jpg", "Jean-Marie Bockel"],
    ["Thierry_Repentin_par_Claude_Truong-Ngoc_avril_2013.jpg", "Thierry Repentin"],
    ["Marie Dupont by John Smith 2019.jpg", "Marie Dupont"],
  ])("accepts %s", (filename, politician) => {
    expect(screenFilename(filename, politician).ok).toBe(true);
  });

  it("does not let a credit hide a second subject named before it", () => {
    expect(
      screenFilename("Ségolène Royal & Guillaume Coutey par un photographe.jpg", "Guillaume Coutey")
        .ok
    ).toBe(false);
  });
});

describe("screenFilename — dates and scene words", () => {
  it.each([
    ["Extract_Jean-François_Debat,_mars_2012.JPG", "Jean-François Debat"],
    ["Marie Dupont janvier 2020.jpg", "Marie Dupont"],
    ["Marie Dupont, sénatrice, lors des voeux 2023.jpg", "Marie Dupont"],
  ])("accepts %s", (filename, politician) => {
    expect(screenFilename(filename, politician).ok).toBe(true);
  });
});

describe("screenFilename — plain portraits pass", () => {
  const cases: [string, string][] = [
    ["François ASSELINEAU.jpg", "François Asselineau"],
    ["David-amiel.jpg", "David Amiel"],
    ["Roussel Fabien 1.jpg", "Fabien Roussel"],
    ["Josee Massi 2026, AV.jpg", "Josée Massi"],
    ["Hubert de Jenlis 2025.jpg", "Hubert De Jenlis"],
    ["Roland Nungesser - 1967 (cropped).tif", "Roland Nungesser"],
    ["Édouard Philippe 2019 (cropped).jpg", "Édouard Philippe"],
    ["20241008-P1120704 Jeanbrun Vincent Wikipedia.jpg", "Vincent Jeanbrun"],
    ["20210819 tondelier.m-cr3.jpg", "Marine Tondelier"],
    ["SNCF Jean-Pierre Farandou (cropped).jpg", "Jean-Pierre Farandou"],
    ["Nafissa Sid Cara.jpg", "Nafissa Sid Cara"],
  ];

  it.each(cases)("accepts %s", (filename, politician) => {
    const verdict = screenFilename(filename, politician);
    expect(verdict.ok).toBe(true);
  });

  it("tolerates a misspelling of the surname in the filename", () => {
    // Commons file is "Roger Quillot.webp"; our record says "Roger Quilliot".
    expect(screenFilename("Roger Quillot.webp", "Roger Quilliot").ok).toBe(true);
  });

  it("ignores accents and case when matching the politician's own name", () => {
    expect(screenFilename("AZZEDINE TAIBI.jpg", "Azzédine Taïbi").ok).toBe(true);
  });
});

describe("screenGeometry", () => {
  it("accepts portrait and near-square images", () => {
    expect(screenGeometry({ width: 992, height: 1276 }).ok).toBe(true);
    expect(screenGeometry({ width: 800, height: 800 }).ok).toBe(true);
    expect(screenGeometry({ width: 1000, height: 800 }).ok).toBe(true);
  });

  it("rejects wide images, which are scenes rather than portraits", () => {
    const verdict = screenGeometry({ width: 1600, height: 900 });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toBe("too-wide");
  });

  it("rejects images too small to crop without visible loss", () => {
    const verdict = screenGeometry({ width: 150, height: 190 });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toBe("too-small");
  });

  it("treats missing dimensions as unusable", () => {
    expect(screenGeometry({ width: undefined, height: undefined }).ok).toBe(false);
  });
});

describe("screenPortrait", () => {
  it("combines both screens and reports the first failure", () => {
    const verdict = screenPortrait({
      filename: "Tombe de François Doubin (1933–2019) 3.jpg",
      politicianName: "François Doubin",
      width: 900,
      height: 1200,
    });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toBe("non-portrait-subject");
  });

  it("passes a clean portrait", () => {
    expect(
      screenPortrait({
        filename: "François ASSELINEAU.jpg",
        politicianName: "François Asselineau",
        width: 992,
        height: 1276,
      }).ok
    ).toBe(true);
  });

  it("fails a clean filename on bad geometry", () => {
    const verdict = screenPortrait({
      filename: "François ASSELINEAU.jpg",
      politicianName: "François Asselineau",
      width: 1600,
      height: 900,
    });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toBe("too-wide");
  });
});
