#!/usr/bin/env python3
from __future__ import annotations

import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

GUARD_VIOLATION = 1
DETECTOR_ERROR = 2
FORBIDDEN_PUBLIC_MARKERS = (
    "SECRET",
    "TOKEN",
    "PASSWORD",
    "API_KEY",
    "PRIVATE_KEY",
    "CREDENTIAL",
)


@dataclass(frozen=True)
class Token:
    kind: str
    value: str
    offset: int


class ScanError(RuntimeError):
    pass


def line_number(source: str, offset: int) -> int:
    return source.count("\n", 0, offset) + 1


def _parse_quoted(source: str, i: int, quote: str) -> tuple[Token, int]:
    start = i
    i += 1
    chars: list[str] = []
    while i < len(source):
        ch = source[i]
        if ch == "\\":
            if i + 1 >= len(source):
                raise ScanError("unterminated string escape")
            chars.extend((ch, source[i + 1]))
            i += 2
            continue
        if ch == quote:
            return Token("string", "".join(chars), start), i + 1
        chars.append(ch)
        i += 1
    raise ScanError("unterminated string literal")


def tokenize_ts(source: str) -> list[Token]:
    """Small dependency-free TS lexer for guard patterns.

    Comments and literal-only template content never become code tokens. Template
    interpolations are scanned as code so executable expressions cannot hide in
    `${...}`. Regex literals are consumed as literals so quotes or backticks in a
    regex cannot corrupt the scanner. This is intentionally a lexer, not a full
    TypeScript parser: guards only use token sequences and exact path contracts.
    """

    tokens: list[Token] = []
    n = len(source)

    def scan_template(i: int) -> int:
        i += 1
        literal: list[str] = []
        literal_start = i
        while i < n:
            ch = source[i]
            if ch == "\\":
                if i + 1 >= n:
                    raise ScanError("unterminated template escape")
                literal.extend((ch, source[i + 1]))
                i += 2
                continue
            if ch == "`":
                if literal:
                    tokens.append(Token("string", "".join(literal), literal_start))
                return i + 1
            if ch == "$" and i + 1 < n and source[i + 1] == "{":
                if literal:
                    tokens.append(Token("string", "".join(literal), literal_start))
                literal = []
                i = scan_code(i + 2, template_expr=True)
                literal_start = i
                continue
            literal.append(ch)
            i += 1
        raise ScanError("unterminated template literal")

    def scan_code(i: int, template_expr: bool = False) -> int:
        brace_depth = 1 if template_expr else 0
        while i < n:
            ch = source[i]
            if ch.isspace():
                i += 1
                continue
            if ch == "/" and i + 1 < n and source[i + 1] == "/":
                i += 2
                while i < n and source[i] != "\n":
                    i += 1
                continue
            if ch == "/" and i + 1 < n and source[i + 1] == "*":
                end = source.find("*/", i + 2)
                if end == -1:
                    raise ScanError("unterminated block comment")
                i = end + 2
                continue
            if ch in ("'", '"'):
                token, i = _parse_quoted(source, i, ch)
                tokens.append(token)
                continue
            if ch == "/":
                previous = tokens[-1].value if tokens else None
                regex_context = previous is None or previous in {
                    "(",
                    "[",
                    "{",
                    "=",
                    ":",
                    ",",
                    ";",
                    "!",
                    "?",
                    "return",
                    "case",
                    "throw",
                    "else",
                    "=>",
                }
                if regex_context:
                    start = i
                    i += 1
                    in_class = False
                    escaped = False
                    pattern: list[str] = []
                    while i < n:
                        current = source[i]
                        if escaped:
                            pattern.append(current)
                            escaped = False
                            i += 1
                            continue
                        if current == "\\":
                            pattern.append(current)
                            escaped = True
                            i += 1
                            continue
                        if current == "[":
                            in_class = True
                        elif current == "]":
                            in_class = False
                        elif current == "/" and not in_class:
                            i += 1
                            while i < n and source[i].isalpha():
                                i += 1
                            tokens.append(Token("regex", "".join(pattern), start))
                            break
                        pattern.append(current)
                        i += 1
                    else:
                        raise ScanError("unterminated regular expression literal")
                    continue
            if ch == "`":
                i = scan_template(i)
                continue
            if ch.isalpha() or ch in "_$":
                start = i
                i += 1
                while i < n and (source[i].isalnum() or source[i] in "_$"):
                    i += 1
                tokens.append(Token("id", source[start:i], start))
                continue
            if ch.isdigit():
                start = i
                i += 1
                while i < n and (source[i].isalnum() or source[i] in "._"):
                    i += 1
                tokens.append(Token("number", source[start:i], start))
                continue
            if template_expr:
                if ch == "{":
                    brace_depth += 1
                    tokens.append(Token("punct", ch, i))
                    i += 1
                    continue
                if ch == "}":
                    brace_depth -= 1
                    if brace_depth == 0:
                        return i + 1
                    tokens.append(Token("punct", ch, i))
                    i += 1
                    continue
            tokens.append(Token("punct", ch, i))
            i += 1
        if template_expr:
            raise ScanError("unterminated template expression")
        return i

    scan_code(0)
    return tokens


def is_test_path(path: Path) -> bool:
    return "__tests__" in path.parts or ".test." in path.name or ".spec." in path.name


def require_dir(root: Path, relative: str) -> Path:
    path = root / relative
    if not path.is_dir():
        raise ScanError(f"required scan directory is missing: {relative}")
    return path


def require_file(root: Path, relative: str) -> Path:
    path = root / relative
    if not path.is_file():
        raise ScanError(f"required scan file is missing: {relative}")
    return path


def iter_source_files(root: Path, relative_roots: Iterable[str]) -> list[Path]:
    files: list[Path] = []
    for relative in relative_roots:
        base = require_dir(root, relative)
        for path in base.rglob("*"):
            if path.is_file() and path.suffix in {".ts", ".tsx"}:
                files.append(path)
    return sorted(files, key=lambda p: str(p.relative_to(root)))


def read_tokens(root: Path, path: Path) -> tuple[str, list[Token]]:
    try:
        source = path.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as exc:
        raise ScanError(f"cannot read {path.relative_to(root)}: {exc}") from exc
    try:
        return source, tokenize_ts(source)
    except ScanError as exc:
        raise ScanError(f"cannot tokenize {path.relative_to(root)}: {exc}") from exc


def sequence_at(tokens: list[Token], index: int, values: tuple[str, ...]) -> bool:
    return index + len(values) <= len(tokens) and tuple(
        token.value for token in tokens[index : index + len(values)]
    ) == values


def find_sequence(tokens: list[Token], values: tuple[str, ...]) -> list[int]:
    return [i for i in range(len(tokens)) if sequence_at(tokens, i, values)]


def rel(root: Path, path: Path) -> str:
    return path.relative_to(root).as_posix()


def emit(message: str, details: list[str]) -> int:
    print(f"::error::{message}")
    for detail in details:
        print(detail)
    return GUARD_VIOLATION


def guard_execute_raw_unsafe(root: Path) -> int:
    details: list[str] = []
    for path in iter_source_files(root, ("src",)):
        if is_test_path(path.relative_to(root)):
            continue
        source, tokens = read_tokens(root, path)
        for token in tokens:
            if token.value == "$executeRawUnsafe":
                details.append(f"{rel(root, path)}:{line_number(source, token.offset)}")
    return (
        emit(
            "Found $executeRawUnsafe usage. Use $executeRaw with Prisma.sql template literals instead.",
            details,
        )
        if details
        else 0
    )


def _brace_pairs(tokens: list[Token]) -> dict[int, int]:
    stack: list[int] = []
    pairs: dict[int, int] = {}
    for i, token in enumerate(tokens):
        if token.value == "{":
            stack.append(i)
        elif token.value == "}":
            if not stack:
                raise ScanError("unbalanced closing brace")
            pairs[stack.pop()] = i
    if stack:
        raise ScanError("unbalanced opening brace")
    return pairs


def _enclosing_data_object(tokens: list[Token], index: int) -> bool:
    for start, end in sorted(_brace_pairs(tokens).items(), reverse=True):
        if (
            start < index < end
            and start >= 2
            and tokens[start - 1].value == ":"
            and tokens[start - 2].value == "data"
        ):
            return True
    return False


def _published_value_at(tokens: list[Token], index: int) -> bool:
    if index + 2 >= len(tokens) or tokens[index + 1].value != ":":
        return False
    value = tokens[index + 2]
    if value.kind == "string" and value.value == "PUBLISHED":
        return True
    return sequence_at(tokens, index + 2, ("PublicationStatus", ".", "PUBLISHED"))


def guard_direct_published_writes(root: Path) -> int:
    authorized = {
        "src/lib/affairs/publish-guard.ts",
        "src/lib/measures/transitions.ts",
    }
    details: list[str] = []
    for path in iter_source_files(root, ("src", "scripts")):
        relative = path.relative_to(root)
        if is_test_path(relative) or relative.as_posix() in authorized:
            continue
        source, tokens = read_tokens(root, path)
        for i, token in enumerate(tokens):
            if (
                token.value == "publicationStatus"
                and _published_value_at(tokens, i)
                and _enclosing_data_object(tokens, i)
            ):
                details.append(f"{rel(root, path)}:{line_number(source, token.offset)}")
    return (
        emit("Direct publicationStatus=PUBLISHED write outside an authorized publisher.", details)
        if details
        else 0
    )


def _member_chain(tokens: list[Token], start: int) -> tuple[list[str], int]:
    if start >= len(tokens) or tokens[start].kind != "id":
        return [], start
    values = [tokens[start].value]
    i = start + 1
    while i < len(tokens):
        if i + 1 < len(tokens) and tokens[i].value == "." and tokens[i + 1].kind == "id":
            values.append(tokens[i + 1].value)
            i += 2
            continue
        if (
            i + 2 < len(tokens)
            and tokens[i].value == "["
            and tokens[i + 1].kind == "string"
            and tokens[i + 2].value == "]"
        ):
            values.append(tokens[i + 1].value)
            i += 3
            continue
        break
    return values, i


def guard_importer_affair_create(root: Path) -> int:
    details: list[str] = []
    for path in iter_source_files(root, ("scripts", "src/services/sync")):
        relative = path.relative_to(root)
        if is_test_path(relative) or relative.as_posix() == "scripts/seed-fixtures.ts":
            continue
        source, tokens = read_tokens(root, path)
        for i, token in enumerate(tokens):
            if token.kind != "id" or token.value not in {"db", "tx"}:
                continue
            chain, end = _member_chain(tokens, i)
            if (
                chain[:3] == [token.value, "affair", "create"]
                and end < len(tokens)
                and tokens[end].value == "("
            ):
                details.append(f"{rel(root, path)}:{line_number(source, token.offset)}")
    return (
        emit("Importer creates an affair directly; use createDraftAffairFromDiscovery.", details)
        if details
        else 0
    )


def guard_importer_verified_at(root: Path) -> int:
    details: list[str] = []
    for path in iter_source_files(root, ("scripts", "src/services/sync")):
        relative = path.relative_to(root)
        if is_test_path(relative):
            continue
        source, tokens = read_tokens(root, path)
        for i, token in enumerate(tokens):
            if sequence_at(tokens, i, ("verifiedAt", ":", "new", "Date", "(")):
                details.append(f"{rel(root, path)}:{line_number(source, token.offset)}")
    return (
        emit("Importer writes verifiedAt; human validation must remain explicit.", details)
        if details
        else 0
    )


def guard_press_paywall(root: Path) -> int:
    details: list[str] = []
    for path in iter_source_files(root, ("src", "scripts")):
        relative = path.relative_to(root)
        if is_test_path(relative):
            continue
        source, tokens = read_tokens(root, path)
        for token in tokens:
            if token.value in {"MEDIAPART_EMAIL", "MEDIAPART_PASSWORD"}:
                details.append(
                    f"{rel(root, path)}:{line_number(source, token.offset)} authentication credential reference"
                )
            if token.kind == "string" and "login_check" in token.value:
                details.append(
                    f"{rel(root, path)}:{line_number(source, token.offset)} publisher login endpoint"
                )
            if (
                token.kind == "string"
                and "Mozilla/5.0" in token.value
                and "Poligraph" not in token.value
            ):
                details.append(
                    f"{rel(root, path)}:{line_number(source, token.offset)} unidentified crawler user-agent"
                )
    return (
        emit(
            "Press ingestion must not use publisher authentication and crawler UAs must identify Poligraph.",
            details,
        )
        if details
        else 0
    )


def _jsonld_sink_is_safe(tokens: list[Token], index: int) -> bool:
    for i in range(index, min(len(tokens), index + 24)):
        if sequence_at(tokens, i, ("__html", ":", "safeJsonLd", "(")):
            return True
    return False


def _jsonld_helper_contract(tokens: list[Token]) -> bool:
    has_function = bool(find_sequence(tokens, ("function", "safeJsonLd", "(")))
    has_stringify = bool(find_sequence(tokens, ("JSON", ".", "stringify", "(")))
    has_replace = any(token.value == "replace" for token in tokens)
    has_escaped_script = any(
        token.kind == "string" and "\\/script" in token.value for token in tokens
    )
    return has_function and has_stringify and has_replace and has_escaped_script


def guard_dangerous_html(root: Path) -> int:
    allowed_jsonld = "src/components/seo/JsonLd.tsx"
    details: list[str] = []
    for path in iter_source_files(root, ("src",)):
        relative = path.relative_to(root)
        if is_test_path(relative):
            continue
        source, tokens = read_tokens(root, path)
        sinks = [i for i, token in enumerate(tokens) if token.value == "dangerouslySetInnerHTML"]
        if not sinks:
            continue
        relative_str = relative.as_posix()
        if relative_str != allowed_jsonld:
            for i in sinks:
                details.append(
                    f"{relative_str}:{line_number(source, tokens[i].offset)} unsafe HTML sink"
                )
            continue
        if not _jsonld_helper_contract(tokens):
            details.append(f"{relative_str}: safeJsonLd helper contract missing")
        for i in sinks:
            if not _jsonld_sink_is_safe(tokens, i):
                details.append(
                    f"{relative_str}:{line_number(source, tokens[i].offset)} sink does not call safeJsonLd"
                )
    return (
        emit(
            "dangerouslySetInnerHTML is only allowed in canonical JSON-LD through safeJsonLd.",
            details,
        )
        if details
        else 0
    )


def guard_json_parse(root: Path) -> int:
    details: list[str] = []
    base = require_dir(root, "src/app/api")
    for path in sorted(base.rglob("*.ts"), key=lambda p: str(p.relative_to(root))):
        relative = path.relative_to(root)
        if is_test_path(relative) or relative.parts[:4] == ("src", "app", "api", "admin"):
            continue
        source, tokens = read_tokens(root, path)
        for i in find_sequence(tokens, ("JSON", ".", "parse", "(")):
            details.append(f"{rel(root, path)}:{line_number(source, tokens[i].offset)}")
    return (
        emit(
            "Public API routes must use canonical safeJsonParse(), not direct JSON.parse().",
            details,
        )
        if details
        else 0
    )


def guard_next_public_secrets(root: Path) -> int:
    details: list[str] = []
    for path in iter_source_files(root, ("src",)):
        relative = path.relative_to(root)
        if is_test_path(relative):
            continue
        source, tokens = read_tokens(root, path)
        for token in tokens:
            value = token.value
            if value.startswith("NEXT_PUBLIC_") and any(
                marker in value for marker in FORBIDDEN_PUBLIC_MARKERS
            ):
                details.append(f"{rel(root, path)}:{line_number(source, token.offset)} {value}")

    env_path = require_file(root, ".env.example")
    try:
        env_lines = env_path.read_text(encoding="utf-8").splitlines()
    except (OSError, UnicodeError) as exc:
        raise ScanError(f"cannot read .env.example: {exc}") from exc
    for lineno, raw in enumerate(env_lines, start=1):
        stripped = raw.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        name = stripped.split("=", 1)[0].strip()
        if name.startswith("NEXT_PUBLIC_") and any(
            marker in name for marker in FORBIDDEN_PUBLIC_MARKERS
        ):
            details.append(f".env.example:{lineno} {name}")
    return emit("Potential secret exposed through NEXT_PUBLIC_ variable.", details) if details else 0


def _has_admin_import(tokens: list[Token]) -> bool:
    module = "@/lib/api/with-admin-auth"
    for i, token in enumerate(tokens):
        if token.value != "import":
            continue
        window = tokens[i : min(len(tokens), i + 16)]
        if any(item.value == "withAdminAuth" for item in window) and any(
            item.kind == "string" and item.value == module for item in window
        ):
            return True
    return False


def guard_admin_auth(root: Path) -> int:
    details: list[str] = []
    base = require_dir(root, "src/app/api/admin")
    auth_route = Path("src/app/api/admin/auth/route.ts")
    for path in sorted(base.rglob("route.ts"), key=lambda p: str(p.relative_to(root))):
        relative = path.relative_to(root)
        if relative == auth_route or is_test_path(relative):
            continue
        source, tokens = read_tokens(root, path)
        if not (
            _has_admin_import(tokens)
            and bool(find_sequence(tokens, ("withAdminAuth", "(")))
        ):
            details.append(f"{rel(root, path)}: missing canonical withAdminAuth import/call")
    return (
        emit("Admin routes must import and invoke canonical withAdminAuth().", details)
        if details
        else 0
    )


GUARDS = {
    "execute-raw-unsafe": guard_execute_raw_unsafe,
    "direct-published-writes": guard_direct_published_writes,
    "importer-affair-create": guard_importer_affair_create,
    "importer-verified-at": guard_importer_verified_at,
    "press-paywall": guard_press_paywall,
    "dangerous-html": guard_dangerous_html,
    "json-parse": guard_json_parse,
    "next-public-secrets": guard_next_public_secrets,
    "admin-auth": guard_admin_auth,
}


def main(argv: list[str]) -> int:
    if len(argv) not in {2, 3}:
        print(f"usage: {argv[0]} <guard-name> [root]", file=sys.stderr)
        return DETECTOR_ERROR
    guard = GUARDS.get(argv[1])
    if guard is None:
        print(f"unknown guard: {argv[1]}", file=sys.stderr)
        return DETECTOR_ERROR
    root = Path(argv[2] if len(argv) == 3 else ".").resolve()
    if not root.is_dir():
        print(f"::error::detector error: scan root is missing: {root}", file=sys.stderr)
        return DETECTOR_ERROR
    try:
        return guard(root)
    except (ScanError, OSError, UnicodeError) as exc:
        print(f"::error::detector error: {exc}", file=sys.stderr)
        return DETECTOR_ERROR


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
