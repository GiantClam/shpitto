"""Move only the approved legacy source files after strict preflight checks."""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
PRE_MOVE = ROOT / "internal" / "restart" / "pre-move-manifest.json"
JOURNAL = ROOT / "internal" / "restart" / "relocation-journal.json"
DESTINATION = ROOT / "legacy" / "shpitto-platform"
CANDIDATE_ROOTS = ("apps", "builder", "packages", "sites")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def git_text(*args: str) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=ROOT,
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
    )
    return result.stdout.decode("utf-8", errors="replace")


def path_within(path: Path, parent: Path) -> bool:
    try:
        path.resolve().relative_to(parent.resolve())
        return True
    except ValueError:
        return False


def file_matches(path: Path, record: dict[str, object]) -> bool:
    if not path.is_file() or path.stat().st_size != record["bytes"]:
        return False
    expected_hash = record.get("sha256")
    return expected_hash is None or sha256_file(path) == expected_hash


def atomic_json_write(path: Path, value: dict[str, object]) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def main() -> int:
    if not PRE_MOVE.is_file():
        raise SystemExit("pre-move manifest is missing")
    if JOURNAL.exists():
        raise SystemExit("relocation journal already exists; refusing to rerun")

    manifest = json.loads(PRE_MOVE.read_text(encoding="utf-8"))
    if manifest.get("status") != "PRE_MOVE_SNAPSHOT_CAPTURED":
        raise SystemExit("pre-move manifest is not an active snapshot")

    branch = git_text("branch", "--show-current").strip()
    head = git_text("rev-parse", "HEAD").strip()
    current_status = git_text("status", "--porcelain=v2", "--untracked-files=all").splitlines()
    current_status_sha = sha256_bytes("\n".join(current_status).encode("utf-8"))
    expected_status_sha = manifest["gitState"]["statusSha256"]
    if branch != manifest["workspace"]["branch"] or head != manifest["workspace"]["head"]:
        raise SystemExit("branch or HEAD changed after the pre-move snapshot")
    if len(current_status) != manifest["gitState"]["statusEntryCount"] or current_status_sha != expected_status_sha:
        raise SystemExit("working-tree status changed after the pre-move snapshot")
    if DESTINATION.exists():
        raise SystemExit("legacy destination collision detected")

    records = manifest["sourceCandidates"]["files"]
    if len({record["path"] for record in records}) != len(records):
        raise SystemExit("pre-move manifest contains duplicate source paths")

    root = ROOT.resolve()
    destination = DESTINATION.resolve()
    preflight_failures: list[str] = []
    for record in records:
        relative = Path(record["path"])
        if not any(relative == Path(item) or item in relative.parts[:1] for item in CANDIDATE_ROOTS):
            preflight_failures.append(f"outside-candidate:{record['path']}")
            continue
        source = ROOT / relative
        target = DESTINATION / relative
        if not path_within(source, root) or not path_within(target, destination):
            preflight_failures.append(f"path-containment:{record['path']}")
        elif not file_matches(source, record):
            preflight_failures.append(f"source-mismatch:{record['path']}")
        elif target.exists():
            preflight_failures.append(f"destination-collision:{record['path']}")
    if preflight_failures:
        raise SystemExit("preflight failed: " + ", ".join(preflight_failures[:20]))

    manifest_hash = sha256_file(PRE_MOVE)
    now = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    journal_records = [
        {
            "source": record["path"],
            "destination": (Path("legacy") / "shpitto-platform" / record["path"]).as_posix(),
            "bytes": record["bytes"],
            "sha256": record["sha256"],
        }
        for record in records
    ]
    journal: dict[str, object] = {
        "schemaVersion": "1.0",
        "journalKind": "M1_LEGACY_RELOCATION",
        "status": "PREPARED",
        "createdAt": now,
        "preMoveManifest": "internal/restart/pre-move-manifest.json",
        "preMoveManifestSha256": manifest_hash,
        "branch": branch,
        "head": head,
        "sourceRoots": list(CANDIDATE_ROOTS),
        "destination": "legacy/shpitto-platform",
        "moveCount": len(journal_records),
        "records": journal_records,
    }
    atomic_json_write(JOURNAL, journal)

    moved: list[tuple[Path, Path]] = []
    try:
        DESTINATION.mkdir(parents=True, exist_ok=False)
        journal["status"] = "IN_PROGRESS"
        journal["startedAt"] = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
        atomic_json_write(JOURNAL, journal)
        for record in records:
            source = ROOT / Path(record["path"])
            target = DESTINATION / Path(record["path"])
            target.parent.mkdir(parents=True, exist_ok=True)
            source.rename(target)
            moved.append((source, target))
            if not file_matches(target, record):
                raise RuntimeError(f"post-move hash mismatch: {record['path']}")
    except Exception as error:
        rollback_errors: list[str] = []
        for source, target in reversed(moved):
            try:
                source.parent.mkdir(parents=True, exist_ok=True)
                if source.exists() or not target.exists():
                    raise RuntimeError("rollback source exists or destination is missing")
                target.rename(source)
            except Exception as rollback_error:  # pragma: no cover - emergency path
                rollback_errors.append(f"{target}: {rollback_error}")
        if not rollback_errors:
            for directory in sorted((path for path in DESTINATION.rglob("*") if path.is_dir()), reverse=True):
                try:
                    directory.rmdir()
                except OSError:
                    pass
            try:
                DESTINATION.rmdir()
            except OSError:
                pass
        journal["status"] = "ROLLED_BACK" if not rollback_errors else "ROLLBACK_INCOMPLETE"
        journal["error"] = str(error)
        journal["rolledBackCount"] = len(moved) - len(rollback_errors)
        journal["rollbackErrors"] = rollback_errors
        journal["finishedAt"] = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
        atomic_json_write(JOURNAL, journal)
        raise

    journal["status"] = "COMPLETED"
    journal["completedAt"] = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    journal["completedCount"] = len(moved)
    atomic_json_write(JOURNAL, journal)
    print(json.dumps({
        "status": journal["status"],
        "moveCount": len(moved),
        "destination": str(DESTINATION),
        "preMoveManifestSha256": manifest_hash,
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    main()
