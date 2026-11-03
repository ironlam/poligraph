import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { YoutubeShortPlayer } from "./YoutubeShortPlayer";

const ID = "abcdefghijk";

describe("YoutubeShortPlayer", () => {
  it("ne charge aucun iframe avant le clic", () => {
    const { container } = render(<YoutubeShortPlayer videoId={ID} title="Un vote" />);
    expect(container.querySelector("iframe")).toBeNull();
  });

  it("charge l'iframe youtube-nocookie au clic", () => {
    const { container } = render(<YoutubeShortPlayer videoId={ID} title="Un vote" />);
    fireEvent.click(screen.getByRole("button", { name: /lire la vidéo/i }));
    const iframe = container.querySelector("iframe");
    expect(iframe).not.toBeNull();
    expect(iframe!.getAttribute("src")).toMatch(
      /^https:\/\/www\.youtube-nocookie\.com\/embed\/abcdefghijk\?/
    );
    expect(iframe).toHaveAttribute("title", "Un vote");
  });

  it("donne le focus à l'iframe après le clic, pour le clavier et les lecteurs d'écran", () => {
    const { container } = render(<YoutubeShortPlayer videoId={ID} title="Un vote" />);
    fireEvent.click(screen.getByRole("button", { name: /lire la vidéo/i }));
    const iframe = container.querySelector("iframe");
    expect(document.activeElement).toBe(iframe);
  });

  it("garde un lien de repli vers YouTube, sans JavaScript", () => {
    render(<YoutubeShortPlayer videoId={ID} title="Un vote" />);
    expect(screen.getByRole("link", { name: /voir sur youtube/i })).toHaveAttribute(
      "href",
      `https://www.youtube.com/shorts/${ID}`
    );
  });
});
