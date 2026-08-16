#!/usr/bin/env python3
from __future__ import annotations

import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
GUARD = REPO_ROOT / "scripts/ci/code_quality_guards.py"
ALL_GUARDS = (
    "execute-raw-unsafe",
    "direct-published-writes",
    "importer-affair-create",
    "importer-verified-at",
    "press-paywall",
    "dangerous-html",
    "json-parse",
    "next-public-secrets",
    "admin-auth",
)


class GuardContractTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.root = Path(self.tempdir.name)
        for relative in (
            "src/app/api/public",
            "src/app/api/admin/example",
            "src/app/api/admin/auth",
            "src/components/ui",
            "src/components/example",
            "src/components/seo",
            "src/lib/affairs",
            "src/lib/measures",
            "src/services/sync",
            "scripts",
        ):
            (self.root / relative).mkdir(parents=True, exist_ok=True)
        (self.root / ".env.example").write_text("", encoding="utf-8")
        (self.root / "src/components/ui/markdown.tsx").write_text("", encoding="utf-8")

    def tearDown(self) -> None:
        self.tempdir.cleanup()

    def write(self, relative: str, content: str) -> Path:
        path = self.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        return path

    def run_guard(self, guard: str, root: Path | None = None) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(GUARD), guard, str(root or self.root)],
            capture_output=True,
            text=True,
            check=False,
        )

    def assert_pass(self, guard: str) -> None:
        result = self.run_guard(guard)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def assert_violation(self, guard: str, diagnostic: str) -> None:
        result = self.run_guard(guard)
        output = result.stdout + result.stderr
        self.assertEqual(result.returncode, 1, output)
        self.assertIn("::error::", output)
        self.assertNotIn("detector error", output)
        self.assertIn(diagnostic, output)

    def test_execute_raw_unsafe_rejects_code_but_not_comment(self) -> None:
        path = self.write("src/lib/query.ts", 'db.$executeRawUnsafe("SELECT 1");\n')
        self.assert_violation("execute-raw-unsafe", "$executeRawUnsafe")
        path.write_text('// db.$executeRawUnsafe("SELECT 1")\ndb.$executeRaw`SELECT 1`;\n')
        self.assert_pass("execute-raw-unsafe")

    def test_direct_published_write_rejects_literal_and_enum(self) -> None:
        path = self.write(
            "src/services/publisher.ts",
            'await db.affair.update({ data: { publicationStatus: "PUBLISHED" } });\n',
        )
        self.assert_violation("direct-published-writes", "publicationStatus=PUBLISHED")
        path.write_text(
            "await db.affair.update({\n  data: { publicationStatus: PublicationStatus.PUBLISHED },\n});\n",
            encoding="utf-8",
        )
        self.assert_violation("direct-published-writes", "publicationStatus=PUBLISHED")

    def test_direct_published_write_allows_authorized_exact_path(self) -> None:
        self.write(
            "src/lib/affairs/publish-guard.ts",
            'await db.affair.update({ data: { publicationStatus: "PUBLISHED" } });\n',
        )
        self.assert_pass("direct-published-writes")

    def test_test_path_exclusion_is_exact_component_not_substring(self) -> None:
        self.write(
            "src/services/__tests__/publisher.test.ts",
            'await db.affair.update({ data: { publicationStatus: "PUBLISHED" } });\n',
        )
        self.assert_pass("direct-published-writes")
        self.write(
            "src/services/not__tests__production/publisher.ts",
            'await db.affair.update({ data: { publicationStatus: "PUBLISHED" } });\n',
        )
        self.assert_violation("direct-published-writes", "publicationStatus=PUBLISHED")

    def test_importer_affair_create_rejects_multiline_and_bracket_access(self) -> None:
        path = self.write("scripts/import-affair.ts", "await db.affair\n.create({ data: affair });\n")
        self.assert_violation("importer-affair-create", "creates an affair directly")
        path.write_text('await db["affair"]["create"]({ data: affair });\n', encoding="utf-8")
        self.assert_violation("importer-affair-create", "creates an affair directly")

    def test_seed_fixture_exclusion_requires_exact_filename(self) -> None:
        self.write("scripts/seed-fixtures.ts", "await db.affair.create({ data: affair });\n")
        self.assert_pass("importer-affair-create")
        self.write("scripts/seed-fixtures.ts-extra.ts", "await db.affair.create({ data: affair });\n")
        self.assert_violation("importer-affair-create", "creates an affair directly")

    def test_importer_verified_at_rejects_multiline_assignment(self) -> None:
        path = self.write("src/services/sync/affairs.ts", "const data = { verifiedAt:\nnew Date() };\n")
        self.assert_violation("importer-verified-at", "writes verifiedAt")
        path.write_text("const select = { verifiedAt: true };\n", encoding="utf-8")
        self.assert_pass("importer-verified-at")

    def test_press_guard_ignores_comments_as_proof(self) -> None:
        path = self.write("scripts/press.ts", 'const ua = "Mozilla/5.0"; // Poligraph\n')
        self.assert_violation("press-paywall", "crawler UAs")
        path.write_text(
            'const ua = "Mozilla/5.0 (compatible; Poligraph/1.0; +https://poligraph.fr)";\n',
            encoding="utf-8",
        )
        self.assert_pass("press-paywall")

    def test_press_guard_rejects_credentials_and_login_endpoint(self) -> None:
        path = self.write("scripts/press.ts", "const email = process.env.MEDIAPART_EMAIL;\n")
        self.assert_violation("press-paywall", "authentication")
        path.write_text('const endpoint = "/login_check";\n', encoding="utf-8")
        self.assert_violation("press-paywall", "login")

    def test_html_sink_rejects_sanitizer_words_in_comment_or_filename(self) -> None:
        self.write(
            "src/components/example/JsonLdUnsafe.tsx",
            "export const Unsafe = ({ html }) => (\n"
            "  <div dangerouslySetInnerHTML={{ __html: html }} /> // sanitize DOMPurify\n"
            ");\n",
        )
        self.assert_violation("dangerous-html", "canonical JSON-LD")

    def test_canonical_jsonld_requires_safe_helper_call_and_escape_contract(self) -> None:
        path = self.write(
            "src/components/seo/JsonLd.tsx",
            "function safeJsonLd(data: object): string {\n"
            '  return JSON.stringify(data).replace(/<\\/script/gi, "<\\\\/script");\n'
            "}\n"
            "export const JsonLd = ({ data }) => (\n"
            "  <script dangerouslySetInnerHTML={{ __html: safeJsonLd(data) }} />\n"
            ");\n",
        )
        self.assert_pass("dangerous-html")
        path.write_text(
            "function safeJsonLd(data: object): string { return JSON.stringify(data); }\n"
            "export const JsonLd = ({ data }) => (\n"
            "  <script dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />\n"
            ");\n",
            encoding="utf-8",
        )
        self.assert_violation("dangerous-html", "safeJsonLd")

    def test_public_json_parse_is_rejected_regardless_of_try_text_or_distance(self) -> None:
        path = self.root / "src/app/api/public/route.ts"
        cases = (
            '// try\nexport const GET = () => JSON.parse(raw);\n',
            'const text = "try";\nexport const GET = () => JSON.parse(raw);\n',
            "try { other(); } catch {}\nexport const GET = () => JSON.parse(raw);\n",
            "export const GET = () => JSON\n.parse(raw);\n",
            "try {\n  a(); b(); c(); d(); e(); f();\n  JSON.parse(raw);\n} catch {}\n",
        )
        for content in cases:
            with self.subTest(content=content):
                path.write_text(content, encoding="utf-8")
                self.assert_violation("json-parse", "safeJsonParse")
        path.write_text("export const GET = () => safeJsonParse(raw);\n", encoding="utf-8")
        self.assert_pass("json-parse")

    def test_public_json_parse_inside_template_expression_is_rejected(self) -> None:
        self.write("src/app/api/public/route.ts", "const x = `${JSON.parse(raw)}`;\n")
        self.assert_violation("json-parse", "safeJsonParse")

    def test_admin_json_parse_remains_outside_public_parse_guard(self) -> None:
        self.write("src/app/api/admin/example/parser.ts", "export const parse = (x) => JSON.parse(x);\n")
        self.assert_pass("json-parse")

    def test_next_public_secret_markers_include_private_key(self) -> None:
        (self.root / ".env.example").write_text("NEXT_PUBLIC_PRIVATE_KEY=x\n", encoding="utf-8")
        self.assert_violation("next-public-secrets", "PRIVATE_KEY")
        (self.root / ".env.example").write_text("NEXT_PUBLIC_SITE_URL=https://poligraph.fr\n", encoding="utf-8")
        self.assert_pass("next-public-secrets")

    def test_next_public_secret_comment_does_not_fail(self) -> None:
        self.write("src/lib/config.ts", "// NEXT_PUBLIC_PRIVATE_KEY is forbidden\nexport const ok = true;\n")
        self.assert_pass("next-public-secrets")

    def test_admin_auth_requires_canonical_import_and_actual_call(self) -> None:
        path = self.root / "src/app/api/admin/example/route.ts"
        path.write_text("// withAdminAuth()\nexport const POST = () => Response.json({});\n", encoding="utf-8")
        self.assert_violation("admin-auth", "canonical withAdminAuth")
        path.write_text(
            'import { withAdminAuth } from "@/lib/api/with-admin-auth";\n'
            "export const POST = () => Response.json({});\n",
            encoding="utf-8",
        )
        self.assert_violation("admin-auth", "canonical withAdminAuth")
        path.write_text(
            'import { withAdminAuth } from "@/lib/api/with-admin-auth";\n'
            "export const POST = withAdminAuth(async () => Response.json({}));\n",
            encoding="utf-8",
        )
        self.assert_pass("admin-auth")

    def test_admin_auth_exclusion_is_exact_route(self) -> None:
        self.write("src/app/api/admin/auth/route.ts", "export const POST = () => Response.json({});\n")
        self.assert_pass("admin-auth")
        self.write("src/app/api/admin/auth-bypass/route.ts", "export const POST = () => Response.json({});\n")
        self.assert_violation("admin-auth", "canonical withAdminAuth")

    def test_newline_filename_is_scanned(self) -> None:
        self.write("src/evil\nname.ts", 'db.$executeRawUnsafe("SELECT 1");\n')
        self.assert_violation("execute-raw-unsafe", "$executeRawUnsafe")

    def test_missing_scan_roots_fail_closed_with_detector_status(self) -> None:
        with tempfile.TemporaryDirectory() as empty:
            root = Path(empty)
            for guard in ALL_GUARDS:
                with self.subTest(guard=guard):
                    result = self.run_guard(guard, root)
                    output = result.stdout + result.stderr
                    self.assertEqual(result.returncode, 2, output)
                    self.assertIn("detector error", output)

    def test_unknown_guard_is_detector_error(self) -> None:
        result = self.run_guard("not-a-guard")
        self.assertEqual(result.returncode, 2)
        self.assertIn("unknown guard", result.stderr)


if __name__ == "__main__":
    unittest.main(verbosity=2)
