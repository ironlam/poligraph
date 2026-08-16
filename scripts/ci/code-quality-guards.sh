#!/usr/bin/env bash
set -euo pipefail

guard_name=${1:-}
root=${2:-.}

if [[ -z "$guard_name" ]]; then
  echo "usage: $0 <guard-name> [root]" >&2
  exit 2
fi

cd "$root"

fail_with() {
  local message=$1
  local details=${2:-}
  echo "::error::$message"
  if [[ -n "$details" ]]; then
    printf '%s\n' "$details"
  fi
  return 1
}

guard_execute_raw_unsafe() {
  local violations
  violations=$(grep -rn '\$executeRawUnsafe' src/ --include='*.ts' --include='*.tsx' 2>/dev/null || true)
  if [[ -n "$violations" ]]; then
    fail_with 'Found $executeRawUnsafe usage. Use $executeRaw with Prisma.sql template literals instead.' "$violations"
  fi
}

guard_direct_published_writes() {
  local found=0
  local file linenum rest start context data_line where_line

  while IFS= read -r file; do
    [[ -z "$file" ]] && continue
    while IFS=: read -r linenum rest; do
      start=$((linenum > 12 ? linenum - 12 : 1))
      context=$(sed -n "${start},${linenum}p" "$file")
      data_line=$(printf '%s\n' "$context" | grep -n 'data:' | tail -1 | cut -d: -f1 || true)
      where_line=$(printf '%s\n' "$context" | grep -n 'where\|Where' | tail -1 | cut -d: -f1 || true)
      if [[ -n "$data_line" ]] && { [[ -z "$where_line" ]] || [[ "$data_line" -gt "$where_line" ]]; }; then
        echo "::error file=$file,line=$linenum::Écriture directe de publicationStatus PUBLISHED hors publish-guard"
        found=1
      fi
    done < <(grep -n 'publicationStatus: "PUBLISHED"' "$file" || true)
  done < <(
    grep -rl 'publicationStatus: "PUBLISHED"' src/ scripts/ --include='*.ts' --include='*.tsx' 2>/dev/null \
      | grep -v 'src/lib/affairs/publish-guard.ts' \
      | grep -v 'src/lib/measures/transitions.ts' \
      | grep -v '__tests__' \
      | grep -v '\.test\.' \
      || true
  )

  return "$found"
}

guard_importer_affair_create() {
  local violations
  violations=$(
    grep -rn '\(db\|tx\)\.affair\.create' scripts/ src/services/sync/ --include='*.ts' 2>/dev/null \
      | grep -v '__tests__' \
      | grep -v '\.test\.' \
      | grep -v 'scripts/seed-fixtures.ts' \
      || true
  )
  if [[ -n "$violations" ]]; then
    fail_with 'Un importeur crée une affaire directement. Utilisez createDraftAffairFromDiscovery (src/services/affairs/create-draft.ts).' "$violations"
  fi
}

guard_importer_verified_at() {
  local violations
  violations=$(
    grep -rn 'verifiedAt:.*new Date(' scripts/ src/services/sync/ --include='*.ts' 2>/dev/null \
      | grep -v '__tests__' \
      | grep -v '\.test\.' \
      || true
  )
  if [[ -n "$violations" ]]; then
    fail_with 'Un importeur écrit verifiedAt. La validation humaine passe exclusivement par assertPublishable().' "$violations"
  fi
}

guard_press_paywall() {
  local violations ua
  violations=$(
    grep -rniE 'MEDIAPART_(EMAIL|PASSWORD)|login_check' src/ scripts/ --include='*.ts' --include='*.tsx' 2>/dev/null \
      | grep -v '__tests__' \
      | grep -v '\.test\.' \
      || true
  )
  if [[ -n "$violations" ]]; then
    fail_with "Référence à une authentification éditeur dans le code d'ingestion." "$violations"
    return 1
  fi

  ua=$(
    grep -rn 'Mozilla/5.0' src/ scripts/ --include='*.ts' --include='*.tsx' 2>/dev/null \
      | grep -v '__tests__' \
      | grep -v '\.test\.' \
      | grep -v 'Poligraph' \
      || true
  )
  if [[ -n "$ua" ]]; then
    fail_with "User-Agent n'identifiant pas Poligraph. Le robot doit s'identifier avec une URL de contact." "$ua"
  fi
}

guard_dangerous_html() {
  if [[ -f src/components/ui/markdown.tsx ]] && grep -q 'dangerouslySetInnerHTML' src/components/ui/markdown.tsx; then
    fail_with 'MarkdownText must render untrusted content structurally.'
    return 1
  fi

  local violations
  violations=$(
    grep -rn 'dangerouslySetInnerHTML' src/ --include='*.tsx' 2>/dev/null \
      | grep -v 'DOMPurify\|sanitize\|JSON.stringify\|JsonLd' \
      || true
  )
  if [[ -n "$violations" ]]; then
    fail_with 'Found dangerouslySetInnerHTML without sanitization.' "$violations"
  fi
}

guard_json_parse() {
  local found=0
  local file linenum rest start context

  while IFS= read -r file; do
    [[ -z "$file" ]] && continue
    while IFS=: read -r linenum rest; do
      start=$((linenum > 5 ? linenum - 5 : 1))
      context=$(sed -n "${start},${linenum}p" "$file")
      if printf '%s\n' "$context" | grep -q 'try'; then
        continue
      fi
      echo "::error file=$file,line=$linenum::JSON.parse of user input without try-catch"
      found=1
    done < <(grep -n 'JSON\.parse' "$file" | grep -v 'JSON\.stringify' || true)
  done < <(
    grep -rl 'JSON\.parse' src/app/api/ --include='*.ts' 2>/dev/null \
      | grep -v '/admin/' \
      || true
  )

  return "$found"
}

guard_next_public_secrets() {
  local violations
  violations=$(
    grep -rn 'NEXT_PUBLIC_.*SECRET\|NEXT_PUBLIC_.*TOKEN\|NEXT_PUBLIC_.*PASSWORD\|NEXT_PUBLIC_.*API_KEY' \
      src/ .env.example --include='*.ts' --include='*.tsx' --include='*.env*' 2>/dev/null \
      || true
  )
  if [[ -n "$violations" ]]; then
    fail_with 'Potential secret exposed in NEXT_PUBLIC_ variable.' "$violations"
  fi
}

guard_admin_auth() {
  local violations=""
  local file

  while IFS= read -r file; do
    [[ -z "$file" ]] && continue
    if ! grep -q 'withAdminAuth' "$file"; then
      violations+="${file}: missing withAdminAuth wrapper"$'\n'
    fi
  done < <(find src/app/api/admin -name 'route.ts' 2>/dev/null | grep -v '/auth/' || true)

  if [[ -n "$violations" ]]; then
    fail_with 'Admin routes must use withAdminAuth() wrapper.' "${violations%$'\n'}"
  fi
}

case "$guard_name" in
  execute-raw-unsafe) guard_execute_raw_unsafe ;;
  direct-published-writes) guard_direct_published_writes ;;
  importer-affair-create) guard_importer_affair_create ;;
  importer-verified-at) guard_importer_verified_at ;;
  press-paywall) guard_press_paywall ;;
  dangerous-html) guard_dangerous_html ;;
  json-parse) guard_json_parse ;;
  next-public-secrets) guard_next_public_secrets ;;
  admin-auth) guard_admin_auth ;;
  *)
    echo "unknown guard: $guard_name" >&2
    exit 2
    ;;
esac
