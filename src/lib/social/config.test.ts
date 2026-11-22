import { describe, it, expect, vi, afterEach } from "vitest";
import {
  isSensitiveCategory,
  isAutoPostEnabled,
  requiresAdminApproval,
  SOCIAL_CATEGORIES,
} from "./config";

describe("social config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("has exactly 10 categories", () => {
    expect(SOCIAL_CATEGORIES).toHaveLength(10);
  });

  it("requires an admin approval for judicial affairs only", () => {
    expect(requiresAdminApproval("affaires")).toBe(true);
    expect(requiresAdminApproval("votes")).toBe(false);
    expect(requiresAdminApproval("opendata")).toBe(false);
  });

  it("does not include consensus or presse", () => {
    expect(SOCIAL_CATEGORIES).not.toContain("consensus");
    expect(SOCIAL_CATEGORIES).not.toContain("presse");
  });

  it("includes methodo", () => {
    expect(SOCIAL_CATEGORIES).toContain("methodo");
  });

  it("marks all categories as sensitive", () => {
    for (const cat of SOCIAL_CATEGORIES) {
      expect(isSensitiveCategory(cat)).toBe(true);
    }
  });

  it("auto-post is enabled by default", () => {
    expect(isAutoPostEnabled()).toBe(true);
  });

  it("auto-post is disabled when SOCIAL_AUTO_POST=false", () => {
    vi.stubEnv("SOCIAL_AUTO_POST", "false");
    expect(isAutoPostEnabled()).toBe(false);
  });
});
