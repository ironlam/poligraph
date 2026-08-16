#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path

from code_quality_guards import (
    DETECTOR_ERROR,
    GUARD_VIOLATION,
    ScanError,
    _brace_pairs,
    _member_chain,
    _published_value_at,
    is_test_path,
    iter_source_files,
    line_number,
    read_tokens,
    rel,
)

GUARDED_MODELS = {"affair", "measure"}
WRITE_METHODS = {"create", "update", "updateMany", "upsert"}
AUTHORIZED_PUBLISHERS = {
    "affair": {"src/lib/affairs/publish-guard.ts"},
    "measure": {"src/lib/measures/transitions.ts"},
}


def enclosing_data_object_start(tokens, index: int) -> int | None:
    candidates = [
        start
        for start, end in _brace_pairs(tokens).items()
        if start < index < end
        and start >= 2
        and tokens[start - 1].value == ":"
        and tokens[start - 2].value == "data"
    ]
    return max(candidates) if candidates else None


def mutation_model_for_data(tokens, data_start: int) -> str | None:
    """Return the Prisma model owning the argument object that contains data: {}."""

    pairs = _brace_pairs(tokens)
    enclosing_args = sorted(
        (
            (start, end)
            for start, end in pairs.items()
            if start < data_start < end
            and start >= 1
            and tokens[start - 1].value == "("
        ),
        key=lambda item: item[0],
        reverse=True,
    )

    for arg_start, _ in enclosing_args:
        call_paren = arg_start - 1
        for start in range(max(0, call_paren - 16), call_paren):
            if tokens[start].value not in {"db", "tx"}:
                continue
            chain, end = _member_chain(tokens, start)
            if (
                end == call_paren
                and len(chain) >= 3
                and chain[0] in {"db", "tx"}
                and chain[2] in WRITE_METHODS
            ):
                return chain[1]
    return None


def run(root: Path) -> int:
    details: list[str] = []

    for path in iter_source_files(root, ("src", "scripts")):
        relative = path.relative_to(root)
        if is_test_path(relative):
            continue

        source, tokens = read_tokens(root, path)
        for i, token in enumerate(tokens):
            if token.value != "publicationStatus" or not _published_value_at(tokens, i):
                continue

            data_start = enclosing_data_object_start(tokens, i)
            if data_start is None:
                continue

            model = mutation_model_for_data(tokens, data_start)
            if model not in GUARDED_MODELS:
                continue

            relative_str = relative.as_posix()
            if relative_str in AUTHORIZED_PUBLISHERS[model]:
                continue

            details.append(
                f"{relative_str}:{line_number(source, token.offset)} direct {model} publication"
            )

    if details:
        print("::error::Affair and Measure publication must use their canonical publishers.")
        for detail in details:
            print(detail)
        return GUARD_VIOLATION
    return 0


def main(argv: list[str]) -> int:
    if len(argv) not in {1, 2}:
        print(f"usage: {argv[0]} [root]", file=sys.stderr)
        return DETECTOR_ERROR
    root = Path(argv[1] if len(argv) == 2 else ".").resolve()
    if not root.is_dir():
        print(f"::error::detector error: scan root is missing: {root}", file=sys.stderr)
        return DETECTOR_ERROR
    try:
        return run(root)
    except (ScanError, OSError, UnicodeError) as exc:
        print(f"::error::detector error: {exc}", file=sys.stderr)
        return DETECTOR_ERROR


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
