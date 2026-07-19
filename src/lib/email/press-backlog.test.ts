import { describe, expect, it } from "vitest";
import {
  PRESS_BACKLOG_THRESHOLD_DEFAULT,
  buildPressBacklogEmail,
  shouldNotifyPressBacklog,
} from "./press-backlog";

describe("shouldNotifyPressBacklog", () => {
  it("notifies at or above the threshold", () => {
    expect(shouldNotifyPressBacklog(30, 30)).toBe(true);
    expect(shouldNotifyPressBacklog(45, 30)).toBe(true);
  });

  it("stays quiet below the threshold", () => {
    expect(shouldNotifyPressBacklog(29, 30)).toBe(false);
    expect(shouldNotifyPressBacklog(0, 30)).toBe(false);
  });

  it("has a sane default threshold", () => {
    expect(PRESS_BACKLOG_THRESHOLD_DEFAULT).toBe(30);
  });
});

describe("buildPressBacklogEmail", () => {
  it("mentions the backlog count and the catch-up command", () => {
    const email = buildPressBacklogEmail(42, 3);
    expect(email.subject).toContain("42");
    expect(email.text).toContain("42");
    expect(email.text).toContain("sync:press-analysis");
    expect(email.html).toContain("sync:press-analysis");
    expect(email.text).toContain("3 derniers jours");
  });

  it("keeps French accents and avoids em/en dashes in user-facing copy", () => {
    const email = buildPressBacklogEmail(42, 3);
    expect(email.subject).toMatch(/[éèàêôçûî]/);
    for (const part of [email.subject, email.text, email.html]) {
      expect(part).not.toContain("—");
      expect(part).not.toContain("–");
    }
  });
});
