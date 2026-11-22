import { AtpAgent, RichText } from "@atproto/api";
import { TwitterApi } from "twitter-api-v2";
import { MissingSocialConfigError } from "@/lib/social/diagnostic";

/**
 * Outbound clients for the Poligraph accounts on Bluesky and X. They throw the provider's own error
 * untouched: `@/lib/social/diagnostic` is what turns it into something actionable.
 */

const BLUESKY_SERVICE = "https://bsky.social";
const DEFAULT_X_HANDLE = "poligraph_fr";

interface BlueskyConfig {
  handle: string;
  appPassword: string;
}

interface XConfig {
  appKey: string;
  appSecret: string;
  accessToken: string;
  accessSecret: string;
  handle: string;
}

function readBlueskyConfig(): BlueskyConfig {
  const handle = process.env.BLUESKY_HANDLE;
  const appPassword = process.env.BLUESKY_APP_PASSWORD;
  const missing = [
    handle ? null : "BLUESKY_HANDLE",
    appPassword ? null : "BLUESKY_APP_PASSWORD",
  ].filter((name): name is string => name !== null);
  if (missing.length > 0) throw new MissingSocialConfigError(missing);
  return { handle: handle!, appPassword: appPassword! };
}

function readXConfig(): XConfig {
  const values = {
    TWITTER_API_KEY: process.env.TWITTER_API_KEY,
    TWITTER_API_SECRET: process.env.TWITTER_API_SECRET,
    TWITTER_ACCESS_TOKEN: process.env.TWITTER_ACCESS_TOKEN,
    TWITTER_ACCESS_TOKEN_SECRET: process.env.TWITTER_ACCESS_TOKEN_SECRET,
  };
  const missing = Object.entries(values)
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length > 0) throw new MissingSocialConfigError(missing);
  return {
    appKey: values.TWITTER_API_KEY!,
    appSecret: values.TWITTER_API_SECRET!,
    accessToken: values.TWITTER_ACCESS_TOKEN!,
    accessSecret: values.TWITTER_ACCESS_TOKEN_SECRET!,
    handle: process.env.TWITTER_HANDLE || DEFAULT_X_HANDLE,
  };
}

async function loginBluesky(): Promise<{ agent: AtpAgent; handle: string }> {
  const config = readBlueskyConfig();
  const agent = new AtpAgent({ service: BLUESKY_SERVICE });
  await agent.login({ identifier: config.handle, password: config.appPassword });
  return { agent, handle: config.handle };
}

function xClient(config: XConfig): TwitterApi {
  return new TwitterApi({
    appKey: config.appKey,
    appSecret: config.appSecret,
    accessToken: config.accessToken,
    accessSecret: config.accessSecret,
  });
}

export async function publishToBluesky(text: string): Promise<{ url: string }> {
  const { agent, handle } = await loginBluesky();
  const richText = new RichText({ text });
  // Facets turn the URLs and mentions of the text into links; without them Bluesky shows plain text.
  await richText.detectFacets(agent);
  const response = await agent.post({
    text: richText.text,
    facets: richText.facets,
    langs: ["fr"],
    createdAt: new Date().toISOString(),
  });
  const rkey = response.uri.split("/").pop();
  return { url: `https://bsky.app/profile/${handle}/post/${rkey}` };
}

export async function publishToX(text: string): Promise<{ url: string }> {
  const config = readXConfig();
  const response = await xClient(config).v2.tweet(text);
  return { url: `https://x.com/${config.handle}/status/${response.data.id}` };
}

/** Logs in without posting: proves the app password still works. */
export async function checkBlueskyAccount(): Promise<{ handle: string }> {
  const { handle } = await loginBluesky();
  return { handle };
}

/**
 * Reads the authenticated account: proves the four OAuth 1.0a keys still sign valid requests.
 * X reports the token's rights in `x-access-level`, which catches the classic trap of an app
 * switched to "Read and write" whose access token was generated before the switch.
 */
export async function checkXAccount(): Promise<{ handle: string; accessLevel: string | null }> {
  const config = readXConfig();
  const response = await xClient(config).v2.get<{ data: { username: string } }>(
    "users/me",
    undefined,
    { fullResponse: true }
  );
  const accessLevel = response.headers["x-access-level"];
  return {
    handle: response.data.data.username,
    accessLevel: typeof accessLevel === "string" ? accessLevel : null,
  };
}
