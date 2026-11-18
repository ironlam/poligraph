import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PoliticianAvatar } from "@/components/politicians/PoliticianAvatar";

const photo = "https://atbizpygfljpqx0u.public.blob.vercel-storage.com/politicians/x.jpg";

describe("PoliticianAvatar fixedPx", () => {
  it("sizes the image with width/height instead of fill + sizes", () => {
    const { container } = render(
      <PoliticianAvatar photoUrl={null} blobPhotoUrl={photo} fullName="Jean Test" fixedPx={48} />
    );
    const img = container.querySelector("img")!;
    // next/image is mocked as a plain <img> in tests: assert the props that select a 1x/2x srcSet.
    expect(img.getAttribute("sizes")).toBeNull();
    expect(img.getAttribute("width")).toBe("48");
    expect(img.getAttribute("height")).toBe("48");
  });

  it("sizes the image from `size` by default, never with fill + sizes", () => {
    const { container } = render(
      <PoliticianAvatar photoUrl={null} blobPhotoUrl={photo} fullName="Jean Test" size="sm" />
    );
    const img = container.querySelector("img")!;
    expect(img.getAttribute("sizes")).toBeNull();
    expect(img.getAttribute("width")).toBe("40");
    expect(img.getAttribute("height")).toBe("40");
  });
});
