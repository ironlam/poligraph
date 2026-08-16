#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
guard_script="$repo_root/scripts/ci/code-quality-guards.sh"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
fixture="$tmp/repo"

reset_fixture() {
  rm -rf "$fixture"
  mkdir -p \
    "$fixture/src/app/api/public" \
    "$fixture/src/app/api/admin/example" \
    "$fixture/src/app/api/admin/auth/login" \
    "$fixture/src/components/ui" \
    "$fixture/src/components/example" \
    "$fixture/src/lib/affairs" \
    "$fixture/src/lib/measures" \
    "$fixture/src/services/sync" \
    "$fixture/scripts"
  : > "$fixture/.env.example"
  : > "$fixture/src/components/ui/markdown.tsx"
}

run_guard() {
  local guard=$1
  bash "$guard_script" "$guard" "$fixture" >/dev/null 2>&1
}

expect_pass() {
  local label=$1 guard=$2
  if ! run_guard "$guard"; then
    echo "FAIL: expected pass: $label ($guard)" >&2
    bash "$guard_script" "$guard" "$fixture" || true
    exit 1
  fi
  echo "PASS: $label"
}

expect_fail() {
  local label=$1 guard=$2
  if run_guard "$guard"; then
    echo "FAIL: expected failure: $label ($guard)" >&2
    exit 1
  fi
  echo "PASS: $label"
}

reset_fixture
cat > "$fixture/src/lib/query.ts" <<'EOF'
export const query = () => db.$executeRawUnsafe("SELECT 1");
EOF
expect_fail 'executeRawUnsafe is rejected' execute-raw-unsafe
cat > "$fixture/src/lib/query.ts" <<'EOF'
export const query = () => db.$executeRaw`SELECT 1`;
EOF
expect_pass 'safe raw SQL form is accepted' execute-raw-unsafe

reset_fixture
cat > "$fixture/src/services/publisher.ts" <<'EOF'
await db.affair.update({
  data: {
    publicationStatus: "PUBLISHED",
  },
});
EOF
expect_fail 'direct publication write is rejected' direct-published-writes
rm "$fixture/src/services/publisher.ts"
cat > "$fixture/src/lib/affairs/publish-guard.ts" <<'EOF'
await db.affair.update({
  data: {
    publicationStatus: "PUBLISHED",
  },
});
EOF
expect_pass 'authorized affair publisher is accepted' direct-published-writes

reset_fixture
cat > "$fixture/scripts/import-affair.ts" <<'EOF'
await db.affair.create({ data: affair });
EOF
expect_fail 'importer direct affair creation is rejected' importer-affair-create
cat > "$fixture/scripts/import-affair.ts" <<'EOF'
await createDraftAffairFromDiscovery(affair);
EOF
expect_pass 'importer draft helper is accepted' importer-affair-create

reset_fixture
cat > "$fixture/src/services/sync/affairs.ts" <<'EOF'
const data = { verifiedAt: new Date() };
EOF
expect_fail 'importer verifiedAt write is rejected' importer-verified-at
cat > "$fixture/src/services/sync/affairs.ts" <<'EOF'
const select = { verifiedAt: true };
EOF
expect_pass 'importer verifiedAt read is accepted' importer-verified-at

reset_fixture
cat > "$fixture/scripts/press.ts" <<'EOF'
const email = process.env.MEDIAPART_EMAIL;
EOF
expect_fail 'press authentication credential reference is rejected' press-paywall
cat > "$fixture/scripts/press.ts" <<'EOF'
const headers = { "User-Agent": "Mozilla/5.0" };
EOF
expect_fail 'unidentified crawler user-agent is rejected' press-paywall
cat > "$fixture/scripts/press.ts" <<'EOF'
const headers = { "User-Agent": "Mozilla/5.0 (compatible; Poligraph/1.0; +https://poligraph.fr)" };
EOF
expect_pass 'identified Poligraph crawler is accepted' press-paywall

reset_fixture
cat > "$fixture/src/components/example/Unsafe.tsx" <<'EOF'
export function Unsafe({ html }: { html: string }) {
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
EOF
expect_fail 'unsanitized HTML sink is rejected' dangerous-html
rm "$fixture/src/components/example/Unsafe.tsx"
cat > "$fixture/src/components/example/JsonLd.tsx" <<'EOF'
export function JsonLd({ data }: { data: unknown }) {
  return <script dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />;
}
EOF
expect_pass 'JSON-LD serialization sink is accepted' dangerous-html
cat > "$fixture/src/components/ui/markdown.tsx" <<'EOF'
export function Markdown({ html }: { html: string }) {
  return <div dangerouslySetInnerHTML={{ __html: sanitize(html) }} />;
}
EOF
expect_fail 'MarkdownText HTML sink is always rejected' dangerous-html

reset_fixture
cat > "$fixture/src/app/api/public/route.ts" <<'EOF'
export function GET(searchParams: URLSearchParams) {
  const raw = searchParams.get("payload");
  return JSON.parse(raw ?? "{}");
}
EOF
expect_fail 'unprotected JSON.parse in public API is rejected' json-parse
cat > "$fixture/src/app/api/public/route.ts" <<'EOF'
export function GET(searchParams: URLSearchParams) {
  try {
    return JSON.parse(searchParams.get("payload") ?? "{}");
  } catch {
    return null;
  }
}
EOF
expect_pass 'JSON.parse inside try/catch is accepted' json-parse
cat > "$fixture/src/app/api/admin/example/route.ts" <<'EOF'
export function POST(value: string) {
  return JSON.parse(value);
}
EOF
expect_pass 'admin JSON.parse remains outside this guard scope' json-parse

reset_fixture
cat > "$fixture/.env.example" <<'EOF'
NEXT_PUBLIC_API_KEY=do-not-publish
EOF
expect_fail 'NEXT_PUBLIC secret-like variable is rejected' next-public-secrets
cat > "$fixture/.env.example" <<'EOF'
NEXT_PUBLIC_SITE_URL=https://poligraph.fr
EOF
expect_pass 'non-secret NEXT_PUBLIC variable is accepted' next-public-secrets

reset_fixture
cat > "$fixture/src/app/api/admin/example/route.ts" <<'EOF'
export async function POST() {
  return Response.json({ ok: true });
}
EOF
expect_fail 'admin route without withAdminAuth is rejected' admin-auth
cat > "$fixture/src/app/api/admin/example/route.ts" <<'EOF'
export const POST = withAdminAuth(async () => Response.json({ ok: true }));
EOF
expect_pass 'admin route with withAdminAuth is accepted' admin-auth
cat > "$fixture/src/app/api/admin/auth/login/route.ts" <<'EOF'
export async function POST() {
  return Response.json({ ok: true });
}
EOF
expect_pass 'admin auth endpoint remains explicitly excluded' admin-auth

echo 'All CI-01 critical guard fixtures passed.'
