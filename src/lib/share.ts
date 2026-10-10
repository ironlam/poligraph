/**
 * Client-safe share utilities for social platforms.
 * No server dependencies (unlike src/lib/social/post.ts).
 */

const BLUESKY_MAX_CHARS = 300;

type Platform = "x" | "bluesky" | "facebook" | "whatsapp";

function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.substring(0, maxLen - 3).trimEnd() + "...";
}

export function buildShareUrl(platform: Platform, text: string, url: string): string {
  const encodedUrl = encodeURIComponent(url);

  switch (platform) {
    case "x": {
      const encodedText = encodeURIComponent(text);
      return `https://x.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`;
    }
    case "bluesky": {
      // Bluesky compose includes URL in char count
      const urlLen = url.length + 2; // "\n\n" prefix
      const truncated = truncateText(text, BLUESKY_MAX_CHARS - urlLen);
      const fullText = encodeURIComponent(`${truncated}\n\n${url}`);
      return `https://bsky.app/intent/compose?text=${fullText}`;
    }
    case "facebook":
      return `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;
    case "whatsapp": {
      const whatsappText = encodeURIComponent(`${text}\n${url}`);
      return `https://wa.me/?text=${whatsappText}`;
    }
  }
}

export interface ShareData {
  title: string;
  text: string;
  url: string;
}

export type ShareOutcome = "shared" | "copied" | "cancelled" | "failed";

/**
 * Native share sheet first, clipboard as fallback. A cancelled sheet is not an
 * error: copying behind the user's back would overwrite their clipboard.
 * Installed PWAs have no address bar, so this is the only way out of the app.
 */
export async function shareOrCopy(data: {
  title: string;
  url: string;
  text?: string;
}): Promise<ShareOutcome> {
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share(data);
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    }
  }
  try {
    await navigator.clipboard.writeText(data.url);
    return "copied";
  } catch {
    return "failed";
  }
}
