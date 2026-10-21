# app/platform_routes.py
"""Public browsing plus the signed-in student experience."""
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import (
    APIRouter, BackgroundTasks, Depends, File, HTTPException, Query, UploadFile, status,
)
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from . import auth_models as am
from . import platform_schemas as ps
from . import security
from . import tracking
from .config import ALLOWED_DOC_EXTS, MAX_UPLOAD_BYTES, UPLOAD_DIR
from .database import get_db
from .email_utils import send_application_received

logger = logging.getLogger(__name__)

public_router = APIRouter(tags=["public"])
student_router = APIRouter(prefix="/student", tags=["student"],
                           dependencies=[Depends(security.require_student)])


def _split_skills(raw: Optional[str]) -> List[str]:
    if not raw:
        return []
    return [s.strip() for s in raw.split(",") if s.strip()]


def active_application(db: Session, user: Optional[am.User]) -> Optional[am.Application]:
    """The one application a student still has in play, if any.

    A student runs one internship at a time: until the current one is finished
    -- completed, certificate issued -- or has ended in a rejection, they
    cannot start another. ACTIVE_APPLICATION_STATUSES is exactly that set, and
    it includes the two holds, since a paused application is unresolved rather
    than over.
    """
    if not user or user.role != am.ROLE_STUDENT:
        return None
    return (
        db.query(am.Application)
        .options(joinedload(am.Application.internship))
        .filter(
            am.Application.student_id == user.id,
            am.Application.status.in_(am.ACTIVE_APPLICATION_STATUSES),
        )
        .first()
    )


def _to_card(
    internship: am.Internship,
    applied_ids: set[int] | None = None,
    saved_ids: set[int] | None = None,
    blocked: bool = False,
) -> ps.InternshipCard:
    return ps.InternshipCard(
        id=internship.id,
        title=internship.title,
        company=ps.CompanyBrief.model_validate(internship.company) if internship.company else None,
        duration=internship.duration,
        work_mode=internship.work_mode,
        location=internship.location,
        stipend=internship.stipend,
        required_skills=_split_skills(internship.required_skills),
        last_date_to_apply=internship.last_date_to_apply,
        is_featured=internship.is_featured,
        created_at=internship.created_at,
        has_applied=bool(applied_ids and internship.id in applied_ids),
        is_saved=bool(saved_ids and internship.id in saved_ids),
        # Student-level rather than per-listing, but it belongs on the card:
        # it is what decides whether the Apply button is offered.
        has_active_application=blocked,
    )


def _student_context(
    db: Session, user: Optional[am.User],
) -> tuple[set[int], set[int], bool]:
    """Which internships this student has applied to / saved, and whether one
    of those applications is still in play. Empty when anonymous."""
    if not user or user.role != am.ROLE_STUDENT:
        return set(), set(), False
    applied = {
        r[0] for r in db.query(am.Application.internship_id)
        .filter(am.Application.student_id == user.id).all()
    }
    saved = {
        r[0] for r in db.query(am.SavedInternship.internship_id)
        .filter(am.SavedInternship.student_id == user.id).all()
    }
    return applied, saved, active_application(db, user) is not None


# ===========================================================================
# PUBLIC
# ===========================================================================

@public_router.get("/internships", response_model=ps.InternshipListResponse)
def list_internships(
    db: Session = Depends(get_db),
    user: Optional[am.User] = Depends(security.get_current_user_optional),
    search: Optional[str] = None,
    work_mode: Optional[str] = None,
    featured: Optional[bool] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(12, ge=1, le=50),
):
    """Active internships. Visitors may browse; applying requires an account."""
    q = (
        db.query(am.Internship)
        .options(joinedload(am.Internship.company))
        .filter(am.Internship.status == am.INTERNSHIP_ACTIVE)
        # Archived listings are off the public site whatever their status.
        .filter(am.Internship.is_archived.isnot(True))
    )

    if search:
        term = f"%{search.strip()}%"
        q = q.join(am.Company).filter(
            or_(
                am.Internship.title.ilike(term),
                am.Internship.required_skills.ilike(term),
                am.Company.name.ilike(term),
            )
        )
    if work_mode:
        q = q.filter(am.Internship.work_mode == work_mode)
    if featured is not None:
        q = q.filter(am.Internship.is_featured == featured)

    total = q.count()
    rows = (
        q.order_by(am.Internship.is_featured.desc(), am.Internship.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    applied, saved, blocked = _student_context(db, user)
    return ps.InternshipListResponse(
        items=[_to_card(r, applied, saved, blocked) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@public_router.get("/internships/{internship_id}", response_model=ps.InternshipDetail)
def get_internship(
    internship_id: int,
    db: Session = Depends(get_db),
    user: Optional[am.User] = Depends(security.get_current_user_optional),
):
    row = (
        db.query(am.Internship)
        .options(joinedload(am.Internship.company))
        .filter(am.Internship.id == internship_id)
        .first()
    )
    # Drafts, closed and archived listings are not publicly reachable.
    if not row or row.status != am.INTERNSHIP_ACTIVE or row.is_archived is True:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Internship not found")

    applied, saved, blocked = _student_context(db, user)
    card = _to_card(row, applied, saved, blocked)
    return ps.InternshipDetail(
        **card.model_dump(),
        description=row.description,
        responsibilities=row.responsibilities,
        openings=row.openings,
    )


@public_router.get("/success-stories", response_model=List[ps.SuccessStoryResponse])
def success_stories(db: Session = Depends(get_db), limit: int = Query(6, ge=1, le=20)):
    return (
        db.query(am.SuccessStory)
        .filter(am.SuccessStory.is_published.is_(True))
        .order_by(am.SuccessStory.display_order, am.SuccessStory.created_at.desc())
        .limit(limit)
        .all()
    )


@public_router.post("/contact", response_model=ps.MessageResponse, status_code=201)
def submit_contact(payload: ps.ContactMessageCreate, db: Session = Depends(get_db)):
    """Persist contact submissions. The old form showed a success toast and
    threw the message away."""
    db.add(am.ContactMessage(
        name=payload.name,
        email=payload.email,
        subject=payload.subject,
        message=payload.message,
    ))
    db.commit()
    return ps.MessageResponse(
        status="ok",
        message="Thanks for reaching out. We'll get back to you shortly.",
    )


@public_router.get("/meta/options", response_model=None)
def meta_options():
    """Dropdown values, so frontend and backend can't drift apart."""
    return {
        "current_years": ps.CURRENT_YEARS,
        "courses": ps.COURSES,
        "work_modes": list(am.WORK_MODES),
    }


@public_router.get("/stats", response_model=None)
def platform_stats(db: Session = Depends(get_db)):
    """Real counts for the home page -- no invented numbers."""
    return {
        "active_internships": db.query(am.Internship)
            .filter(am.Internship.status == am.INTERNSHIP_ACTIVE)
            .filter(am.Internship.is_archived.isnot(True)).count(),
        # Every company on the books, verified or not, so this matches the
        # "N companies in database" figure the operations portal shows.
        "companies": db.query(am.Company).count(),
        "students": db.query(am.User).filter(am.User.role == am.ROLE_STUDENT).count(),
    }


# ===========================================================================
# STUDENT (auth required)
# ===========================================================================

@student_router.get("/overview", response_model=ps.DashboardOverview)
def dashboard_overview(
    user: am.User = Depends(security.get_current_user),
    db: Session = Depends(get_db),
):
    profile = db.query(am.StudentProfile).filter(am.StudentProfile.user_id == user.id).first()
    membership = db.query(am.Membership).filter(am.Membership.user_id == user.id).first()

    return ps.DashboardOverview(
        active_applications=db.query(am.Application).filter(
            am.Application.student_id == user.id,
            am.Application.status.in_(am.ACTIVE_APPLICATION_STATUSES),
        ).count(),
        total_applications=db.query(am.Application).filter(
            am.Application.student_id == user.id).count(),
        saved_internships=db.query(am.SavedInternship).filter(
            am.SavedInternship.student_id == user.id).count(),
        unread_notifications=db.query(am.Notification).filter(
            am.Notification.user_id == user.id,
            am.Notification.read_at.is_(None),
        ).count(),
        profile_completion=profile.compute_completion() if profile else 0,
        member_id=membership.member_id if membership else None,
    )


@student_router.get("/profile", response_model=ps.StudentProfileResponse)
def get_profile(
    user: am.User = Depends(security.get_current_user),
    db: Session = Depends(get_db),
):
    profile = db.query(am.StudentProfile).filter(am.StudentProfile.user_id == user.id).first()
    if not profile:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Profile not found")
    data = ps.StudentProfileResponse.model_validate(profile)
    data.completion_percent = profile.compute_completion()
    return data


@student_router.patch("/profile", response_model=ps.StudentProfileResponse)
def update_profile(
    payload: ps.StudentProfileUpdate,
    user: am.User = Depends(security.get_current_user),
    db: Session = Depends(get_db),
):
    profile = db.query(am.StudentProfile).filter(am.StudentProfile.user_id == user.id).first()
    if not profile:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Profile not found")

    # exclude_unset so omitted fields are left alone rather than nulled.
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(profile, field, value)
    db.commit()
    db.refresh(profile)

    data = ps.StudentProfileResponse.model_validate(profile)
    data.completion_percent = profile.compute_completion()
    return data


@student_router.post("/resume", response_model=ps.StudentProfileResponse)
async def upload_resume(
    file: UploadFile = File(...),
    user: am.User = Depends(security.get_current_user),
    db: Session = Depends(get_db),
):
    """Store a resume file and point the student's profile at it.

    Documents only -- a resume is not a photo, and the shared image extensions
    would let an avatar through as a CV.

    The previous file is deliberately left on disk: every application snapshots
    the resume URL as it was on the day it was submitted, so deleting the old
    one would break the copy ops sees against past applications.
    """
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_DOC_EXTS:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Resumes must be {', '.join(sorted(ALLOWED_DOC_EXTS))} -- "
            f"'{ext or 'that file type'}' is not accepted.",
        )

    # Read with a cap rather than trusting the client-declared length.
    contents = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"That file is too large (max {MAX_UPLOAD_BYTES // (1024 * 1024)} MB).",
        )
    if not contents:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "That file is empty.")

    profile = db.query(am.StudentProfile).filter(am.StudentProfile.user_id == user.id).first()
    if not profile:
        # A Google signup uploads before 'complete profile' has run, so the row
        # may legitimately not exist yet.
        profile = am.StudentProfile(user_id=user.id, full_name=user.name or "")
        db.add(profile)

    # uuid, not the student's filename: two people uploading "resume.pdf" must
    # not collide, and a crafted name must not escape the upload directory.
    stored_name = f"resume-{user.id}-{uuid.uuid4().hex}{ext}"
    try:
        (UPLOAD_DIR / stored_name).write_bytes(contents)
    except Exception as exc:
        logger.error("Resume upload failed for user %s: %s", user.id, exc)
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR,
                            "Could not save your resume. Please try again.")

    profile.resume_url = f"/uploads/{stored_name}"
    db.commit()
    db.refresh(profile)

    data = ps.StudentProfileResponse.model_validate(profile)
    data.completion_percent = profile.compute_completion()
    return data


@student_router.get("/applications", response_model=List[ps.ApplicationResponse])
def my_applications(
    user: am.User = Depends(security.get_current_user),
    db: Session = Depends(get_db),
    scope: str = Query("all", pattern="^(all|active|history)$"),
):
    q = (
        db.query(am.Application)
        .options(joinedload(am.Application.internship).joinedload(am.Internship.company))
        .filter(am.Application.student_id == user.id)
    )
    if scope == "active":
        q = q.filter(am.Application.status.in_(am.ACTIVE_APPLICATION_STATUSES))
    elif scope == "history":
        q = q.filter(am.Application.status.notin_(am.ACTIVE_APPLICATION_STATUSES))

    rows = q.order_by(am.Application.applied_at.desc()).all()
    return [
        ps.ApplicationResponse(
            id=r.id,
            status=r.status,
            cover_note=r.cover_note,
            applied_at=r.applied_at,
            updated_at=r.updated_at,
            internship=_to_card(r.internship) if r.internship else None,
        )
        for r in rows
    ]


@student_router.post("/applications", response_model=ps.ApplicationResponse, status_code=201)
def apply_to_internship(
    payload: ps.ApplyRequest,
    background_tasks: BackgroundTasks,
    user: am.User = Depends(security.get_current_user),
    db: Session = Depends(get_db),
):
    internship = (
        db.query(am.Internship)
        .options(joinedload(am.Internship.company))
        .filter(am.Internship.id == payload.internship_id)
        .first()
    )
    if (not internship or internship.status != am.INTERNSHIP_ACTIVE
            or internship.is_archived is True):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Internship not found or no longer open")

    if internship.last_date_to_apply:
        deadline = internship.last_date_to_apply
        if deadline.tzinfo is None:                 # SQLite returns naive datetimes
            deadline = deadline.replace(tzinfo=timezone.utc)
        if deadline < datetime.now(timezone.utc):
            raise HTTPException(status.HTTP_400_BAD_REQUEST,
                                "The application deadline for this internship has passed")

    existing = db.query(am.Application).filter(
        am.Application.student_id == user.id,
        am.Application.internship_id == internship.id,
    ).first()
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT,
                            "You have already applied for this internship")

    # One internship at a time. The next application only opens up once the
    # current one has finished, or has ended in a rejection.
    in_play = active_application(db, user)
    if in_play:
        where = in_play.internship.title if in_play.internship else "another internship"
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"You already have an application in progress for {where}. "
            "You can apply for another internship once that one is complete.",
        )

    profile = db.query(am.StudentProfile).filter(am.StudentProfile.user_id == user.id).first()

    application = am.Application(
        student_id=user.id,
        internship_id=internship.id,
        cover_note=payload.cover_note,
        resume_url=profile.resume_url if profile else None,
        status=am.APP_APPLIED,
    )
    db.add(application)
    # flush first: the tracking row needs the application's id.
    db.flush()

    # Every registration shows up in Internship Tracking straight away, rather
    # than only once ops moves it to 'joined'.
    tracking.ensure_progress_record(db, application, internship)

    company_name = internship.company.name if internship.company else "the company"
    db.add(am.Notification(
        user_id=user.id,
        title="Application submitted",
        body=f"Your application for {internship.title} at {company_name} has been received.",
        kind="application",
        link="/dashboard/applications",
    ))
    db.commit()
    db.refresh(application)

    # Confirmation email, in the background: a dead mail server must not slow
    # down or fail a submission the student has already made.
    background_tasks.add_task(
        send_application_received,
        user.email,
        profile.full_name if profile else None,
        internship.title,
        company_name,
    )

    return ps.ApplicationResponse(
        id=application.id,
        status=application.status,
        cover_note=application.cover_note,
        applied_at=application.applied_at,
        updated_at=application.updated_at,
        internship=_to_card(internship),
    )


# Withdrawal was removed: students no longer take themselves out of a pipeline,
# so there is no endpoint for it and the operations portal is the only place an
# application's stage changes. 'withdrawn' survives as a status purely so
# records set before this still read correctly.


@student_router.get("/saved", response_model=List[ps.InternshipCard])
def saved_internships(
    user: am.User = Depends(security.get_current_user),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(am.Internship)
        .options(joinedload(am.Internship.company))
        .join(am.SavedInternship, am.SavedInternship.internship_id == am.Internship.id)
        .filter(am.SavedInternship.student_id == user.id)
        .order_by(am.SavedInternship.created_at.desc())
        .all()
    )
    applied, saved, blocked = _student_context(db, user)
    return [_to_card(r, applied, saved, blocked) for r in rows]


@student_router.post("/saved/{internship_id}", response_model=ps.MessageResponse)
def toggle_saved(
    internship_id: int,
    user: am.User = Depends(security.get_current_user),
    db: Session = Depends(get_db),
):
    """Idempotent toggle -- saves if absent, unsaves if present."""
    internship = db.query(am.Internship).filter(am.Internship.id == internship_id).first()
    if not internship:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Internship not found")

    existing = db.query(am.SavedInternship).filter(
        am.SavedInternship.student_id == user.id,
        am.SavedInternship.internship_id == internship_id,
    ).first()

    if existing:
        db.delete(existing)
        db.commit()
        return ps.MessageResponse(status="ok", message="removed")

    db.add(am.SavedInternship(student_id=user.id, internship_id=internship_id))
    db.commit()
    return ps.MessageResponse(status="ok", message="saved")


@student_router.get("/notifications", response_model=List[ps.NotificationResponse])
def notifications(
    user: am.User = Depends(security.get_current_user),
    db: Session = Depends(get_db),
    limit: int = Query(50, ge=1, le=100),
):
    return (
        db.query(am.Notification)
        .filter(am.Notification.user_id == user.id)
        .order_by(am.Notification.created_at.desc())
        .limit(limit)
        .all()
    )


@student_router.post("/notifications/read", response_model=ps.MessageResponse)
def mark_notifications_read(
    user: am.User = Depends(security.get_current_user),
    db: Session = Depends(get_db),
):
    db.query(am.Notification).filter(
        am.Notification.user_id == user.id,
        am.Notification.read_at.is_(None),
    ).update({am.Notification.read_at: datetime.now(timezone.utc)})
    db.commit()
    return ps.MessageResponse(status="ok", message="All notifications marked as read")


@student_router.get("/membership", response_model=ps.MembershipResponse)
def membership(
    user: am.User = Depends(security.get_current_user),
    db: Session = Depends(get_db),
):
    row = db.query(am.Membership).filter(am.Membership.user_id == user.id).first()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Membership not found")
    return row
