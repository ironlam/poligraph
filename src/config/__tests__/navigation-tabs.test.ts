import { describe, expect, it } from "vitest";
import { NAV_TABS, getActiveTabHref } from "../navigation";

describe("NAV_TABS", () => {
  it("leaves the fifth slot of the bar to the menu button", () => {
    expect(NAV_TABS).toHaveLength(4);
  });

  it("keeps every label short enough for a fifth of a 320px screen", () => {
    for (const tab of NAV_TABS) {
      expect(tab.label.length, tab.label).toBeLessThanOrEqual(8);
    }
  });

  it("gives a spoken name to a label that is only a number", () => {
    for (const tab of NAV_TABS) {
      if (/^\d+$/.test(tab.label)) expect(tab.ariaLabel, tab.label).toBeTruthy();
    }
  });

  it("points each tab inside the section that lights it", () => {
    for (const tab of NAV_TABS) {
      expect(tab.href === tab.match || tab.href.startsWith(`${tab.match}/`), tab.href).toBe(true);
    }
  });
});

describe("getActiveTabHref", () => {
  it("lights a tab on its landing page and on the pages below it", () => {
    expect(getActiveTabHref("/politiques")).toBe("/politiques");
    expect(getActiveTabHref("/politiques/prenom-nom")).toBe("/politiques");
    expect(getActiveTabHref("/affaires/condamnations")).toBe("/affaires");
  });

  it("lights Votes across the whole Parlement section", () => {
    expect(getActiveTabHref("/parlement")).toBe("/parlement/votes");
    expect(getActiveTabHref("/parlement/dossiers")).toBe("/parlement/votes");
  });

  it("lights the election tab on its own election only", () => {
    expect(getActiveTabHref("/elections/presidentielle-2027/candidats")).toBe(
      "/elections/presidentielle-2027"
    );
    expect(getActiveTabHref("/elections/senatoriales-2026")).toBeNull();
  });

  it("does not match a path that merely starts with the same letters", () => {
    expect(getActiveTabHref("/affaires-etrangeres")).toBeNull();
    expect(getActiveTabHref("/")).toBeNull();
  });
});
