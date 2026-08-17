import type { Jsonify } from "inngest/types";
import { inngest } from "../client";
import { computeWeeklyConcordance } from "@/lib/newsletter/concordance";
import type { PersonalDeputyContext } from "@/lib/email/render-recap";
import { safeJsonParseOrThrow } from "@/lib/api/safe-json";
import type { WeeklyRecapData } from "@/lib/data/recap";

const BATCH_SIZE = 50;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://poligraph.fr";

type Position = "POUR" | "CONTRE" | "ABSTENTION";

interface BoussoleProfile {
  answers?: Array<{ scrutinId: string; position: Position }>;
}

interface SubscriberRow {
  id: string;
  email: string;
  deputySlug: string | null;
  boussoleProfile: BoussoleProfile | null;
  unsubscribeToken: string;
}

interface DeputyRow {
  slug: string;
  fullName: string;
  blobPhotoUrl: string | null;
  photoUrl: string | null;
  currentParty: { shortName: string | null } | null;
}

interface DeputyVoteRow {
  position: Position;
  politician: { slug: string };
  // votingDate is serialized as ISO string by Inngest step storage; we don't
  // currently need to read it after deserialization, but keep the field typed.
  scrutin: { id: string; slug: string | null; title: string; votingDate: string | Date };
}

function rehydrateWeeklyRecap(recap: Jsonify<WeeklyRecapData>): WeeklyRecapData {
  return {
    ...recap,
    weekStart: new Date(recap.weekStart),
    weekEnd: new Date(recap.weekEnd),
    votes: {
      ...recap.votes,
      scrutins: recap.votes.scrutins.map((scrutin) => ({
        ...scrutin,
        votingDate: new Date(scrutin.votingDate),
      })),
    },
    press: {
      ...recap.press,
      storiesOfTheWeek: recap.press.storiesOfTheWeek.map((story) => ({
        ...story,
        publishedAt: new Date(story.publishedAt),
      })),
    },
    platformUpdates: {
      ...recap.platformUpdates,
      updates: recap.platformUpdates.updates.map((update) => ({
        ...update,
        date: new Date(update.date),
      })),
    },
  };
}

export const sendNewsletter = inngest.createFunction(
  {
    id: "newsletter/weekly-send",
    retries: 2,
    concurrency: { limit: 1, key: '"newsletter"' },
  },
  { cron: "0 7 * * 1" }, // Monday 7:00 UTC = 8h/9h Paris
  async ({ step }) => {
    // Guard: feature flag
    const enabled = await step.run("check-enabled", async () => {
      return process.env.NEWSLETTER_ENABLED === "true";
    });
    if (!enabled) {
      return { status: "skipped", reason: "NEWSLETTER_ENABLED is not true" };
    }

    const dryRun = await step.run("check-dry-run", async () => {
      return process.env.NEWSLETTER_DRY_RUN === "true";
    });

    // Step 1: Fetch recap data for last week
    const recap = await step.run("fetch-recap", async () => {
      const { getWeeklyRecap, getWeekStart } = await import("@/lib/data/recap");
      const now = new Date();
      const lastMonday = getWeekStart(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
      const data = await getWeeklyRecap(lastMonday);
      return safeJsonParseOrThrow<WeeklyRecapData>(JSON.stringify(data));
    });

    // Skip empty week
    if (recap.votes.total === 0 && recap.affairs.total === 0 && recap.factChecks.total === 0) {
      return { status: "skipped", reason: "Empty week" };
    }

    // Step 2: Select politician of the week + save edition
    const politicianData = await step.run("select-politician", async () => {
      const { selectPoliticianOfWeek } = await import("@/lib/email/select-politician");
      const { db } = await import("@/lib/db");
      const { getWeekStart } = await import("@/lib/data/recap");

      const politicianId = await selectPoliticianOfWeek();
      if (!politicianId) return null;

      const now = new Date();
      const weekStart = getWeekStart(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));

      await db.newsletterEdition.upsert({
        where: { weekStart },
        create: { weekStart, politicianId },
        update: { politicianId },
      });

      const politician = await db.politician.findUnique({
        where: { id: politicianId },
        select: {
          slug: true,
          fullName: true,
          photoUrl: true,
          blobPhotoUrl: true,
          currentParty: { select: { shortName: true } },
          mandates: {
            where: { isCurrent: true },
            take: 1,
            select: { title: true },
          },
        },
      });

      if (!politician) return null;

      return {
        slug: politician.slug,
        fullName: politician.fullName,
        photoUrl: politician.blobPhotoUrl || politician.photoUrl,
        partyShortName: politician.currentParty?.shortName ?? null,
        mandateTitle: politician.mandates[0]?.title ?? null,
      };
    });

    // Step 3: Build static content (editorial intro + bio)
    const content = await step.run("build-content", async () => {
      const { buildStaticEditorial, buildStaticBio } = await import("@/lib/email/static-content");
      const { getWeekStart, getISOWeekNumber } = await import("@/lib/data/recap");

      const now = new Date();
      const weekStart = getWeekStart(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
      const weekNum = getISOWeekNumber(weekStart);

      const rehydrated = rehydrateWeeklyRecap(recap);

      const editorialIntro = buildStaticEditorial(rehydrated, weekNum);
      const politicianBio = politicianData
        ? buildStaticBio(
            politicianData.fullName,
            politicianData.mandateTitle,
            politicianData.partyShortName
          )
        : "";

      return { editorialIntro, politicianBio, weekNum };
    });

    // Step 4: Load confirmed subscribers eligible for sending
    const subscribers = (await step.run("load-subscribers", async () => {
      const { db } = await import("@/lib/db");
      return db.subscriber.findMany({
        where: {
          status: "CONFIRMED",
          consecutiveMisses: { lt: 12 },
        },
        select: {
          id: true,
          email: true,
          deputySlug: true,
          boussoleProfile: true,
          unsubscribeToken: true,
        },
      });
    })) as SubscriberRow[];

    if (subscribers.length === 0) {
      return { status: "skipped", reason: "No confirmed subscribers" };
    }

    // Step 5: Prefetch deputies + their weekly votes (one DB roundtrip total).
    // Cast through unknown because Inngest serializes Date fields as ISO strings.
    const deputyData = (await step.run("prefetch-deputies", async () => {
      const { db } = await import("@/lib/db");
      const slugs = Array.from(
        new Set(subscribers.map((s) => s.deputySlug).filter((s): s is string => !!s))
      );
      if (slugs.length === 0) return { deputies: [], votes: [] };

      const deputies = await db.politician.findMany({
        where: { slug: { in: slugs } },
        select: {
          slug: true,
          fullName: true,
          blobPhotoUrl: true,
          photoUrl: true,
          currentParty: { select: { shortName: true } },
        },
      });

      const weekStart = new Date(recap.weekStart);
      const weekEnd = new Date(recap.weekEnd);

      const votes = await db.vote.findMany({
        where: {
          politician: { slug: { in: slugs } },
          votingDate: { gte: weekStart, lt: weekEnd },
        },
        select: {
          position: true,
          politician: { select: { slug: true } },
          scrutin: {
            select: { id: true, slug: true, title: true, votingDate: true },
          },
        },
        orderBy: { votingDate: "desc" },
      });

      return { deputies, votes };
    })) as unknown as { deputies: DeputyRow[]; votes: DeputyVoteRow[] };

    function buildPerso(sub: SubscriberRow): PersonalDeputyContext | null {
      if (!sub.deputySlug) return null;
      const deputy = deputyData.deputies.find((d) => d.slug === sub.deputySlug);
      if (!deputy) return null;

      const allDeputyVotes = deputyData.votes
        .filter((v) => v.politician.slug === sub.deputySlug)
        .map((v) => ({
          scrutinId: v.scrutin.id,
          slug: v.scrutin.slug,
          title: v.scrutin.title,
          position: v.position as Position,
        }));

      const weeklyVotes = allDeputyVotes.slice(0, 3).map((v) => ({
        scrutinSlug: v.slug,
        title: v.title,
        positionLabel: v.position,
      }));

      const profile = sub.boussoleProfile;
      const weeklyConcordance = profile?.answers
        ? computeWeeklyConcordance(
            profile.answers,
            allDeputyVotes.map((v) => ({ scrutinId: v.scrutinId, position: v.position }))
          )
        : null;

      return {
        fullName: deputy.fullName,
        partyShortName: deputy.currentParty?.shortName ?? null,
        photoUrl: deputy.blobPhotoUrl ?? deputy.photoUrl,
        constituency: null,
        weeklyVotes,
        weeklyConcordance,
        profileUrl: `${SITE_URL}/politiques/${deputy.slug}`,
      };
    }

    // Helper to rehydrate dates from JSON-serialized recap (Inngest step storage strips Date objects)
    const rehydratedRecap = rehydrateWeeklyRecap(recap);

    // Step 6: Sample test to admin first (safety net)
    const testEmail = process.env.NEWSLETTER_TEST_EMAIL;
    if (testEmail && !dryRun) {
      await step.run("send-sample-to-admin", async () => {
        const { renderNewsletterHtml } = await import("@/lib/email/render-recap");
        const { sendTransactional } = await import("@/lib/email/mailjet");
        const sampleSub = subscribers.find((s) => s.email === testEmail) ?? subscribers[0];
        if (!sampleSub) return;
        const personal = buildPerso(sampleSub);
        const { html } = renderNewsletterHtml({
          recap: rehydratedRecap,
          editorialIntro: content.editorialIntro,
          politician: politicianData ? { ...politicianData, bio: content.politicianBio } : null,
          personalDeputy: personal,
          unsubscribeUrl: `${SITE_URL}/api/newsletter/unsubscribe?token=${sampleSub.unsubscribeToken}`,
        });
        await sendTransactional({
          to: testEmail,
          subject: `[SAMPLE] La Semaine Poligraph - S${content.weekNum}`,
          html,
        });
      });
      // Pause so the admin can review/cancel via Inngest dashboard before broad send
      await step.sleep("sample-review-window", "30s");
    }

    // Step 7: Render per-subscriber and batch-send
    const sendResult = await step.run("send-batches", async () => {
      const { renderNewsletterHtml } = await import("@/lib/email/render-recap");
      const { sendBatch } = await import("@/lib/email/mailjet");
      const subject = `La Semaine Poligraph - S${content.weekNum}`;

      const messages = subscribers.map((sub) => {
        const personal = buildPerso(sub);
        const { html, text } = renderNewsletterHtml({
          recap: rehydratedRecap,
          editorialIntro: content.editorialIntro,
          politician: politicianData ? { ...politicianData, bio: content.politicianBio } : null,
          personalDeputy: personal,
          unsubscribeUrl: `${SITE_URL}/api/newsletter/unsubscribe?token=${sub.unsubscribeToken}`,
        });
        return { to: sub.email, subject, html, textPart: text };
      });

      if (dryRun) {
        return { sent: 0, failed: 0, failedEmails: [], dryRunRendered: messages.length };
      }

      let sent = 0;
      let failed = 0;
      const failedEmails: string[] = [];
      for (let i = 0; i < messages.length; i += BATCH_SIZE) {
        const slice = messages.slice(i, i + BATCH_SIZE);
        try {
          await sendBatch(slice);
          sent += slice.length;
        } catch (e) {
          failed += slice.length;
          failedEmails.push(...slice.map((m) => m.to));
          console.error(
            `[Newsletter] Batch ${Math.floor(i / BATCH_SIZE)} failed for ${slice.length} recipients`,
            e
          );
        }
      }
      return { sent, failed, failedEmails, dryRunRendered: 0 };
    });

    // Step 8: Record edition stats
    if (sendResult.sent > 0) {
      await step.run("record-edition", async () => {
        const { db } = await import("@/lib/db");
        const { getWeekStart } = await import("@/lib/data/recap");
        const now = new Date();
        const weekStart = getWeekStart(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
        await db.newsletterEdition.update({
          where: { weekStart },
          data: { sentAt: new Date(), recipientCount: sendResult.sent },
        });
      });
    }

    const status =
      sendResult.failed > 0
        ? "partial"
        : sendResult.sent === 0 && sendResult.dryRunRendered > 0
          ? "dry-run"
          : "sent";

    return {
      status,
      sent: sendResult.sent,
      failed: sendResult.failed,
      dryRunRendered: sendResult.dryRunRendered,
      politicianOfWeek: politicianData?.fullName ?? null,
    };
  }
);
