#!/usr/bin/env python3
from __future__ import annotations

import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
GUARD = REPO_ROOT / "scripts/ci/direct_publication_guard.py"


class DirectPublicationGuardTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.root = Path(self.tempdir.name)
        for relative in (
            "src/lib/affairs",
            "src/lib/measures",
            "src/services",
            "scripts",
        ):
            (self.root / relative).mkdir(parents=True, exist_ok=True)

    def tearDown(self) -> None:
        self.tempdir.cleanup()

    def write(self, relative: str, content: str) -> Path:
        path = self.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        return path

    def run_guard(self, root: Path | None = None) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(GUARD), str(root or self.root)],
            capture_output=True,
            text=True,
            check=False,
        )

    def assert_violation(self) -> None:
        result = self.run_guard()
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn("canonical publishers", result.stdout)
        self.assertNotIn("detector error", result.stdout + result.stderr)

    def test_affair_literal_publication_outside_publisher_fails(self) -> None:
        self.write(
            "src/services/affairs.ts",
            'await db.affair.update({ where: { id }, data: { publicationStatus: "PUBLISHED" } });\n',
        )
        self.assert_violation()

    def test_measure_enum_publication_outside_publisher_fails(self) -> None:
        self.write(
            "src/services/measures.ts",
            "await tx.measure.update({\n"
            "  where: { id },\n"
            "  data: { publicationStatus: PublicationStatus.PUBLISHED },\n"
            "});\n",
        )
        self.assert_violation()

    def test_canonical_affair_and_measure_publishers_pass(self) -> None:
        self.write(
            "src/lib/affairs/publish-guard.ts",
            'await db.affair.update({ where: { id }, data: { publicationStatus: "PUBLISHED" } });\n',
        )
        self.write(
            "src/lib/measures/transitions.ts",
            "await tx.measure.update({ data: { publicationStatus: PublicationStatus.PUBLISHED } });\n",
        )
        result = self.run_guard()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_legitimate_politician_publication_is_outside_this_guard(self) -> None:
        self.write(
            "scripts/promote-maires.ts",
            "await db.politician.updateMany({\n"
            "  where: { id: { in: ids } },\n"
            "  data: { publicationStatus: PublicationStatus.PUBLISHED },\n"
            "});\n",
        )
        result = self.run_guard()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_similar_publisher_filename_does_not_bypass(self) -> None:
        self.write(
            "src/lib/affairs/publish-guard.ts-extra.ts",
            'await db.affair.update({ data: { publicationStatus: "PUBLISHED" } });\n',
        )
        self.assert_violation()

    def test_multiline_model_access_is_still_attributed(self) -> None:
        self.write(
            "src/services/affairs.ts",
            "await db.affair\n"
            ".update({\n"
            "  data: {\n"
            "    publicationStatus: PublicationStatus.PUBLISHED,\n"
            "  },\n"
            "});\n",
        )
        self.assert_violation()

    def test_missing_root_is_detector_failure(self) -> None:
        with tempfile.TemporaryDirectory() as empty:
            root = Path(empty) / "missing"
            result = self.run_guard(root)
            self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
            self.assertIn("detector error", result.stderr)


if __name__ == "__main__":
    unittest.main(verbosity=2)
