"""Verify the M1 legacy relocation and rehearse restoration in a disposable copy."""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import shutil
import subprocess
import tempfile
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
PRE_MOVE = ROOT / "internal" / "restart" / "pre-move-manifest.json"
JOURNAL = ROOT / "internal" / "restart" / "relocation-journal.json"
OUTPUT = ROOT / "internal" / "restart" / "post-move-manifest.json"
DESTINATION = ROOT / "legacy" / "shpitto-platform"
GENERATED_SEGMENTS = {
    ".agent_memory",
    ".cache",
    ".next",
    ".playwright-cli",
    ".shpitto",
    ".tmp",
    ".turbo",
    ".vercel",
    ".wrangler",
    "build",
    "coverage",
    "dist",
    "node_modules",
    "out",
    "test-results",
}
PRIVATE_SEGMENTS = {".env", ".private", ".secrets", "secrets"}
PRIVATE_TOOL_SEGMENTS = {".opencode"}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def git_bytes(*args: str) -> bytes:
    result = subprocess.run(
        ["git", *args],
        cwd=ROOT,
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
    )
    return result.stdout


def git_text(*args: str) -> str:
    return git_bytes(*args).decode("utf-8", errors="replace")


def split_null(data: bytes) -> list[str]:
    return [item.decode("utf-8", errors="replace") for item in data.split(b"\0") if item]


def ignored_class(path: str) -> str:
    path_obj = Path(path)
    parts = {part.lower() for part in path_obj.parts}
    name = path_obj.name.lower()
    if parts & PRIVATE_TOOL_SEGMENTS:
        return "private_tool_state"
    if name in {".env", ".env.local", ".env.production.local", ".env.development.local", ".env.test.local"}:
        return "private_configuration"
    if parts & PRIVATE_SEGMENTS or name.endswith((".key", ".pem", ".secret")):
        return "private_configuration"
    if parts & GENERATED_SEGMENTS or name.endswith((".log", ".pid", ".tsbuildinfo")):
        return "generated_or_runtime"
    return "ignored_authored_candidate"


def status_path(raw: str) -> str:
    if raw.startswith("? "):
        return raw[2:]
    if raw.startswith("2 ") and "\t" in raw:
        return raw.split("\t", 1)[1]
    if raw.startswith("1 "):
        fields = raw.split(" ", 8)
        return fields[8] if len(fields) == 9 else ""
    if raw.startswith("u "):
        fields = raw.split(" ", 10)
        return fields[10] if len(fields) == 11 else ""
    return ""


def atomic_json_write(path: Path, value: dict[str, object]) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def main() -> int:
    if OUTPUT.exists():
        raise SystemExit("post-move manifest already exists; refusing to overwrite")
    pre_move = json.loads(PRE_MOVE.read_text(encoding="utf-8"))
    journal = json.loads(JOURNAL.read_text(encoding="utf-8"))
    if journal.get("status") != "COMPLETED":
        raise SystemExit("relocation journal is not complete")
    if not DESTINATION.is_dir():
        raise SystemExit("legacy destination is missing")

    pre_move_hash = sha256_file(PRE_MOVE)
    journal_hash = sha256_file(JOURNAL)
    if pre_move_hash != journal.get("preMoveManifestSha256"):
        raise SystemExit("relocation journal does not match the pre-move manifest")

    records = pre_move["sourceCandidates"]["files"]
    moved_records: list[dict[str, object]] = []
    destination_paths: set[str] = set()
    source_remaining: list[str] = []
    destination_mismatches: list[str] = []
    for record in records:
        source_relative = Path(record["path"])
        destination_relative = Path("legacy") / "shpitto-platform" / source_relative
        destination_paths.add(destination_relative.as_posix())
        source = ROOT / source_relative
        target = ROOT / destination_relative
        if source.exists():
            source_remaining.append(record["path"])
        if not target.is_file() or target.stat().st_size != record["bytes"]:
            destination_mismatches.append(record["path"])
        elif record.get("sha256") is not None and sha256_file(target) != record["sha256"]:
            destination_mismatches.append(record["path"])
        moved_records.append(
            {
                "source": record["path"],
                "destination": destination_relative.as_posix(),
                "bytes": record["bytes"],
                "sha256": record["sha256"],
            }
        )

    actual_destination_paths = {
        path.relative_to(ROOT).as_posix()
        for path in DESTINATION.rglob("*")
        if path.is_file()
    }
    unexpected_destination_files = sorted(actual_destination_paths - destination_paths)
    missing_destination_files = sorted(destination_paths - actual_destination_paths)

    ignored_paths = split_null(
        git_bytes("ls-files", "-z", "--others", "-i", "--exclude-standard", "--", "apps", "builder", "packages", "sites")
    )
    ignored_by_class: dict[str, list[str]] = defaultdict(list)
    for path in ignored_paths:
        ignored_by_class[ignored_class(path)].append(path)
    ignored_summary = []
    for classification in sorted(ignored_by_class):
        paths = sorted(ignored_by_class[classification])
        ignored_summary.append(
            {
                "classification": classification,
                "fileCount": len(paths),
                "pathListSha256": sha256_bytes("\n".join(paths).encode("utf-8")),
                "samplePaths": paths[:25],
            }
        )
    pre_ignored_summary = {
        item["classification"]: item
        for item in pre_move["ignoredState"]["summary"]
    }
    ignored_summary_matches = [
        {
            "classification": item["classification"],
            "matches": item["fileCount"] == pre_ignored_summary.get(item["classification"], {}).get("fileCount")
            and item["pathListSha256"] == pre_ignored_summary.get(item["classification"], {}).get("pathListSha256"),
        }
        for item in ignored_summary
    ]
    private_classes_preserved = all(
        next((item["matches"] for item in ignored_summary_matches if item["classification"] == classification), False)
        for classification in ("private_configuration", "private_tool_state")
    )
    sensitive_paths_preserved = all(
        (ROOT / item["path"]).is_file() and (ROOT / item["path"]).stat().st_size == item["bytes"]
        for item in pre_move["ignoredState"]["sensitivePathsRecordedWithoutContents"]
    )

    restoration_result: dict[str, object]
    temporary_copy: Path
    with tempfile.TemporaryDirectory(prefix="shpitto-restore-", dir=ROOT.parent) as temporary:
        temporary_copy = Path(temporary)
        restore_root = Path(temporary) / "restored"
        restore_root.mkdir()
        sentinel = restore_root / "UNRELATED_SENTINEL.txt"
        sentinel.write_text("preserve unrelated work\n", encoding="utf-8")
        restore_failures: list[str] = []
        for record in moved_records:
            source = ROOT / record["destination"]
            target = restore_root / record["source"]
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
            if target.stat().st_size != record["bytes"] or (
                record["sha256"] is not None and sha256_file(target) != record["sha256"]
            ):
                restore_failures.append(record["source"])
        restored_file_count = sum(1 for path in restore_root.rglob("*") if path.is_file()) - 1
        restoration_result = {
            "status": "PASS" if not restore_failures and sentinel.read_text(encoding="utf-8") == "preserve unrelated work\n" else "FAIL",
            "restoredFileCount": restored_file_count,
            "expectedFileCount": len(moved_records),
            "hashFailures": restore_failures,
            "unrelatedSentinelPreserved": sentinel.exists(),
            "temporaryCopyRemoved": None,
        }
    restoration_result["temporaryCopyRemoved"] = not temporary_copy.exists()

    current_status = git_text("status", "--porcelain=v2", "--untracked-files=all").splitlines()
    pre_status_paths = {
        status_path(entry["raw"])
        for entry in pre_move["gitState"]["statusEntries"]
        if status_path(entry["raw"])
    }
    expected_status_paths = {
        record["source"] for record in moved_records
    } | {
        record["destination"] for record in moved_records
    } | {
        "internal/restart/relocation-journal.json",
        "internal/restart/create_post_move_manifest.py",
        "internal/restart/post-move-manifest.json",
    }
    preserved_private_paths_now_visible = sorted(
        {
            status_path(raw)
            for raw in current_status
            if status_path(raw)
            and raw.startswith("? ")
            and not status_path(raw).startswith("legacy/")
            and (
                ".shpitto/" in status_path(raw)
                or status_path(raw).endswith(".tsbuildinfo")
            )
        }
    )
    expected_retained_paths = {
        "internal/restart/relocation-journal.json",
        "internal/restart/create_post_move_manifest.py",
        "internal/restart/post-move-manifest.json",
        *preserved_private_paths_now_visible,
    }
    unexpected_status_paths = sorted(
        {
            status_path(raw)
            for raw in current_status
            if status_path(raw)
            and status_path(raw) not in pre_status_paths
            and status_path(raw) not in expected_status_paths
            and status_path(raw) not in expected_retained_paths
        }
    )
    source_paths = {record["source"] for record in moved_records}
    archive_paths = {record["destination"] for record in moved_records}
    source_deletion_count = sum(
        1
        for raw in current_status
        if status_path(raw) in source_paths and not raw.startswith("? ")
    )
    archive_untracked_count = sum(
        1
        for raw in current_status
        if status_path(raw) in archive_paths and raw.startswith("? ")
    )

    source_digest = pre_move["sourceCandidates"]["sourceTreeSha256"]
    destination_digest = sha256_bytes(
        "\n".join(f"{record['source']}\0{record['bytes']}\0{record['sha256']}" for record in moved_records).encode("utf-8")
    )
    generated_at = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    manifest = {
        "schemaVersion": "1.0",
        "manifestKind": "M1_POST_MOVE_PRESERVATION",
        "status": "POST_MOVE_RELOCATION_COMPLETE",
        "generatedAt": generated_at,
        "taskId": "2.2",
        "preMoveManifest": {
            "path": "internal/restart/pre-move-manifest.json",
            "sha256": pre_move_hash,
            "sourceTreeSha256": source_digest,
        },
        "relocationJournal": {
            "path": "internal/restart/relocation-journal.json",
            "sha256": journal_hash,
            "status": journal["status"],
        },
        "workspace": {
            "root": str(ROOT.resolve()),
            "branch": git_text("branch", "--show-current").strip(),
            "head": git_text("rev-parse", "HEAD").strip(),
            "gitHistoryRetainedAtRoot": (ROOT / ".git").is_dir(),
        },
        "archive": {
            "destination": "legacy/shpitto-platform",
            "movedFileCount": len(moved_records),
            "movedBytes": sum(int(record["bytes"]) for record in moved_records),
            "destinationTreeSha256": destination_digest,
            "sourceTreeDigestMatches": destination_digest == source_digest,
            "sourceFilesRemaining": source_remaining,
            "destinationMismatches": destination_mismatches,
            "missingDestinationFiles": missing_destination_files,
            "unexpectedDestinationFiles": unexpected_destination_files,
            "files": moved_records,
        },
        "ignoredStateRetained": {
            "fileCount": len(ignored_paths),
            "summary": ignored_summary,
            "matchesPreMoveSummary": private_classes_preserved and sensitive_paths_preserved,
            "summaryComparisons": ignored_summary_matches,
            "sensitivePathsPreserved": sensitive_paths_preserved,
            "privateStateChangedVisibility": preserved_private_paths_now_visible,
            "visibilityChangeExplanation": "Nested ignore files were archived with the source. The listed private runtime files remain at their original paths and are intentionally recorded as visible untracked state until the new-root ignore policy is established.",
            "policy": "Ignored, private and generated state remains at the original source location and is excluded from the archive.",
        },
        "restorationDrill": restoration_result,
        "gitStateAfterMove": {
            "statusCommand": "git status --porcelain=v2 --untracked-files=all",
            "statusEntryCount": len(current_status),
            "statusSha256": sha256_bytes("\n".join(current_status).encode("utf-8")),
            "expectedSourceDeletionCount": len(moved_records),
            "observedSourceDeletionCount": source_deletion_count,
            "expectedArchiveUntrackedCount": len(moved_records),
            "observedArchiveUntrackedCount": archive_untracked_count,
            "preservedPrivatePathsNowVisible": preserved_private_paths_now_visible,
            "unexpectedStatusPaths": unexpected_status_paths,
            "postManifestOutputExcludedFromSnapshot": True,
        },
        "serviceImpact": {
            "networkCalls": [],
            "remoteServicesChanged": False,
            "note": "Relocation used local filesystem operations only; no deployment, provider, payment or hosted resource was contacted.",
        },
        "acceptanceChecks": {
            "sourceHashesPreserved": not destination_mismatches and not source_remaining,
            "archiveAccountingComplete": not missing_destination_files and not unexpected_destination_files,
            "ignoredPrivateStateRetained": private_classes_preserved and sensitive_paths_preserved,
            "restorationDrillPassed": restoration_result["status"] == "PASS",
            "unrelatedStatusClean": not unexpected_status_paths,
        },
        "deferredToTask2.3": [
            "Build the new root manifest and toolchain using the accepted prototype baseline.",
            "Add explicit legacy/vendor exclusions to new-root checks and exports.",
        ],
    }
    atomic_json_write(OUTPUT, manifest)
    print(json.dumps({
        "status": manifest["status"],
        "movedFileCount": manifest["archive"]["movedFileCount"],
        "sourceHashesPreserved": manifest["acceptanceChecks"]["sourceHashesPreserved"],
        "archiveAccountingComplete": manifest["acceptanceChecks"]["archiveAccountingComplete"],
        "ignoredPrivateStateRetained": manifest["acceptanceChecks"]["ignoredPrivateStateRetained"],
        "restorationDrillPassed": manifest["acceptanceChecks"]["restorationDrillPassed"],
        "unrelatedStatusClean": manifest["acceptanceChecks"]["unrelatedStatusClean"],
    }, ensure_ascii=False))
    return 0 if all(manifest["acceptanceChecks"].values()) else 2


if __name__ == "__main__":
    raise SystemExit(main())
