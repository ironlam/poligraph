import Mailjet from "node-mailjet";

const mailjet = new Mailjet({
  apiKey: process.env.MAILJET_API_KEY!,
  apiSecret: process.env.MAILJET_SECRET_KEY!,
});

function getListId(): number {
  const raw = process.env.MAILJET_LIST_ID;
  const n = Number(raw);
  if (!raw || !Number.isFinite(n) || n <= 0) {
    throw new Error("MAILJET_LIST_ID is not configured");
  }
  return n;
}

/**
 * Add a contact to the newsletter list with double opt-in.
 */
export async function subscribeToNewsletter(email: string): Promise<{ success: boolean }> {
  const listId = getListId();

  // Create or retrieve contact
  const contactRes = await mailjet.post("contact").request({ Email: email });
  const contactData = (contactRes.body as { Data: { ID: number }[] }).Data[0];
  if (!contactData) {
    throw new Error("Mailjet: failed to create or retrieve contact");
  }
  const contactId = contactData.ID;

  // Add to list (addnoforce = won't re-add if already subscribed)
  await mailjet
    .post("contact")
    .id(contactId)
    .action("managecontactslists")
    .request({
      ContactsLists: [
        {
          ListID: listId,
          Action: "addnoforce",
        },
      ],
    });

  return { success: true };
}

/**
 * Remove a contact from the newsletter list (does NOT delete the contact).
 * Idempotent: silently no-ops if the contact does not exist on Mailjet's side.
 */
export async function removeFromList(email: string): Promise<void> {
  const listId = getListId();

  // Look up an existing contact without creating one (GDPR forget must
  // not provision a ghost contact for users who never subscribed).
  let contactId: number | null = null;
  try {
    const contactRes = await mailjet.get(`contact/${encodeURIComponent(email)}`).request();
    contactId = (contactRes.body as { Data: { ID: number }[] }).Data[0]?.ID ?? null;
  } catch (e) {
    const status = (e as { ErrorMessage?: string; statusCode?: number }).statusCode;
    if (status === 404) return;
    throw e;
  }
  if (!contactId) return;

  await mailjet
    .post("contact")
    .id(contactId)
    .action("managecontactslists")
    .request({
      ContactsLists: [{ ListID: listId, Action: "remove" }],
    });
}

/**
 * Send a one-off transactional email via Mailjet Send API v3.1.
 * Use this for onboarding/confirmation/notification emails (NOT for list campaigns).
 */
export async function sendTransactional({
  to,
  subject,
  html,
  text,
}: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<void> {
  await mailjet.post("send", { version: "v3.1" }).request({
    Messages: [
      {
        From: {
          Email: process.env.MAILJET_SENDER_EMAIL || "newsletter@poligraph.fr",
          Name: process.env.MAILJET_SENDER_NAME || "Poligraph",
        },
        To: [{ Email: to }],
        Subject: subject,
        HTMLPart: html,
        ...(text ? { TextPart: text } : {}),
      },
    ],
  });
}

/**
 * Send a batch of personalized emails via Mailjet Send API v3.1.
 * Used for the per-subscriber weekly newsletter where each recipient gets
 * a custom HTML body. Mailjet accepts up to ~50 messages per batch call.
 */
export interface BatchMessage {
  to: string;
  subject: string;
  html: string;
  textPart?: string;
}

export async function sendBatch(messages: BatchMessage[]): Promise<{ sent: number }> {
  if (messages.length === 0) return { sent: 0 };
  await mailjet.post("send", { version: "v3.1" }).request({
    Messages: messages.map((m) => ({
      From: {
        Email: process.env.MAILJET_SENDER_EMAIL || "newsletter@poligraph.fr",
        Name: process.env.MAILJET_SENDER_NAME || "Poligraph",
      },
      To: [{ Email: m.to }],
      Subject: m.subject,
      HTMLPart: m.html,
      ...(m.textPart ? { TextPart: m.textPart } : {}),
    })),
  });
  return { sent: messages.length };
}

export interface MailjetCampaignStats {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  unsubscribed: number;
  bounced: number;
  topClicks: Array<{ url: string; count: number }> | null;
}

/**
 * Fetch aggregated engagement stats for a campaign sent during the week of `weekStart`.
 *
 * Stub for the MVP: returns zeroed counters so the sync-engagement job can be wired up
 * and run weekly. The real implementation will query `/REST/messagesentstatistics`
 * filtered by FromEmail + FromTS/ToTS once a sent campaign is available to test against.
 */
export async function fetchMailjetStatsForCampaign(weekStart: Date): Promise<MailjetCampaignStats> {
  console.warn(
    `[Mailjet stats stub] Would fetch stats for week ${weekStart.toISOString().slice(0, 10)}`
  );
  return {
    sent: 0,
    delivered: 0,
    opened: 0,
    clicked: 0,
    unsubscribed: 0,
    bounced: 0,
    topClicks: null,
  };
}
