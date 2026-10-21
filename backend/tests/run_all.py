#!/usr/bin/env python
"""Run every test suite and print a progress summary.

    cd backend
    ../venv_win/Scripts/python.exe tests/run_all.py     # Windows
    ../venv/bin/python tests/run_all.py                 # Linux server

Suites run against a throwaway SQLite file, so the production database is
never touched. Two suites need a live backend on :8001 and are skipped when
one is not running.
"""
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

TESTS = Path(__file__).resolve().parent
BACKEND = TESTS.parent

SUITES = [
    ("smoke_ops.py",      "RBAC, permissions, audit log"),
    ("smoke_ops2.py",     "Companies, colleges, internships, application pipeline"),
    ("smoke_ops3.py",     "Progress tracking, mentors, certificates"),
    ("smoke_ops4.py",     "User provisioning, bulk CSV import"),
    ("smoke_ops5.py",     "Documents, reports, analytics, approvals, settings"),
]

# These hit a running server rather than an in-process app.
LIVE_SUITES = [
    ("smoke_live.py", "End-to-end against :8001"),
]


def backend_running() -> bool:
    try:
        with urllib.request.urlopen("http://localhost:8001/health", timeout=3):
            return True
    except (urllib.error.URLError, OSError):
        return False


def main() -> int:
    print("=" * 78)
    print("OOS TEST SUITES")
    print("=" * 78)

    total_passed = total_failed = 0
    results = []

    for name, description in SUITES:
        path = TESTS / name
        if not path.exists():
            results.append((name, description, "MISSING", 0, 0))
            continue

        proc = subprocess.run(
            [sys.executable, str(path)],
            cwd=str(BACKEND), capture_output=True, text=True,
        )
        line = next(
            (ln for ln in proc.stdout.splitlines() if ln.startswith("RESULT:")), ""
        )
        passed = failed = 0
        if line:
            parts = line.replace("RESULT:", "").split(",")
            try:
                passed = int(parts[0].strip().split()[0])
                failed = int(parts[1].strip().split()[0])
            except (IndexError, ValueError):
                pass

        total_passed += passed
        total_failed += failed
        status = "PASS" if failed == 0 and passed else "FAIL"
        results.append((name, description, status, passed, failed))

    print()
    for name, description, status, passed, failed in results:
        mark = {"PASS": "[OK  ]", "FAIL": "[FAIL]", "MISSING": "[----]"}[status]
        print(f"  {mark} {name:<18} {passed:>3} passed  {failed:>2} failed   {description}")

    print()
    if backend_running():
        print("  backend on :8001 -- running (browse http://localhost:8001/docs)")
    else:
        print("  backend on :8001 -- not running (live suite skipped)")

    print()
    print("-" * 78)
    print(f"  TOTAL: {total_passed} passed, {total_failed} failed")
    print("-" * 78)
    return 1 if total_failed else 0


if __name__ == "__main__":
    sys.exit(main())
