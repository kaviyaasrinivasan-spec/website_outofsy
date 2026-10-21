# app/backfill.py
"""Give pre-existing student accounts the rows newer code assumes exist.

    python -m app.backfill           # report only
    python -m app.backfill --apply

Students registered before Membership existed have no membership row, which
makes /student/membership 404 for them. Purely additive -- nothing is deleted
or overwritten.
"""
import sys

from . import auth_models as am
from .auth_routes import _generate_member_id
from .database import SessionLocal


def main() -> int:
    apply = "--apply" in sys.argv
    db = SessionLocal()
    try:
        students = db.query(am.User).filter(am.User.role == am.ROLE_STUDENT).all()

        missing_membership = [
            u for u in students
            if not db.query(am.Membership).filter(am.Membership.user_id == u.id).first()
        ]
        missing_profile = [
            u for u in students
            if not db.query(am.StudentProfile).filter(
                am.StudentProfile.user_id == u.id).first()
        ]

        print(f"students: {len(students)}")
        print(f"  missing membership: {len(missing_membership)}")
        print(f"  missing profile:    {len(missing_profile)}")

        if not missing_membership and not missing_profile:
            print("\nNothing to backfill.")
            return 0

        if not apply:
            print("\nDry run. Re-run with --apply to create the missing rows.")
            return 0

        for u in missing_membership:
            db.add(am.Membership(user_id=u.id, member_id=_generate_member_id(db)))
            db.flush()  # so the next generated id sees this one
            print(f"  + membership for user {u.id}")

        for u in missing_profile:
            # Fall back to the email local-part; the student can correct it.
            db.add(am.StudentProfile(user_id=u.id, full_name=u.email.split("@")[0]))
            print(f"  + profile for user {u.id}")

        db.commit()
        print("\nBackfill complete.")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
