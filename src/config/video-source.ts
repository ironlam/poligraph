// Pure helpers for audio-visual sources (a press conference, a TV interview). No directive: the
// server renders the public page and the admin forms parse the same timecode.

const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"]);

/** "22:41" is minutes:seconds, "1:05:09" is hours:minutes:seconds. Anything else is not a timecode. */
export function parseTimecode(input: string): number | null {
  const match = /^(?:(\d{1,2}):)?(\d{1,2}):([0-5]\d)$/.exec(input.trim());
  if (!match) return null;
  const hasHours = match[1] !== undefined;
  const first = Number(hasHours ? match[1] : 0);
  const second = Number(match[2]);
  const third = Number(match[3]);
  if (hasHours) return second > 59 ? null : first * 3600 + second * 60 + third;
  return second * 60 + third;
}

export function formatTimecode(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

function parseHttpUrl(url: string): URL | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed : null;
  } catch {
    return null;
  }
}

export function isYouTubeUrl(url: string): boolean {
  const parsed = parseHttpUrl(url);
  return parsed !== null && YOUTUBE_HOSTS.has(parsed.hostname);
}

/** A source is audio-visual when it carries a start time or points at YouTube. */
export function isVideoSource(url: string, startAtSeconds: number | null | undefined): boolean {
  return startAtSeconds != null || isYouTubeUrl(url);
}

/**
 * The link to open: a YouTube URL jumps to the passage, any other host keeps its own URL because
 * we cannot know how its player reads a start time.
 */
export function videoSourceHref(url: string, startAtSeconds: number | null | undefined): string {
  if (startAtSeconds == null || !isYouTubeUrl(url)) return url;
  const parsed = parseHttpUrl(url);
  if (parsed === null) return url;
  parsed.searchParams.set("t", `${startAtSeconds}s`);
  return parsed.toString();
}
