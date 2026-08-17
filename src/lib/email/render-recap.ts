import type { PressStory, WeeklyRecapData } from "@/lib/data/recap";
import { getISOWeekNumber } from "@/lib/data/recap";
import { CERTAINTY_LABELS } from "@/config/certainty";
import { WEEKLY_RECAP_HTML } from "./templates/weekly-recap-compiled";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PoliticianOfWeek {
  fullName: string;
  photoUrl: string | null;
  slug: string;
  partyShortName: string | null;
  mandateTitle: string | null;
  bio: string;
}

export interface PersonalDeputyContext {
  fullName: string;
  partyShortName: string | null;
  photoUrl: string | null;
  constituency: string | null;
  weeklyVotes: Array<{ scrutinSlug: string | null; title: string; positionLabel: string }>;
  weeklyConcordance: number | null;
  profileUrl: string;
}

export interface RenderInput {
  recap: WeeklyRecapData;
  editorialIntro: string;
  politician: PoliticianOfWeek | null;
  personalDeputy?: PersonalDeputyContext | null;
  unsubscribeUrl?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://poligraph.fr";
const DEFAULT_PHOTO = `${SITE_URL}/images/placeholder-politician.png`;

const CERTAINTY_EMAIL_COLORS: Record<string, string> = {
  ETABLI: "#b91c1c",
  PRONONCE: "#c2410c",
  EN_COURS: "#b45309",
  CLOS_SANS_CHARGE: "#64748b",
  CLOS_FAVORABLE: "#6b7280",
};

const CERTAINTY_EMAIL_LABELS: Record<string, string> = CERTAINTY_LABELS;

// ---------------------------------------------------------------------------
// HTML escaping
// ---------------------------------------------------------------------------

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ---------------------------------------------------------------------------
// Date formatting
// ---------------------------------------------------------------------------

function formatDateShort(date: Date): string {
  return date.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

/**
 * Convert AI editorial text to email-safe HTML:
 * - Strip markdown headings (# Title)
 * - Convert **bold** to <strong>
 * - Convert newlines to <br>
 * - Escape remaining HTML
 */
function formatEditorialHtml(text: string): string {
  let result = text;
  // Strip markdown headings (# Title → Title)
  result = result.replace(/^#{1,3}\s+/gm, "");
  // Escape HTML first
  result = escapeHtml(result);
  // Convert **bold** to <strong> (after escaping so the ** aren't affected)
  result = result.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // Convert newlines to <br>
  result = result.replace(/\n/g, "<br />");
  return result;
}

// ---------------------------------------------------------------------------
// HTML building helpers (private)
// ---------------------------------------------------------------------------

function buildVotesHtml(recap: WeeklyRecapData): string {
  const top5 = recap.votes.scrutins.slice(0, 5);
  if (top5.length === 0) return "";

  const rows = top5
    .map((s) => {
      const isAdopted = s.result === "ADOPTED";
      const badgeClass = isAdopted ? "adopted" : "rejected";
      const badgeLabel = isAdopted ? "Adopté" : "Rejeté";
      const title = escapeHtml(s.title);
      const total = s.votesFor + s.votesAgainst + s.votesAbstain;
      const ratio = total > 0 ? `${s.votesFor}/${s.votesAgainst}/${s.votesAbstain}` : "";
      const link = s.slug ? `${SITE_URL}/parlement/votes/${s.slug}` : null;
      const titleHtml = link
        ? `<a href="${link}" style="color: #1e3a5f; text-decoration: none; font-weight: 600;">${title}</a>`
        : `<span style="font-weight: 600;">${title}</span>`;

      return `<tr>
        <td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6; vertical-align: top;">
          <span class="badge ${badgeClass}">${badgeLabel}</span>
        </td>
        <td style="padding: 8px 0 8px 10px; border-bottom: 1px solid #f3f4f6; vertical-align: top;">
          ${titleHtml}
          <br /><span style="font-size: 12px; color: #6b7280;">${escapeHtml(s.chamber)} · Pour/Contre/Abst: ${ratio}</span>
        </td>
      </tr>`;
    })
    .join("");

  const summary =
    recap.votes.adopted > 0 || recap.votes.rejected > 0
      ? `<p style="margin: 8px 0 0; font-size: 13px; color: #6b7280;">${recap.votes.adopted} adopté${recap.votes.adopted > 1 ? "s" : ""}, ${recap.votes.rejected} rejeté${recap.votes.rejected > 1 ? "s" : ""} sur ${recap.votes.total} scrutin${recap.votes.total > 1 ? "s" : ""}</p>`
      : "";

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size: 14px;">${rows}</table>${summary}`;
}

function buildAffairsHtml(recap: WeeklyRecapData): string {
  const top5 = recap.affairs.newAffairs.slice(0, 5);
  if (top5.length === 0) return "";

  const rows = top5
    .map((a) => {
      const color = CERTAINTY_EMAIL_COLORS[a.certaintyLevel] ?? "#6b7280";
      const label = CERTAINTY_EMAIL_LABELS[a.certaintyLevel] ?? a.certaintyLevel;
      const title = escapeHtml(a.title);
      const politician = escapeHtml(a.politicianName);
      const affairUrl = `${SITE_URL}/affaires/${a.slug}`;
      const politicianUrl = `${SITE_URL}/politiques/${a.politicianSlug}`;

      return `<div style="padding: 8px 0; border-bottom: 1px solid #f3f4f6;">
        <span style="color: ${color}; font-weight: 600; font-size: 11px; text-transform: uppercase;">${escapeHtml(label)}</span>
        <br /><a href="${affairUrl}" style="color: #1e3a5f; text-decoration: none; font-weight: 600;">${title}</a>
        <br /><span style="font-size: 12px; color: #6b7280;">Impliquant <a href="${politicianUrl}" style="color: #1e3a5f;">${politician}</a></span>
      </div>`;
    })
    .join("");

  return rows;
}

function buildFactChecksHtml(recap: WeeklyRecapData): string {
  const fc = recap.factChecks;
  if (fc.total === 0) return "";

  const hasBreakdown = fc.trueCount > 0 || fc.falseCount > 0 || fc.mixedCount > 0;
  const countsHtml = hasBreakdown
    ? `<div style="padding: 8px 0;">
    <span style="color: #166534; font-weight: 600;">${fc.trueCount} vrai${fc.trueCount > 1 ? "s" : ""}</span> ·
    <span style="color: #991b1b; font-weight: 600;">${fc.falseCount} faux</span> ·
    <span style="color: #92400e; font-weight: 600;">${fc.mixedCount} mitigé${fc.mixedCount > 1 ? "s" : ""}</span>
    <span style="font-size: 13px; color: #6b7280;"> sur ${fc.total} vérification${fc.total > 1 ? "s" : ""} cette semaine</span>
  </div>`
    : `<div style="padding: 8px 0;">
    <span style="font-weight: 600; color: #1e3a5f;">${fc.total} vérification${fc.total > 1 ? "s" : ""}</span>
    <span style="font-size: 13px; color: #6b7280;"> publiée${fc.total > 1 ? "s" : ""} cette semaine</span>
  </div>`;

  const topClaimant = fc.topPoliticians[0];
  const claimantHtml = topClaimant
    ? `<div style="padding: 8px 0; border-top: 1px solid #f3f4f6;">
        <span style="font-size: 13px; color: #6b7280;">Le plus vérifié :</span>
        <a href="${SITE_URL}/politiques/${topClaimant.slug}" style="color: #1e3a5f; text-decoration: none; font-weight: 600;"> ${escapeHtml(topClaimant.fullName)}</a>
        <span style="font-size: 13px; color: #6b7280;"> (${topClaimant.count} vérification${topClaimant.count > 1 ? "s" : ""})</span>
      </div>`
    : "";

  return countsHtml + claimantHtml;
}

export function buildPressStoriesHtml(stories: PressStory[]): string {
  if (stories.length === 0) return "";
  const items = stories
    .slice(0, 3)
    .map((s) => {
      const title = escapeHtml(s.title);
      const feedSource = escapeHtml(s.feedSource);
      const dateLabel = formatDateShort(s.publishedAt);
      // AI summary intentionally not rendered: link, don't reproduce
      // (press-publisher neighbouring rights). Title + source + link only.
      return `<div style="padding: 10px 0; border-bottom: 1px solid #f3f4f6;">
        <p style="margin: 0; font-weight: 600;"><a href="${s.url}" style="color: #1e3a5f; text-decoration: none;">${title}</a></p>
        <p style="margin: 2px 0 0; font-size: 12px; color: #6b7280;">${feedSource} · ${dateLabel}</p>
      </div>`;
    })
    .join("");
  return `<div style="padding: 4px 0 8px;">
    <p style="margin: 0 0 8px; font-size: 14px; font-weight: 600; color: #1e3a5f;">À la une cette semaine</p>
    ${items}
  </div>`;
}

function buildPressHtml(recap: WeeklyRecapData): string {
  const press = recap.press;
  if (press.articleCount === 0) return "";

  const countHtml = `<div style="padding: 8px 0;">
    <span style="font-weight: 600; color: #1e3a5f;">${press.articleCount} article${press.articleCount > 1 ? "s" : ""}</span>
    <span style="font-size: 13px; color: #6b7280;"> couverts cette semaine</span>
  </div>`;

  const storiesHtml = buildPressStoriesHtml(press.storiesOfTheWeek ?? []);

  const top3 = press.topPoliticians.slice(0, 3);
  const mentionsHtml =
    top3.length > 0
      ? `<div style="padding: 8px 0; border-top: 1px solid #f3f4f6;">
          <span style="font-size: 13px; color: #6b7280;">Les plus cités :</span>
          ${top3
            .map(
              (p) =>
                `<a href="${SITE_URL}/politiques/${p.slug}" style="color: #1e3a5f; text-decoration: none; font-weight: 600;"> ${escapeHtml(p.fullName)}</a><span style="font-size: 12px; color: #9ca3af;"> (${p.count})</span>`
            )
            .join(" · ")}
        </div>`
      : "";

  return countHtml + storiesHtml + mentionsHtml;
}

export function buildPersonalDeputyHtml(deputy: PersonalDeputyContext | null): string {
  if (!deputy) return "";

  const photoBlock = deputy.photoUrl
    ? `<img src="${escapeHtml(deputy.photoUrl)}" alt="" width="64" height="64" style="border-radius:50%;display:block" />`
    : "";

  const constituencyLine = deputy.constituency
    ? `<p style="font-size:13px;color:#374151;margin:0 0 8px">${escapeHtml(deputy.constituency)}</p>`
    : "";

  const votesBlock =
    deputy.weeklyVotes.length === 0
      ? `<p style="font-size:13px;color:#6b7280;margin:0 0 8px">Pas de vote cette semaine.</p>`
      : `<ul style="margin:0 0 8px;padding-left:18px;font-size:13px">${deputy.weeklyVotes
          .slice(0, 3)
          .map(
            (v) =>
              `<li style="margin-bottom:4px"><strong>${escapeHtml(v.positionLabel)}</strong> : ${escapeHtml(v.title)}</li>`
          )
          .join("")}</ul>`;

  const concordanceLine =
    deputy.weeklyConcordance !== null
      ? `<p style="font-size:13px;margin:0 0 8px">Concordance avec ton profil cette semaine : <strong>${deputy.weeklyConcordance}%</strong></p>`
      : "";

  const partySpan = deputy.partyShortName
    ? ` <span style="color:#6b7280;font-weight:400">(${escapeHtml(deputy.partyShortName)})</span>`
    : "";

  return `
    <table role="presentation" width="100%" style="background-color:#fef3c7;padding:20px 24px;border-radius:8px">
      <tr>
        <td style="vertical-align:top;width:80px">${photoBlock}</td>
        <td style="vertical-align:top;padding-left:12px">
          <h2 style="font-size:16px;font-weight:700;color:#1e3a5f;margin:0 0 4px">Cette semaine, ton député</h2>
          <p style="font-size:14px;font-weight:600;margin:0 0 4px">${escapeHtml(deputy.fullName)}${partySpan}</p>
          ${constituencyLine}
          ${votesBlock}
          ${concordanceLine}
          <p style="font-size:13px;margin:0"><a href="${escapeHtml(deputy.profileUrl)}" style="color:#1e3a5f">Voir son profil complet</a></p>
        </td>
      </tr>
    </table>
  `.trim();
}

// ---------------------------------------------------------------------------
// Template processing
// ---------------------------------------------------------------------------

function processConditionals(
  template: string,
  replacements: Record<string, string | boolean>
): string {
  return template.replace(
    /\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_match, key: string, content: string) => {
      return replacements[key] ? content : "";
    }
  );
}

function replacePlaceholders(template: string, replacements: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) => {
    return replacements[key] ?? "";
  });
}

// ---------------------------------------------------------------------------
// Plain text generation
// ---------------------------------------------------------------------------

function buildPlainText(input: RenderInput): string {
  const { recap, editorialIntro, politician } = input;
  const weekNum = getISOWeekNumber(recap.weekStart);
  const year = recap.weekStart.getUTCFullYear();
  const lines: string[] = [];

  lines.push(`LA SEMAINE POLIGRAPH - S${weekNum} (${year})`);
  lines.push(`Du ${formatDateShort(recap.weekStart)} au ${formatDateShort(recap.weekEnd)}`);
  lines.push("");
  lines.push(
    `${recap.votes.total} scrutins · ${recap.press.articleCount} articles · ${recap.affairs.total} affaires · ${recap.factChecks.total} fact-checks`
  );
  lines.push("");
  lines.push(editorialIntro);
  lines.push("");

  // Votes
  if (recap.votes.scrutins.length > 0) {
    lines.push("--- VOTES DE LA SEMAINE ---");
    for (const s of recap.votes.scrutins.slice(0, 5)) {
      const status = s.result === "ADOPTED" ? "Adopté" : "Rejeté";
      lines.push(`[${status}] ${s.title}`);
      lines.push(
        `  ${s.chamber} · Pour: ${s.votesFor} / Contre: ${s.votesAgainst} / Abst: ${s.votesAbstain}`
      );
      if (s.slug) {
        lines.push(`  ${SITE_URL}/parlement/votes/${s.slug}`);
      }
    }
    lines.push("");
  }

  // Affairs
  if (recap.affairs.newAffairs.length > 0) {
    lines.push("--- AFFAIRES JUDICIAIRES ---");
    for (const a of recap.affairs.newAffairs.slice(0, 5)) {
      const label = CERTAINTY_EMAIL_LABELS[a.certaintyLevel] ?? a.certaintyLevel;
      lines.push(`[${label}] ${a.title}`);
      lines.push(`  Impliquant ${a.politicianName}`);
      lines.push(`  ${SITE_URL}/affaires/${a.slug}`);
    }
    lines.push("");
  }

  // Fact-checks
  if (recap.factChecks.total > 0) {
    lines.push("--- FACT-CHECKING ---");
    lines.push(
      `${recap.factChecks.trueCount} vrais · ${recap.factChecks.falseCount} faux · ${recap.factChecks.mixedCount} mitigés`
    );
    const top = recap.factChecks.topPoliticians[0];
    if (top) {
      lines.push(`Le plus vérifié : ${top.fullName} (${top.count})`);
    }
    lines.push("");
  }

  // Press
  if (recap.press.articleCount > 0) {
    lines.push("--- REVUE DE PRESSE ---");
    lines.push(`${recap.press.articleCount} articles couverts`);
    const stories = (recap.press.storiesOfTheWeek ?? []).slice(0, 3);
    if (stories.length > 0) {
      lines.push("");
      lines.push("À la une cette semaine :");
      for (const s of stories) {
        lines.push(`- ${s.title}`);
        lines.push(`  ${s.feedSource} · ${formatDateShort(s.publishedAt)}`);
        lines.push(`  ${s.url}`);
      }
    }
    const top3 = recap.press.topPoliticians.slice(0, 3);
    if (top3.length > 0) {
      lines.push(`Les plus cités : ${top3.map((p) => `${p.fullName} (${p.count})`).join(", ")}`);
    }
    lines.push("");
  }

  // Politician of the week
  if (politician) {
    lines.push("--- POLITICIEN DE LA SEMAINE ---");
    lines.push(politician.fullName);
    if (politician.mandateTitle || politician.partyShortName) {
      lines.push([politician.mandateTitle, politician.partyShortName].filter(Boolean).join(" · "));
    }
    lines.push(politician.bio);
    lines.push(`${SITE_URL}/politiques/${politician.slug}`);
    lines.push("");
  }

  lines.push(`Récap complet : ${SITE_URL}/recap`);
  lines.push("");
  lines.push("Se désabonner : [[UNSUB_LINK_EN]]");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main render function
// ---------------------------------------------------------------------------

export function renderNewsletterHtml(input: RenderInput): { html: string; text: string } {
  const { recap, editorialIntro, politician, personalDeputy = null, unsubscribeUrl } = input;
  const weekNum = getISOWeekNumber(recap.weekStart);
  const year = recap.weekStart.getUTCFullYear();

  // Use pre-compiled HTML template (no mjml runtime = no readFileSync on Vercel)
  const htmlTemplate = WEEKLY_RECAP_HTML;

  // Build section HTML
  const votesHtml = buildVotesHtml(recap);
  const affairsHtml = buildAffairsHtml(recap);
  const factChecksHtml = buildFactChecksHtml(recap);
  const pressHtml = buildPressHtml(recap);
  const personalDeputyHtml = buildPersonalDeputyHtml(personalDeputy);

  // Build politician section data
  const politicianPhoto = politician?.photoUrl ?? DEFAULT_PHOTO;
  const politicianName = politician ? escapeHtml(politician.fullName) : "";
  const politicianMandate = politician?.mandateTitle ? escapeHtml(politician.mandateTitle) : "";
  const politicianParty = politician?.partyShortName ? escapeHtml(politician.partyShortName) : "";
  const politicianBio = politician ? escapeHtml(politician.bio) : "";
  const politicianUrl = politician ? `${SITE_URL}/politiques/${politician.slug}` : "";

  // Conditional flags
  const conditionals: Record<string, string | boolean> = {
    hasVotes: recap.votes.scrutins.length > 0,
    hasAffairs: recap.affairs.newAffairs.length > 0,
    hasFactChecks: recap.factChecks.total > 0,
    hasPress: recap.press.articleCount > 0,
    hasPolitician: politician !== null,
    hasPersonalDeputy: personalDeputy !== null,
  };

  // All replacements
  const replacements: Record<string, string> = {
    weekLabel: `Semaine ${weekNum} - Du ${formatDateShort(recap.weekStart)} au ${formatDateShort(recap.weekEnd)} ${year}`,
    totalScrutins: String(recap.votes.total),
    totalArticles: String(recap.press.articleCount),
    totalAffairs: String(recap.affairs.total),
    totalFactChecks: String(recap.factChecks.total),
    editorialIntro: formatEditorialHtml(editorialIntro),
    votesHtml,
    affairsHtml,
    factChecksHtml,
    pressHtml,
    personalDeputyHtml,
    politicianPhoto,
    politicianName,
    politicianMandate,
    politicianParty,
    politicianBio,
    politicianUrl,
    recapUrl: `${SITE_URL}/recap`,
    unsubscribeUrl: unsubscribeUrl ?? "[[UNSUB_LINK_EN]]",
  };

  // Process conditionals then placeholders on pre-compiled HTML
  let html = processConditionals(htmlTemplate, conditionals);
  html = replacePlaceholders(html, replacements);

  // Generate plain text
  const text = buildPlainText(input);

  return { html, text };
}
