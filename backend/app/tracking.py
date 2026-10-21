# app/tracking.py
"""Keeps Internship Tracking in step with Internship Registrations.

A registration and its tracking record are two views of the same internship, so
the tracking row is created together with the application. Previously a row only
appeared when somebody walked an application all the way to 'joined' by hand,
which is why the tracking page stayed empty while registrations came in.
"""
from datetime import date
from typing import Optional

from sqlalchemy.orm import Session

from . import auth_models as am
from . import ops_models as om


def ensure_progress_record(
    db: Session,
    application: am.Application,
    internship: Optional[am.Internship] = None,
) -> om.InternshipProgress:
    """Return the tracking row for an application, creating it if absent.

    Idempotent -- `internship_progress.application_id` is unique and several
    paths call this. Flushes instead of committing so it joins the caller's
    transaction and rolls back with it.

    Pass `internship` when the caller already has it, to save a lazy load.
    """
    existing = (
        db.query(om.InternshipProgress)
        .filter(om.InternshipProgress.application_id == application.id)
        .first()
    )
    if existing:
        return existing

    target = internship if internship is not None else application.internship
    row = om.InternshipProgress(
        application_id=application.id,
        # joining_date stays empty until the student actually joins. It is what
        # the dashboard counts as "currently in progress", so filling it here
        # would report every applicant as a working intern.
        expected_end_date=target.end_date if target else None,
    )
    db.add(row)
    db.flush()
    return row


def mark_joined(
    db: Session,
    application: am.Application,
    internship: Optional[am.Internship] = None,
) -> om.InternshipProgress:
    """Stamp the joining date once an application reaches 'joined'."""
    row = ensure_progress_record(db, application, internship)
    target = internship if internship is not None else application.internship

    if row.joining_date is None:
        row.joining_date = date.today()
    if row.expected_end_date is None and target:
        row.expected_end_date = target.end_date
    return row
