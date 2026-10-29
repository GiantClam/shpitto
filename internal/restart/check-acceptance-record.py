#!/usr/bin/env python3
"""Validate one staged-acceptance record without network access or secrets."""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

ALLOWED = {"NOT_STARTED", "IN_PROGRESS", "READY_FOR_REVIEW", "PASS", "FAIL", "BLOCKED", "STALE"}
ROOT = Path(__file__).resolve().parents[2]


def digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            value.update(chunk)
    return value.hexdigest()


def main() -> int:
    if len(sys.argv) not in {2, 3} or (len(sys.argv) == 3 and sys.argv[2] != "--current"):
        print("usage: check-acceptance-record.py <record.json> [--current]", file=sys.stderr)
        return 2
    record_path = Path(sys.argv[1]).resolve()
    try:
        record = json.loads(record_path.read_text(encoding="utf-8-sig"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"cannot read record: {exc}", file=sys.stderr)
        return 2

    errors: list[str] = []
    if record.get("status") not in ALLOWED:
        errors.append("status is outside acceptance-status.json vocabulary")
    if not record.get("stageId"):
        errors.append("stageId is required")
    if not record.get("candidateId"):
        errors.append("candidateId is required for implementation evidence")
    if record.get("status") == "PASS":
        review = record.get("independentReview") or {}
        integration = record.get("integrationDecision") or {}
        if review.get("decision") != "PASS" or not review.get("independentFromImplementer"):
            errors.append("PASS requires an independent reviewer decision")
        if integration.get("decision") != "PASS":
            errors.append("PASS requires an integrator decision")
        if record.get("defects") and any(d.get("status") == "OPEN" and d.get("severity") in {"P0", "P1"} for d in record["defects"]):
            errors.append("PASS cannot contain an open P0/P1 defect")
    for key in ("criterionResults", "commonStandardResults", "scenarioResults"):
        for index, result in enumerate(record.get(key) or []):
            if result.get("result") == "PASS" and not result.get("evidenceRefs"):
                errors.append(f"{key}[{index}] PASS has no evidenceRefs")
    candidate = record.get("candidate") or {}
    for key in ("sourceTreeSha256", "schemaSha256", "lockfileSha256", "configurationSha256", "contractSha256", "validatorSha256"):
        if candidate.get(key) and len(candidate[key]) != 64:
            errors.append(f"candidate.{key} is not a SHA-256 digest")

    if "--current" in sys.argv:
        # Historical evidence remains inspectable; promotion explicitly requests
        # current-byte verification, including test and validator footprints.
        inputs = candidate.get("digestInputs") or {}
        for group in ("sourceTree", "schema", "configuration", "contract", "validator"):
            paths = inputs.get(group)
            if not isinstance(paths, list) or not paths:
                errors.append(f"candidate.digestInputs.{group} is required")
                continue
            files: set[Path] = set()
            for entry in paths:
                resolved = (ROOT / entry).resolve()
                if not resolved.is_relative_to(ROOT) or not resolved.exists():
                    errors.append(f"invalid digest input: {entry}")
                    continue
                files.update(path for path in resolved.rglob("*") if path.is_file()) if resolved.is_dir() else files.add(resolved)
            entries = []
            for path in sorted(files, key=lambda path: path.relative_to(ROOT).as_posix()):
                entries.append(f"{path.relative_to(ROOT).as_posix()}\0{path.stat().st_size}\0{digest(path)}")
            actual = hashlib.sha256("\n".join(entries).encode("utf-8")).hexdigest()
            if actual != candidate.get(f"{group}Sha256"):
                errors.append(f"candidate.{group}Sha256 does not match current files")
        if candidate.get("lockfileSha256") != digest(ROOT / "pnpm-lock.yaml"):
            errors.append("candidate.lockfileSha256 does not match current files")

    if record.get("status") == "PASS" and "--current" in sys.argv:
        for key in ("criterionResults", "commonStandardResults", "scenarioResults"):
            for index, entry in enumerate(record.get(key) or []):
                if (entry.get("mandatory") or entry.get("applicable")) and entry.get("result") != "PASS":
                    errors.append(f"{key}[{index}] has an unresolved required result")
        coverage = record.get("coverage") or {}
        if coverage.get("status") == "PASS" and (coverage.get("percent") or 0) < 80:
            errors.append("PASS coverage is below the required 80%")

    result = {"record": str(record_path), "status": record.get("status"), "errors": errors}
    print(json.dumps(result, ensure_ascii=False))
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
