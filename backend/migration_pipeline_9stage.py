"""
Migration: move existing applications onto the 9-stage pipeline.

The pipeline was reduced to the nine stages the operations portal tracks, so
four old statuses no longer exist. Any row still holding one would render as a
blank status and could never be advanced, because the transition table has no
entry for it.

Mapping, and why:
    under_review    -> applied               seen but not yet shortlisted; this
                                             deliberately does NOT promote them
    offer_released   -> selected             the offer stage folded into Selected
    joined           -> internship_started   same thing, renamed
    in_progress      -> internship_started   merged into one "started" stage
    dropped          -> rejected             the only remaining exit

Rows mapped to internship_started also get a joining date on their progress
record if they lack one, since stage 7 means the internship has begun.

    python migration_pipeline_9stage.py            # report only
    python migration_pipeline_9stage.py --apply    # rewrite the rows
"""
import os
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(__file__))

from app import auth_models as am          # noqa: E402
from app import ops_models as om           # noqa: E402
from app.database import SessionLocal      # noqa: E402

MAPPING = {
    "under_review": am.APP_APPLIED,
    "offer_released": am.APP_SELECTED,
    "joined": am.APP_STARTED,
    "in_progress": am.APP_STARTED,
    "dropped": am.APP_REJECTED,
}


def run_migration(apply: bool) -> int:
    db = SessionLocal()
    try:
        rows = (
            db.query(am.Application)
            .filter(am.Application.status.in_(list(MAPPING)))
            .order_by(am.Application.id)
            .all()
        )

        if not rows:
            print("No applications are on a retired status -- nothing to do.")
            return 0

        print(f"{len(rows)} application(s) on a retired status:\n")
        for a in rows:
            print(f"   application #{a.id}  {a.status!r} -> {MAPPING[a.status]!r}")

        if not apply:
            print("\nDry run. Re-run with --apply to rewrite these rows.")
            return 0

        print("\nApplying...")
        for a in rows:
            new_status = MAPPING[a.status]
            print(f"   OK  #{a.id}  {a.status} -> {new_status}")
            a.status = new_status

            if new_status == am.APP_STARTED:
                p = (
                    db.query(om.InternshipProgress)
                    .filter(om.InternshipProgress.application_id == a.id)
                    .first()
                )
                if p and p.joining_date is None:
                    p.joining_date = (a.applied_at.date() if a.applied_at else date.today())
                    print(f"       also stamped joining_date={p.joining_date}")
        db.commit()

        left = (
            db.query(am.Application)
            .filter(am.Application.status.notin_(list(am.APPLICATION_STATUSES)))
            .count()
        )
        print(f"\nDone. Applications on an unknown status: {left}")
        return 0 if left == 0 else 1
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(run_migration("--apply" in sys.argv))
