"""
Migration: give every existing registration a tracking record.

New registrations get one automatically (see app/tracking.py), but applications
created before that change have none, so Internship Tracking showed nothing
while Internship Registrations was full.

Additive and idempotent -- it only inserts rows for applications that have no
tracking record, and never touches an existing one. joining_date is left NULL
for anyone who has not reached 'joined', so the dashboard's "in progress" count
still means what it says.

    python migration_backfill_tracking.py            # report only
    python migration_backfill_tracking.py --apply    # insert the rows
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from app import auth_models as am          # noqa: E402
from app import ops_models as om           # noqa: E402
from app.database import SessionLocal      # noqa: E402


def run_migration(apply: bool) -> int:
    db = SessionLocal()
    try:
        tracked = {
            r[0] for r in db.query(om.InternshipProgress.application_id).all()
        }
        missing = (
            db.query(am.Application)
            .filter(~am.Application.id.in_(tracked) if tracked else True)
            .order_by(am.Application.id)
            .all()
        )

        if not missing:
            print("Every registration already has a tracking record.")
            return 0

        print(f"{len(missing)} registration(s) without a tracking record:\n")
        for a in missing:
            joins = a.status in am.PLACED_STATUSES
            print(f"   application #{a.id}  student={a.student_id}  "
                  f"status={a.status}"
                  f"{'  (already joined -> joining_date will be set)' if joins else ''}")

        if not apply:
            print("\nDry run. Re-run with --apply to insert these rows.")
            return 0

        print("\nApplying...")
        for a in missing:
            internship = a.internship
            row = om.InternshipProgress(
                application_id=a.id,
                # Only a student who actually reached a placed status gets a
                # joining date; the rest are registrations still in the pipeline.
                joining_date=(
                    (a.applied_at.date() if a.applied_at else None)
                    if a.status in am.PLACED_STATUSES else None
                ),
                expected_end_date=internship.end_date if internship else None,
            )
            db.add(row)
            print(f"   OK  tracking record for application #{a.id}")
        db.commit()

        remaining = (
            db.query(am.Application)
            .outerjoin(om.InternshipProgress,
                       om.InternshipProgress.application_id == am.Application.id)
            .filter(om.InternshipProgress.id.is_(None))
            .count()
        )
        print(f"\nDone. Registrations still untracked: {remaining}")
        return 0 if remaining == 0 else 1
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(run_migration("--apply" in sys.argv))
