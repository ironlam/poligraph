import type { Meta, StoryObj } from "@storybook/react";
import { Logo } from "./Logo";
import { BRAND_NAVY, BRAND_RED, BRAND_PAGE } from "@/config/brand";
import { Ban } from "lucide-react";

const meta: Meta<typeof Logo> = {
  title: "Foundations/Brand & Logo",
  component: Logo,
};
export default meta;
type Story = StoryObj<typeof Logo>;

export const Principal: Story = {
  render: () => (
    <div style={{ background: BRAND_PAGE, padding: 32 }}>
      <Logo size={64} withWordmark />
    </div>
  ),
};

export const SurFondMarine: Story = {
  render: () => (
    <div className="dark" style={{ background: BRAND_NAVY, padding: 32 }}>
      <Logo size={64} withWordmark />
    </div>
  ),
};

export const Tailles: Story = {
  render: () => (
    <div
      style={{
        display: "flex",
        gap: 24,
        alignItems: "flex-end",
        background: BRAND_PAGE,
        color: BRAND_NAVY,
        padding: 32,
      }}
    >
      {[16, 24, 32, 40, 64].map((s) => (
        <div key={s} style={{ textAlign: "center" }}>
          <Logo size={s} />
          <div style={{ fontSize: 12, marginTop: 8 }}>{s}px</div>
        </div>
      ))}
    </div>
  ),
};

export const Palette: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 16 }}>
      {[
        ["Navy", BRAND_NAVY],
        ["Rouge", BRAND_RED],
        ["Pages", BRAND_PAGE],
      ].map(([label, hex]) => (
        <div key={hex} style={{ textAlign: "center" }}>
          <div
            style={{
              width: 64,
              height: 64,
              background: hex,
              border: "1px solid #ccc",
              borderRadius: 8,
            }}
          />
          <div style={{ fontSize: 12, marginTop: 4 }}>{label}</div>
          <code style={{ fontSize: 11 }}>{hex}</code>
        </div>
      ))}
    </div>
  ),
};

export const Attribution: Story = {
  render: () => (
    <p style={{ maxWidth: 520, fontSize: 14, lineHeight: 1.5 }}>
      Concept inspiré d&apos;une illustration d&apos;Adi Irawan (Vecteezy), puis redessiné pour
      Poligraph. Le rouge du logo (#ed2939) est une couleur de marque : il ne doit pas être confondu
      avec la couleur fonctionnelle « signal / danger » (--brand / --destructive) réservée aux
      alertes et condamnations.
    </p>
  ),
};

export const Monochrome: Story = {
  render: () => (
    <div
      style={{
        display: "flex",
        gap: 24,
        alignItems: "center",
        background: "#fbfaf7",
        color: BRAND_NAVY,
        padding: 32,
      }}
    >
      <img src="/logo-mono.svg" alt="" width={72} height={72} />
      <p style={{ maxWidth: 42 + "ch", fontSize: 14, margin: 0 }}>
        Version monochrome (marine fixe), pour les usages à une seule couleur.
      </p>
    </div>
  ),
};

export const ZoneDeProtection: Story = {
  render: () => (
    <div style={{ background: BRAND_PAGE, color: BRAND_NAVY, padding: 32 }}>
      <div style={{ display: "inline-block", border: "1px dashed #9aa4b2", padding: 24 }}>
        <Logo size={64} withWordmark />
      </div>
      <p style={{ maxWidth: "52ch", fontSize: 14, marginTop: 12 }}>
        Réserver autour du logo un espace libre au moins égal à la hauteur de la marque. Ne rien
        placer dans cette zone (texte, autre logo, bord d&apos;image).
      </p>
    </div>
  ),
};

export const UsagesInterdits: Story = {
  render: () => {
    const dont = (label: string, child: React.ReactNode) => (
      <figure style={{ margin: 0, width: 200 }}>
        <div
          style={{
            background: BRAND_PAGE,
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: 16,
            height: 96,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          {child}
        </div>
        <figcaption
          style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, marginTop: 6 }}
        >
          <Ban
            size={16}
            aria-hidden="true"
            style={{ color: "var(--destructive)", flexShrink: 0 }}
          />
          <span>
            <strong>Ne pas :</strong> {label}
          </span>
        </figcaption>
      </figure>
    );
    return (
      <section>
        <h2 style={{ fontFamily: "var(--font-display)" }}>Usages interdits</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 24 }}>
          {dont(
            "étirer / déformer",
            <img
              src="/logo.svg"
              alt=""
              aria-hidden="true"
              style={{ width: 120, height: 48, objectFit: "fill" }}
            />
          )}
          {dont(
            "recolorer hors palette",
            <img
              src="/logo.svg"
              alt=""
              aria-hidden="true"
              style={{ width: 64, height: 64, filter: "hue-rotate(120deg)" }}
            />
          )}
          {dont(
            "poser sur fond peu contrasté",
            <div style={{ background: "#3a4a5f", padding: 8, borderRadius: 6 }}>
              <img
                src="/logo.svg"
                alt=""
                aria-hidden="true"
                style={{ width: 48, height: 48, opacity: 0.5 }}
              />
            </div>
          )}
        </div>
      </section>
    );
  },
};

export const MicroMarqueFavicon: Story = {
  render: () => (
    <section>
      <h2 style={{ fontFamily: "var(--font-display)" }}>Micro-marque (favicon)</h2>
      <div style={{ display: "flex", gap: 24, alignItems: "flex-end" }}>
        {[16, 24, 32].map((s) => (
          <div key={s} style={{ textAlign: "center" }}>
            <img src="/icon-192.png" alt="" aria-hidden="true" width={s} height={s} />
            <div style={{ fontSize: 12, marginTop: 6 }}>{s}px</div>
          </div>
        ))}
      </div>
      <p style={{ maxWidth: "52ch", fontSize: 14, marginTop: 12 }}>
        Sous 20px, le logo complet devient illisible : on utilise la micro-marque (face de la
        chouette) pour le favicon et les tuiles.
      </p>
    </section>
  ),
};

export const BarreAccentTricolore: Story = {
  render: () => (
    <section>
      <h2 style={{ fontFamily: "var(--font-display)" }}>Barre accent tricolore</h2>
      <div
        aria-hidden="true"
        style={{
          height: 3,
          width: 280,
          background:
            "linear-gradient(90deg, var(--primary) 0 33.3%, #ffffff 33.3% 66.6%, #ed2939 66.6% 100%)",
        }}
      />
      <p style={{ maxWidth: "52ch", fontSize: 14, marginTop: 12 }}>
        Fine barre bleu / blanc / rouge (3px) en tête de page : signature de marque, à réserver au
        haut des surfaces principales.
      </p>
    </section>
  ),
};
