import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { BackToTop } from "./BackToTop";

const route = vi.hoisted(() => ({ pathname: "/parlement/votes" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));

const NAME = "Revenir en haut de la page";

function scrollTo(y: number) {
  Object.defineProperty(window, "scrollY", { value: y, configurable: true });
  act(() => {
    window.dispatchEvent(new Event("scroll"));
    vi.runAllTimers();
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
  route.pathname = "/parlement/votes";
  Object.defineProperty(window, "innerHeight", { value: 700, configurable: true });
  Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as never;
  window.scrollTo = vi.fn() as never;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("BackToTop", () => {
  it("reste absent en haut de page et apparaît après un écran et demi", () => {
    render(<BackToTop />);
    act(() => vi.runAllTimers());
    expect(screen.queryByRole("button", { name: NAME })).toBeNull();

    scrollTo(1000);
    expect(screen.queryByRole("button", { name: NAME })).toBeNull();

    scrollTo(1100);
    expect(screen.getByRole("button", { name: NAME })).toHaveAttribute("title", NAME);
  });

  it("remonte en haut et rend le focus au contenu", () => {
    const main = document.createElement("main");
    main.id = "main-content";
    main.tabIndex = -1;
    document.body.append(main);
    render(<BackToTop />);
    scrollTo(2000);

    fireEvent.click(screen.getByRole("button", { name: NAME }));

    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
    expect(document.activeElement).toBe(main);
    main.remove();
  });

  it("ne glisse pas quand le lecteur a demandé moins d'animations", () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as never;
    render(<BackToTop />);
    scrollTo(2000);

    fireEvent.click(screen.getByRole("button", { name: NAME }));

    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "auto" });
  });

  it("se place au-dessus de la barre d'action d'une affaire, et s'efface en admin", () => {
    route.pathname = "/affaires/une-affaire";
    const { unmount } = render(<BackToTop />);
    scrollTo(2000);
    expect(screen.getByRole("button", { name: NAME }).className).toContain("+5.5rem");
    unmount();

    route.pathname = "/admin/affaires";
    render(<BackToTop />);
    scrollTo(2000);
    expect(screen.queryByRole("button", { name: NAME })).toBeNull();
  });
});
