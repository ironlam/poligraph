import { ROUTES } from "@/config/routes";
import type { ClaimDayChamber } from "@/lib/data/factcheck-context";

/** A run of the sentence: plain text, or a link to a legislative dossier. */
export type TextSegment = { text: string; href?: string };

const CHAMBER_SUBJECT: Record<ClaimDayChamber["chamber"], string> = {
  AN: "l'Assemblée nationale",
  SENAT: "le Sénat",
};

function scrutins(n: number): string {
  return `${n.toLocaleString("fr-FR")} scrutin${n > 1 ? "s" : ""} public${n > 1 ? "s" : ""}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Deterministic text of the claim-day block, built from counts only:
 * « Ce jour-là, l'Assemblée nationale a tenu 51 scrutins publics : 47 sur le texte « X », 4 sur le
 * texte « Y ». Mathilde Panot a pris part à 19 d'entre eux. »
 *
 * One sentence per chamber, the first opened by « Ce jour-là ». Dossier titles become links.
 */
export function buildClaimDaySegments(
  chambers: ClaimDayChamber[],
  authorName: string,
  participationTotal: number
): TextSegment[] {
  const segments: TextSegment[] = [];

  chambers.forEach((chamber, index) => {
    const subject = CHAMBER_SUBJECT[chamber.chamber];
    const opening = index === 0 ? `Ce jour-là, ${subject}` : capitalize(subject);
    if (index > 0) segments.push({ text: " " });
    segments.push({ text: `${opening} a tenu ${scrutins(chamber.scrutinCount)}` });

    if (chamber.dossiers.length === 0) {
      segments.push({ text: "." });
      return;
    }

    segments.push({ text: " : " });
    chamber.dossiers.forEach((dossier, i) => {
      if (i > 0) segments.push({ text: ", " });
      segments.push({ text: `${dossier.scrutinCount.toLocaleString("fr-FR")} sur le texte « ` });
      segments.push(
        dossier.slug
          ? { text: dossier.title, href: ROUTES.dossierDetail(dossier.slug) }
          : { text: dossier.title }
      );
      segments.push({ text: " »" });
    });
    if (chamber.otherCount > 0) {
      segments.push({
        text: `, et ${chamber.otherCount.toLocaleString("fr-FR")} sur d'autres textes ou sans texte rattaché`,
      });
    }
    segments.push({ text: "." });
  });

  const share =
    participationTotal === 1
      ? "à l'un d'entre eux"
      : `à ${participationTotal.toLocaleString("fr-FR")} d'entre eux`;
  segments.push({ text: ` ${authorName} a pris part ${share}.` });

  return segments;
}
