import Script from "next/script";
import {
  UMAMI_BEFORE_SEND_HANDLER,
  UMAMI_BEFORE_SEND_SCRIPT,
  UMAMI_EXCLUDE_META_NAME,
  parseExcludeSignature,
  serializeExcludeSignature,
} from "@/lib/umami-bot-filter";

export function UmamiAnalytics() {
  const websiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;
  const umamiUrl = process.env.NEXT_PUBLIC_UMAMI_URL;

  if (!websiteId || !umamiUrl) {
    return null;
  }

  const excludeSignature = parseExcludeSignature(process.env.UMAMI_EXCLUDE_SIGNATURE);

  return (
    <>
      {excludeSignature && (
        <meta
          name={UMAMI_EXCLUDE_META_NAME}
          content={serializeExcludeSignature(excludeSignature)}
        />
      )}
      {/* beforeInteractive : Umami exige que le handler existe sur window avant son
          chargement. Le script fait quelques centaines d'octets et, en App Router, ne bloque
          pas l'hydratation. La règle ESLint ci-dessous date du Pages Router : la doc Next 16
          autorise cette stratégie dans le root layout, qui rend ce composant. */}
      {/* eslint-disable-next-line @next/next/no-before-interactive-script-outside-document */}
      <Script id="umami-before-send" strategy="beforeInteractive">
        {UMAMI_BEFORE_SEND_SCRIPT}
      </Script>
      <Script
        src={`${umamiUrl}/script.js`}
        data-website-id={websiteId}
        data-before-send={UMAMI_BEFORE_SEND_HANDLER}
        strategy="afterInteractive"
      />
    </>
  );
}
