"""Create the M1 pre-move preservation manifest without copying private state."""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import subprocess
from collections import defaultdict
from pathlib import Path
from typing import Iterable


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "internal" / "restart" / "pre-move-manifest.json"
CANDIDATES = ("apps", "builder", "packages", "sites")
DESTINATION = Path("legacy") / "shpitto-platform"
PRIVATE_BACKUP = ROOT.parent / "shpitto-private-backups" / "restart-shpitto-m1"
RETAINED_PATHS = (
    ".git",
    "openspec",
    "AGENTS.md",
    "internal/restart",
    "internal/evidence",
    "internal/spikes",
    "docs",
)
SENSITIVE_NAMES = (
    ".env",
    ".env.local",
    ".env.production",
    ".env.development",
    ".env.test",
    ".npmrc",
)
GENERATED_SEGMENTS = {
    ".agent_memory",
    ".cache",
    ".next",
    ".playwright-cli",
    ".tmp",
    ".turbo",
    ".vercel",
    ".wrangler",
    ".shpitto",
    "build",
    "coverage",
    "dist",
    "node_modules",
    "out",
    "test-results",
}
PRIVATE_SEGMENTS = {".env", ".private", ".secrets", "secrets"}
PRIVATE_TOOL_SEGMENTS = {".opencode"}


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


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def rel(path: str | Path) -> str:
    return Path(path).as_posix()


def is_sensitive(path: str) -> bool:
    name = Path(path).name.lower()
    safe_examples = {".env.example", ".env.sample", ".env.template"}
    return name in {item.lower() for item in SENSITIVE_NAMES} or (
        name.startswith(".env.") and name not in safe_examples
    )


def ignored_class(path: str) -> str:
    path_obj = Path(path)
    parts = {part.lower() for part in path_obj.parts}
    name = path_obj.name.lower()
    if parts & PRIVATE_TOOL_SEGMENTS:
        return "private_tool_state"
    if is_sensitive(path) or parts & PRIVATE_SEGMENTS or name.endswith((".key", ".pem", ".secret")):
        return "private_configuration"
    if parts & GENERATED_SEGMENTS or name.endswith((".log", ".pid", ".tsbuildinfo")):
        return "generated_or_runtime"
    return "ignored_authored_candidate"


def file_record(path: str, *, tracked: bool, ignored: bool) -> dict[str, object]:
    file_path = ROOT / Path(path)
    exists = file_path.is_file()
    sensitive = is_sensitive(path)
    record: dict[str, object] = {
        "path": rel(path),
        "tracked": tracked,
        "ignored": ignored,
        "exists": exists,
        "sensitive": sensitive,
    }
    if not exists:
        record.update({"bytes": None, "sha256": None})
        return record
    record["bytes"] = file_path.stat().st_size
    record["sha256"] = None if sensitive else sha256_file(file_path)
    return record


def path_is_within(path: Path, base: Path) -> bool:
    try:
        path.resolve().relative_to(base.resolve())
        return True
    except ValueError:
        return False


def parse_status(raw_lines: Iterable[str]) -> list[dict[str, str]]:
    entries: list[dict[str, str]] = []
    for raw in raw_lines:
        if not raw or raw.startswith("#"):
            continue
        if raw.startswith("? "):
            entries.append({"code": "??", "path": raw[2:], "raw": raw})
            continue
        if raw[0] in "123u":
            fields = raw.split("\t", 1)
            header = fields[0]
            path = fields[1] if len(fields) == 2 else header
            header_fields = header.split(" ", 2)
            code = header_fields[1] if len(header_fields) > 1 else header[0]
            entries.append({"code": code, "path": path, "raw": raw})
            continue
        entries.append({"code": raw[:2], "path": raw[3:] if len(raw) > 3 else "", "raw": raw})
    return entries


def candidate_path(path: str) -> bool:
    normalized = rel(path)
    return any(normalized == item or normalized.startswith(item + "/") for item in CANDIDATES)


def load_inventory_reference() -> dict[str, dict[str, object]]:
    inventory_path = ROOT / "internal" / "restart" / "inventory.json"
    if not inventory_path.exists():
        return {}
    try:
        data = json.loads(inventory_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return {
        item["path"]: item
        for item in data.get("hashedFiles", [])
        if isinstance(item, dict) and isinstance(item.get("path"), str)
    }


def main() -> int:
    generated_at = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    branch = git_text("branch", "--show-current").strip()
    head = git_text("rev-parse", "HEAD").strip()
    status_lines = git_text("status", "--porcelain=v2", "--untracked-files=all").splitlines()
    status_entries = parse_status(status_lines)

    tracked = sorted(set(split_null(git_bytes("ls-files", "-z", "--", *CANDIDATES))))
    untracked = sorted(
        set(split_null(git_bytes("ls-files", "-z", "--others", "--exclude-standard", "--", *CANDIDATES)))
    )
    ignored = sorted(
        set(
            split_null(
                git_bytes("ls-files", "-z", "--others", "-i", "--exclude-standard", "--", *CANDIDATES)
            )
        )
    )

    source_files = [
        file_record(path, tracked=True, ignored=False) for path in tracked
    ] + [
        file_record(path, tracked=False, ignored=False) for path in untracked
    ]
    source_files.sort(key=lambda item: str(item["path"]))
    source_digest_input = "\n".join(
        f"{item['path']}\0{item['bytes']}\0{item['sha256']}" for item in source_files
    ).encode("utf-8")

    ignored_by_class: dict[str, list[str]] = defaultdict(list)
    ignored_bytes: dict[str, int] = defaultdict(int)
    ignored_authored: list[dict[str, object]] = []
    sensitive_paths: list[dict[str, object]] = []
    for path in ignored:
        classification = ignored_class(path)
        ignored_by_class[classification].append(path)
        file_path = ROOT / Path(path)
        size = file_path.stat().st_size if file_path.is_file() else 0
        ignored_bytes[classification] += size
        if classification == "ignored_authored_candidate":
            ignored_authored.append(file_record(path, tracked=False, ignored=True))
        if is_sensitive(path):
            sensitive_paths.append(file_record(path, tracked=False, ignored=True))

    ignored_summary = []
    for classification in sorted(ignored_by_class):
        paths = sorted(ignored_by_class[classification])
        ignored_summary.append(
            {
                "classification": classification,
                "fileCount": len(paths),
                "bytes": ignored_bytes[classification],
                "pathListSha256": sha256_bytes("\n".join(paths).encode("utf-8")),
                "samplePaths": paths[:25],
            }
        )

    candidate_status = [entry for entry in status_entries if candidate_path(entry["path"])]
    inventory_reference = load_inventory_reference()
    current_by_path = {str(item["path"]): item for item in source_files}
    changed_since_inventory: list[str] = []
    added_since_inventory: list[str] = []
    for path, current in current_by_path.items():
        previous = inventory_reference.get(path)
        if previous is None:
            added_since_inventory.append(path)
        elif not current.get("sensitive") and previous.get("sha256") != current.get("sha256"):
            changed_since_inventory.append(path)
    missing_since_inventory = sorted(set(inventory_reference) & {path for path in inventory_reference if candidate_path(path)} - set(current_by_path))

    destination = (ROOT / DESTINATION).resolve()
    root = ROOT.resolve()
    safe_paths = {
        "workspaceRoot": str(root),
        "candidateRoots": {
            item: {
                "absolute": str((ROOT / item).resolve()),
                "withinWorkspace": path_is_within(ROOT / item, root),
            }
            for item in CANDIDATES
        },
        "plannedDestination": {
            "absolute": str(destination),
            "withinWorkspace": path_is_within(destination, root),
            "outsideCandidateRoots": all(not path_is_within(destination, (ROOT / item).resolve()) for item in CANDIDATES),
        },
        "retainedPaths": {
            item: {
                "absolute": str((ROOT / item).resolve()),
                "withinWorkspace": path_is_within(ROOT / item, root),
            }
            for item in RETAINED_PATHS
        },
        "sourceFilesOutsideWorkspace": [
            item["path"] for item in source_files if not path_is_within(ROOT / str(item["path"]), root)
        ],
        "explicitPrivateBackup": {
            "absolute": str(PRIVATE_BACKUP.resolve()),
            "approvedExternalTarget": True,
            "withinWorkspace": path_is_within(PRIVATE_BACKUP, root),
            "createdByThisTask": False,
        },
    }
    safe_paths["passed"] = bool(
        all(item["withinWorkspace"] for item in safe_paths["candidateRoots"].values())
        and all(item["withinWorkspace"] for item in safe_paths["retainedPaths"].values())
        and not safe_paths["sourceFilesOutsideWorkspace"]
        and safe_paths["plannedDestination"]["withinWorkspace"]
        and safe_paths["plannedDestination"]["outsideCandidateRoots"]
        and safe_paths["explicitPrivateBackup"]["approvedExternalTarget"]
    )

    manifest = {
        "schemaVersion": "1.0",
        "manifestKind": "M1_PRE_MOVE_PRESERVATION",
        "status": "PRE_MOVE_SNAPSHOT_CAPTURED",
        "generatedAt": generated_at,
        "taskId": "2.1",
        "workspace": {
            "absoluteRoot": str(root),
            "branch": branch,
            "head": head,
            "gitHistoryRetainedAtRoot": True,
        },
        "sourceCandidates": {
            "paths": list(CANDIDATES),
            "approvedMovePolicy": "Move only tracked and non-ignored untracked source files listed here; do not move ignored/private/generated state.",
            "fileCount": len(source_files),
            "totalBytes": sum(int(item["bytes"] or 0) for item in source_files),
            "sourceTreeSha256": sha256_bytes(source_digest_input),
            "files": source_files,
        },
        "gitState": {
            "statusCommand": "git status --porcelain=v2 --untracked-files=all",
            "statusEntryCount": len(status_entries),
            "statusSha256": sha256_bytes("\n".join(status_lines).encode("utf-8")),
            "statusEntries": status_entries,
            "candidateStatusEntries": candidate_status,
            "candidateStatusClean": len(candidate_status) == 0,
        },
        "ignoredState": {
            "sourceCommand": "git ls-files --others -i --exclude-standard -- apps builder packages sites",
            "fileCount": len(ignored),
            "summary": ignored_summary,
            "authoredIgnoredFiles": ignored_authored,
            "sensitivePathsRecordedWithoutContents": sensitive_paths,
            "policy": "Retain ignored/private state at its recorded location; exclude it from the legacy archive unless separately approved.",
        },
        "approvedRetainedPaths": {
            "explicit": [
                ".git",
                "openspec",
                "AGENTS.md",
                "internal/restart",
                "internal/evidence",
                "internal/spikes",
                "docs",
            ],
            "outsideCandidatePolicy": "All paths outside the four candidate roots remain at the root unless a later task explicitly approves a different destination.",
        },
        "excludedGeneratedPrivatePaths": [
            ".env*",
            "**/.opencode/**",
            "**/.shpitto/**",
            "**/node_modules/**",
            "**/.next/**",
            "**/.tmp/**",
            "**/.agent_memory/**",
            "**/.turbo/**",
            "**/.cache/**",
            "**/.wrangler/**",
            "**/.vercel/**",
            "**/.playwright-cli/**",
            "**/dist/**",
            "**/build/**",
            "**/coverage/**",
            "**/out/**",
            "**/test-results/**",
            "**/*.tsbuildinfo",
            "**/*.log",
        ],
        "destinationPlan": {
            "relative": DESTINATION.as_posix(),
            "absolute": str(destination),
            "exists": destination.exists(),
            "isDirectory": destination.is_dir() if destination.exists() else False,
            "collisionStatus": "REJECT" if destination.exists() else "CLEAR",
            "collisionPolicy": "Reject any destination collision or changed hash; never overwrite unrelated work.",
        },
        "privateBackupPlan": {
            "absolute": str(PRIVATE_BACKUP.resolve()),
            "status": "RECORDED_ONLY",
            "created": False,
            "contents": "No private or secret bytes were copied by task 2.1.",
        },
        "pathSafety": safe_paths,
        "comparisonWithPriorInventory": {
            "reference": "internal/restart/inventory.json",
            "referenceUsedAsOnlyProof": False,
            "changedCandidateFiles": sorted(changed_since_inventory),
            "addedCandidateFiles": sorted(added_since_inventory),
            "missingCandidateFiles": missing_since_inventory,
            "note": "This manifest is a fresh snapshot; the prior inventory is retained only for an additional comparison signal.",
        },
        "preMoveChecks": {
            "candidateNormalGitChanges": len(candidate_status) == 0,
            "destinationCollisionClear": not destination.exists(),
            "pathContainmentPassed": bool(safe_paths["passed"]),
            "unexpectedCandidateMutation": candidate_status,
            "relocationMayProceedAfterReview": len(candidate_status) == 0 and not destination.exists() and bool(safe_paths["passed"]),
        },
        "deferredToTask2.2": [
            "Execute the mapped move with literal safe filesystem operations.",
            "Create post-move hashes and a disposable restoration copy.",
            "Obtain the independent M1 relocation review before closing the gate.",
        ],
    }

    OUTPUT.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "output": rel(OUTPUT),
        "status": manifest["status"],
        "candidateFiles": len(source_files),
        "candidateBytes": manifest["sourceCandidates"]["totalBytes"],
        "ignoredFiles": len(ignored),
        "ignoredAuthoredFiles": len(ignored_authored),
        "candidateStatusEntries": len(candidate_status),
        "destinationCollision": manifest["destinationPlan"]["collisionStatus"],
        "pathSafetyPassed": safe_paths["passed"],
        "relocationMayProceedAfterReview": manifest["preMoveChecks"]["relocationMayProceedAfterReview"],
    }, ensure_ascii=False))
    return 0 if manifest["preMoveChecks"]["relocationMayProceedAfterReview"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
