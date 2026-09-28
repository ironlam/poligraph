import type { Metadata } from "next";
import { Suspense } from "react";
import localFont from "next/font/local";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { NavigationProgress } from "@/components/layout/NavigationProgress";
import { WebSiteJsonLd } from "@/components/seo/JsonLd";
import { ChatWidget } from "@/components/chat/ChatWidget";
import { CommandPaletteProvider, CommandPalette } from "@/components/search";
import { TooltipProvider } from "@/components/ui/tooltip";
import { UmamiAnalytics } from "@/components/analytics/UmamiAnalytics";
import { Toaster } from "@/components/ui/sonner";
import { ServiceWorkerRegistration } from "@/components/pwa/ServiceWorkerRegistration";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { SITE_URL } from "@/config/site";
import "./globals.css";

// Fonts are served from the repository rather than fetched from Google Fonts during the build.
// `next/font/google` is a build-time loader: it downloaded these same files and self-hosted them
// with the assets, so visitors never called Google either way. What it also did was make every
// production build depend on fonts.googleapis.com being reachable, and an outage there failed the
// deploy. See src/fonts/README.md for provenance and how to refresh the files.
//
// Outfit ships as a variable font: Google serves one file for the whole weight axis and declares
// it twice, at 700 and at 800. Hence a single file with a weight range here, where Atkinson
// Hyperlegible needs one file per weight.
const outfit = localFont({
  src: [{ path: "../fonts/Outfit-latin-variable.woff2", weight: "700 800", style: "normal" }],
  variable: "--font-display",
  display: "swap",
  adjustFontFallback: "Arial",
});

const atkinson = localFont({
  src: [
    { path: "../fonts/AtkinsonHyperlegible-latin-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/AtkinsonHyperlegible-latin-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-body",
  display: "swap",
  adjustFontFallback: "Arial",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Poligraph",
    template: "%s | Poligraph",
  },
  description:
    "Observatoire citoyen de la vie politique. Mandats, votes, patrimoine, affaires judiciaires et fact-checking.",
  keywords: [
    "poligraph",
    "politique",
    "france",
    "députés",
    "sénateurs",
    "transparence",
    "représentants",
    "assemblée nationale",
    "affaires judiciaires",
    "patrimoine",
    "HATVP",
    "fact-checking",
    "votes",
  ],
  authors: [{ name: "Poligraph" }],
  creator: "Poligraph",
  openGraph: {
    type: "website",
    locale: "fr_FR",
    url: SITE_URL,
    siteName: "Poligraph",
    title: "Poligraph",
    description:
      "Observatoire citoyen de la vie politique. Mandats, votes, patrimoine, affaires judiciaires et fact-checking.",
    // Image generated automatically by opengraph-image.tsx
  },
  twitter: {
    card: "summary_large_image",
    title: "Poligraph",
    description: "Observatoire citoyen de la vie politique. Fact-checking et données publiques.",
    // Image generated automatically by opengraph-image.tsx
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const chatEnabled = await isFeatureEnabled("CHATBOT_ENABLED");

  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        {/* Preconnect to analytics origin — saves ~300ms on first request */}
        <link rel="dns-prefetch" href="https://api-gateway.umami.dev" />
        <link rel="preconnect" href="https://api-gateway.umami.dev" crossOrigin="anonymous" />
        <WebSiteJsonLd
          name="Poligraph"
          description="Observatoire citoyen de la vie politique. Mandats, votes, patrimoine, affaires judiciaires et fact-checking."
          url={SITE_URL}
        />
        <link
          rel="alternate"
          type="application/rss+xml"
          title="Poligraph — Affaires"
          href="/api/rss/affaires.xml"
        />
        <link
          rel="alternate"
          type="application/rss+xml"
          title="Poligraph — Votes"
          href="/api/rss/votes.xml"
        />
        <link
          rel="alternate"
          type="application/rss+xml"
          title="Poligraph — Fact-checks"
          href="/api/rss/factchecks.xml"
        />
        <UmamiAnalytics />
      </head>
      <body
        className={`${outfit.variable} ${atkinson.variable} antialiased min-h-screen flex flex-col overflow-x-hidden`}
      >
        <ServiceWorkerRegistration />
        <ThemeProvider>
          <TooltipProvider>
            <CommandPaletteProvider>
              <Suspense fallback={null}>
                <NavigationProgress />
              </Suspense>
              {/* Skip to main content link for keyboard navigation */}
              <a href="#main-content" className="skip-link">
                Aller au contenu principal
              </a>
              {/* Accent bar — brand identity */}
              <div
                className="h-[3px] w-full"
                style={{
                  background: "linear-gradient(90deg, var(--brand), var(--primary))",
                }}
                aria-hidden="true"
              />
              <Header />
              <main id="main-content" role="main" className="flex-1 overflow-x-clip" tabIndex={-1}>
                {children}
              </main>
              <Footer />
              <CommandPalette />
              {chatEnabled && <ChatWidget />}
              <Toaster />
              <InstallPrompt />
            </CommandPaletteProvider>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
