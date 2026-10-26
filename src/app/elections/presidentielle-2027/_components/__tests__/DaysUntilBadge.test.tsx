import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DaysUntilBadge } from "../DaysUntilBadge";

afterEach(() => {
  vi.useRealTimers();
});

describe("DaysUntilBadge", () => {
  it("recompte après montage plutôt que de garder la valeur du cache", () => {
    vi.useFakeTimers({ now: new Date("2027-04-09T07:00:00Z"), toFake: ["Date"] });
    render(<DaysUntilBadge targetDate="2027-04-11T06:00:00Z" serverDays={3} />);
    expect(screen.getByText("J-2")).toBeInTheDocument();
  });

  it("disparaît une fois la date passée", () => {
    vi.useFakeTimers({ now: new Date("2027-04-12T07:00:00Z"), toFake: ["Date"] });
    const { container } = render(
      <DaysUntilBadge targetDate="2027-04-11T06:00:00Z" serverDays={1} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
