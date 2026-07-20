// Centralised security headers so the CSP can be unit-tested as a full string.
export function buildContentSecurityPolicy(isDev: boolean): string {
  const directives = [
    "default-src 'self'",
    // unsafe-inline required: Next.js inline scripts (chunks, RSC), JSON-LD, Umami.
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://cloud.umami.is https://vercel.live`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' https: data:",
    "font-src 'self'",
    "worker-src 'self'",
    "connect-src 'self' https://cloud.umami.is https://api-gateway.umami.dev https://gateway.umami.is https://vercel.live https://api.anthropic.com https://geo.api.gouv.fr",
    "frame-src 'self' https://www.helloasso.com",
    "frame-ancestors 'none'",
  ];
  return directives.join("; ");
}

export function buildSecurityHeaders(isDev: boolean): { key: string; value: string }[] {
  return [
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value:
        'camera=(), microphone=(), geolocation=(self), payment=(self "https://www.helloasso.com")',
    },
    { key: "Content-Security-Policy", value: buildContentSecurityPolicy(isDev) },
  ];
}
