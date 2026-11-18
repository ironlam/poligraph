/**
 * Posts one profile-snapshot request to the application's cron route, for a caller that has no
 * Inngest event key (a GitHub Actions workflow). What to send and where is decided by
 * src/lib/politicians/profile-snapshot/relay.ts; this module only does the HTTP call.
 */
export async function postProfileRelay(
  endpoint: string,
  secret: string,
  body: unknown,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Profile relay failed with HTTP ${response.status}`);
  }
}
