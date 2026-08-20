import { describe, expect, it } from "vitest";
import {
  ADMIN_NAVIGATION_GROUPS,
  ADMIN_NAVIGATION,
  isAdminNavigationActive,
} from "./admin-navigation";

describe("admin navigation registry", () => {
  it("exposes the four work-oriented groups", () => {
    expect(ADMIN_NAVIGATION_GROUPS.map((group) => group.label)).toEqual([
      "À traiter",
      "Contenus",
      "Qualité et liaisons",
      "Opérations",
    ]);
  });

  it("keeps important routes unique and uses the unambiguous politician label", () => {
    const routes = ADMIN_NAVIGATION.map((entry) => entry.href);
    expect(new Set(routes).size).toBe(routes.length);
    expect(ADMIN_NAVIGATION.find((entry) => entry.id === "politicians")?.label).toBe(
      "Personnalités politiques"
    );
  });

  it("does not activate Affairs for its proposal sub-route", () => {
    const affairs = ADMIN_NAVIGATION.find((entry) => entry.id === "affairs")!;
    const proposals = ADMIN_NAVIGATION.find((entry) => entry.id === "proposals")!;
    expect(isAdminNavigationActive("/admin/affaires/propositions", affairs)).toBe(false);
    expect(isAdminNavigationActive("/admin/affaires/propositions", proposals)).toBe(true);
  });

  it("activates the audit entry for its quality sub-route", () => {
    const audit = ADMIN_NAVIGATION.find((entry) => entry.id === "audit")!;
    expect(isAdminNavigationActive("/admin/audit/bio-quality", audit)).toBe(true);
  });
});
