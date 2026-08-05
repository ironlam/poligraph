import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PoliticianAvatar } from "./PoliticianAvatar";

describe("PoliticianAvatar", () => {
  it("should render initials when no photo URL", () => {
    render(<PoliticianAvatar photoUrl={null} firstName="Jean" lastName="Dupont" />);
    expect(screen.getByText("JD")).toBeInTheDocument();
  });

  it("should render initials from fullName", () => {
    render(<PoliticianAvatar photoUrl={null} fullName="Marine Le Pen" />);
    expect(screen.getByText("ML")).toBeInTheDocument();
  });

  it("should render image when photo URL provided", () => {
    render(
      <PoliticianAvatar
        photoUrl="https://example.com/photo.jpg"
        firstName="Jean"
        lastName="Dupont"
      />
    );
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", "https://example.com/photo.jpg");
    expect(img).toHaveAttribute("alt", "Jean Dupont");
  });

  it("should prefer the Blob copy over the source photo", () => {
    render(
      <PoliticianAvatar
        photoUrl="https://upload.wikimedia.org/source.jpg"
        blobPhotoUrl="https://abc.public.blob.vercel-storage.com/politicians/x-portrait"
        fullName="Jean Dupont"
      />
    );
    expect(screen.getByRole("img")).toHaveAttribute(
      "src",
      "https://abc.public.blob.vercel-storage.com/politicians/x-portrait"
    );
  });

  it("should fall back to the source photo when there is no Blob copy", () => {
    render(
      <PoliticianAvatar
        photoUrl="https://upload.wikimedia.org/source.jpg"
        blobPhotoUrl={null}
        fullName="Jean Dupont"
      />
    );
    expect(screen.getByRole("img")).toHaveAttribute(
      "src",
      "https://upload.wikimedia.org/source.jpg"
    );
  });

  it("should render initials when neither photo is available", () => {
    render(<PoliticianAvatar photoUrl={null} blobPhotoUrl={null} fullName="Jean Dupont" />);
    expect(screen.getByText("JD")).toBeInTheDocument();
  });

  it("should fallback to initials on image error", () => {
    render(
      <PoliticianAvatar
        photoUrl="https://example.com/broken.jpg"
        firstName="Jean"
        lastName="Dupont"
      />
    );

    const img = screen.getByRole("img");
    fireEvent.error(img);

    expect(screen.getByText("JD")).toBeInTheDocument();
  });

  it("should apply correct size classes", () => {
    const { container, rerender } = render(
      <PoliticianAvatar photoUrl={null} firstName="A" lastName="B" size="sm" />
    );
    expect(container.firstChild).toHaveClass("w-10", "h-10");

    rerender(<PoliticianAvatar photoUrl={null} firstName="A" lastName="B" size="lg" />);
    expect(container.firstChild).toHaveClass("w-24", "h-24");
  });

  it("should handle missing first name gracefully", () => {
    render(<PoliticianAvatar photoUrl={null} lastName="Dupont" />);
    // Should show "?D" for missing first initial
    expect(screen.getByText("?D")).toBeInTheDocument();
  });

  it("should apply custom className", () => {
    const { container } = render(
      <PoliticianAvatar photoUrl={null} firstName="A" lastName="B" className="custom-class" />
    );
    expect(container.firstChild).toHaveClass("custom-class");
  });
});
