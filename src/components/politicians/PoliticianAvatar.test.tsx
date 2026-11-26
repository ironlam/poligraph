import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PoliticianAvatar } from "./PoliticianAvatar";

describe("PoliticianAvatar", () => {
  it("should render initials when no photo URL", () => {
    render(
      <PoliticianAvatar blobPhotoUrl={null} photoUrl={null} firstName="Jean" lastName="Dupont" />
    );
    expect(screen.getByText("JD")).toBeInTheDocument();
  });

  it("should render initials from fullName", () => {
    render(<PoliticianAvatar blobPhotoUrl={null} photoUrl={null} fullName="Marine Le Pen" />);
    expect(screen.getByText("ML")).toBeInTheDocument();
  });

  it("should render image when photo URL provided", () => {
    render(
      <PoliticianAvatar
        blobPhotoUrl={null}
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
      "https://abc.public.blob.vercel-storage.com/politicians/x-portrait.thumb-192.webp"
    );
  });

  // Chaque avatar passait par /_next/image (~180k requêtes/jour facturées). La miniature est servie
  // directement par le CDN Blob ; le grand format garde l'optimiseur.
  describe("miniature Blob", () => {
    const BLOB = "https://abc.public.blob.vercel-storage.com/politicians/x-portrait-Ab1.jpg";

    it("sert la miniature, sans optimiseur, pour un petit avatar", () => {
      render(
        <PoliticianAvatar photoUrl={null} blobPhotoUrl={BLOB} fullName="Jean Dupont" size="lg" />
      );
      expect(screen.getByRole("img")).toHaveAttribute("src", `${BLOB}.thumb-192.webp`);
    });

    it("garde la photo d'origine pour le grand format", () => {
      render(
        <PoliticianAvatar photoUrl={null} blobPhotoUrl={BLOB} fullName="Jean Dupont" size="xl" />
      );
      expect(screen.getByRole("img")).toHaveAttribute("src", BLOB);
    });

    it("revient à la photo d'origine si la miniature manque, puis aux initiales", () => {
      render(<PoliticianAvatar photoUrl={null} blobPhotoUrl={BLOB} fullName="Jean Dupont" />);
      fireEvent.error(screen.getByRole("img"));
      expect(screen.getByRole("img")).toHaveAttribute("src", BLOB);
      fireEvent.error(screen.getByRole("img"));
      expect(screen.getByText("JD")).toBeInTheDocument();
    });

    it("ne cherche pas de miniature pour une photo hors Blob", () => {
      render(
        <PoliticianAvatar
          photoUrl="https://upload.wikimedia.org/source.jpg"
          blobPhotoUrl={null}
          fullName="Jean Dupont"
          size="sm"
        />
      );
      expect(screen.getByRole("img")).toHaveAttribute(
        "src",
        "https://upload.wikimedia.org/source.jpg"
      );
    });
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
        blobPhotoUrl={null}
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
      <PoliticianAvatar blobPhotoUrl={null} photoUrl={null} firstName="A" lastName="B" size="sm" />
    );
    expect(container.firstChild).toHaveClass("w-10", "h-10");

    rerender(
      <PoliticianAvatar blobPhotoUrl={null} photoUrl={null} firstName="A" lastName="B" size="lg" />
    );
    expect(container.firstChild).toHaveClass("w-24", "h-24");
  });

  it("should handle missing first name gracefully", () => {
    render(<PoliticianAvatar blobPhotoUrl={null} photoUrl={null} lastName="Dupont" />);
    // Should show "?D" for missing first initial
    expect(screen.getByText("?D")).toBeInTheDocument();
  });

  it("should apply custom className", () => {
    const { container } = render(
      <PoliticianAvatar
        blobPhotoUrl={null}
        photoUrl={null}
        firstName="A"
        lastName="B"
        className="custom-class"
      />
    );
    expect(container.firstChild).toHaveClass("custom-class");
  });
});
