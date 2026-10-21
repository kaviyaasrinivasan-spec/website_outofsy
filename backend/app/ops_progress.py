# app/ops_progress.py
"""Operations portal, sections 8-9: internship progress tracking, mentors,
and certificate management.

Certificates are only issued for applications that actually reached
'completed' -- see generate_certificate. Issuing one for an internship the
student never finished would make every certificate we hand out worthless.
"""
import logging
import secrets
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy import func, nulls_last
from sqlalchemy.orm import Session, joinedload

from . import auth_models as am
from . import ops_models as om
from . import permissions as perm
from .certificate_pdf import render_certificate
from .config import FRONTEND_URL, UPLOAD_DIR
from .database import get_db
from .pagination import PageParams, paginate

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ops", tags=["operations"])
public_router = APIRouter(tags=["public"])

CERT_DIR = UPLOAD_DIR / "certificates"


# ===========================================================================
# MENTORS  (section 4 "assign mentor" + section 10)
# ===========================================================================

class MentorIn(BaseModel):
    full_name: str = Field(min_length=1, max_length=200)
    company_id: Optional[int] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    designation: Optional[str] = None
    is_active: bool = True


@router.get("/mentors", response_model=None)
def list_mentors(
    user: am.User = Depends(perm.require_permission(om.RES_PROGRESS, om.ACT_VIEW)),
    db: Session = Depends(get_db),
    params: PageParams = Depends(),
    company_id: Optional[int] = None,
):
    q = db.query(om.Mentor)
    own = perm.scope_company_id(user)
    if own is not None:
        q = q.filter(om.Mentor.company_id == own)
    elif company_id:
        q = q.filter(om.Mentor.company_id == company_id)

    return paginate(q.order_by(om.Mentor.full_name), params, lambda m: {
        "id": m.id, "full_name": m.full_name, "email": m.email, "phone": m.phone,
        "designation": m.designation, "company_id": m.company_id,
        "is_active": m.is_active, "has_login": m.user_id is not None,
    })


@router.post("/mentors", response_model=None, status_code=201)
def create_mentor(
    payload: MentorIn,
    request: Request,
    user: am.User = Depends(perm.require_permission(om.RES_PROGRESS, om.ACT_ADD)),
    db: Session = Depends(get_db),
):
    own = perm.scope_company_id(user)
    if own is not None:
        payload.company_id = own   # HR can only create mentors for themselves

    row = om.Mentor(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    perm.record_audit(db, user, "created", "mentor", row.id,
                      summary=f"Mentor '{row.full_name}'", request=request)
    return {"status": "ok", "id": row.id}


# ===========================================================================
# 8. INTERNSHIP PROGRESS TRACKING
# ===========================================================================

class ProgressUpdate(BaseModel):
    mentor_id: Optional[int] = None
    joining_date: Optional[date] = None
    expected_end_date: Optional[date] = None
    actual_end_date: Optional[date] = None
    days_present: Optional[int] = Field(default=None, ge=0)
    days_total: Optional[int] = Field(default=None, ge=0)
    tasks_completed: Optional[int] = Field(default=None, ge=0)
    tasks_assigned: Optional[int] = Field(default=None, ge=0)
    performance_score: Optional[float] = Field(default=None, ge=0, le=100)
    mentor_feedback: Optional[str] = None
    final_evaluation: Optional[str] = None


class WeeklyReportIn(BaseModel):
    week_number: int = Field(ge=1, le=104)
    summary: Optional[str] = None
    hours_logged: Optional[int] = Field(default=None, ge=0, le=168)


class MentorCommentIn(BaseModel):
    mentor_comment: str = Field(min_length=1)


def _completion(p: om.InternshipProgress) -> int:
    """Derived, not stored: tasks first, attendance as a fallback."""
    if p.tasks_assigned:
        return min(100, round((p.tasks_completed or 0) / p.tasks_assigned * 100))
    if p.days_total:
        return min(100, round((p.days_present or 0) / p.days_total * 100))
    return 0


def _progress_row(p: om.InternshipProgress, app: am.Application | None = None) -> dict:
    a = app or p.application if hasattr(p, "application") else None
    return {
        "id": p.id,
        "application_id": p.application_id,
        "mentor_id": p.mentor_id,
        "joining_date": p.joining_date,
        "expected_end_date": p.expected_end_date,
        "actual_end_date": p.actual_end_date,
        "days_present": p.days_present, "days_total": p.days_total,
        "attendance_percent": (
            round((p.days_present or 0) / p.days_total * 100) if p.days_total else None
        ),
        "tasks_completed": p.tasks_completed, "tasks_assigned": p.tasks_assigned,
        "completion_percent": _completion(p),
        "performance_score": float(p.performance_score) if p.performance_score is not None else None,
        "mentor_feedback": p.mentor_feedback,
        "final_evaluation": p.final_evaluation,
    }


def _load_progress(db: Session, progress_id: int, user: am.User) -> om.InternshipProgress:
    p = db.query(om.InternshipProgress).filter(
        om.InternshipProgress.id == progress_id
    ).first()
    if not p:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Progress record not found")

    own = perm.scope_company_id(user)
    if own is not None:
        a = db.query(am.Application).options(
            joinedload(am.Application.internship)
        ).filter(am.Application.id == p.application_id).first()
        if not a or not a.internship or a.internship.company_id != own:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your company's intern")
    return p


@router.get("/progress", response_model=None)
def list_progress(
    user: am.User = Depends(perm.require_permission(om.RES_PROGRESS, om.ACT_VIEW)),
    db: Session = Depends(get_db),
    params: PageParams = Depends(),
    company_id: Optional[int] = None,
    mentor_id: Optional[int] = None,
    active_only: bool = False,
):
    q = (
        db.query(om.InternshipProgress, am.Application, am.Internship, am.StudentProfile)
        .join(am.Application, am.Application.id == om.InternshipProgress.application_id)
        .join(am.Internship, am.Internship.id == am.Application.internship_id)
        .outerjoin(am.StudentProfile, am.StudentProfile.user_id == am.Application.student_id)
    )

    own = perm.scope_company_id(user)
    if own is not None:
        q = q.filter(am.Internship.company_id == own)
    elif company_id:
        q = q.filter(am.Internship.company_id == company_id)

    if mentor_id:
        q = q.filter(om.InternshipProgress.mentor_id == mentor_id)
    if active_only:
        q = q.filter(om.InternshipProgress.actual_end_date.is_(None))

    def row(t):
        p, a, i, sp = t
        return {
            **_progress_row(p, a),
            "student": {
                "id": a.student_id,
                "full_name": sp.full_name if sp else None,
                "college_name": sp.college_name if sp else None,
            },
            "internship": {"id": i.id, "title": i.title},
            "application_status": a.status,
        }

    # Interns who have actually joined lead the list; registrations still
    # waiting to join follow, newest first, instead of sorting above everyone
    # on a NULL joining date.
    return paginate(
        q.order_by(
            nulls_last(om.InternshipProgress.joining_date.desc()),
            om.InternshipProgress.id.desc(),
        ),
        params,
        row,
    )


@router.get("/progress/{progress_id}", response_model=None)
def get_progress(
    progress_id: int,
    user: am.User = Depends(perm.require_permission(om.RES_PROGRESS, om.ACT_VIEW)),
    db: Session = Depends(get_db),
):
    p = _load_progress(db, progress_id, user)
    a = (
        db.query(am.Application)
        .options(joinedload(am.Application.internship).joinedload(am.Internship.company),
                 joinedload(am.Application.student).joinedload(am.User.student_profile))
        .filter(am.Application.id == p.application_id).first()
    )
    reports = (
        db.query(om.WeeklyReport)
        .filter(om.WeeklyReport.progress_id == progress_id)
        .order_by(om.WeeklyReport.week_number).all()
    )
    mentor = db.query(om.Mentor).filter(om.Mentor.id == p.mentor_id).first() if p.mentor_id else None
    prof = a.student.student_profile if a and a.student else None

    return {
        **_progress_row(p, a),
        "student": {
            "id": a.student_id if a else None,
            "full_name": prof.full_name if prof else None,
            "email": a.student.email if a and a.student else None,
            "college_name": prof.college_name if prof else None,
        },
        "internship": {
            "id": a.internship.id, "title": a.internship.title,
            "company": a.internship.company.name if a.internship.company else None,
        } if a and a.internship else None,
        "application_status": a.status if a else None,
        "mentor": {"id": mentor.id, "full_name": mentor.full_name,
                   "email": mentor.email} if mentor else None,
        "weekly_reports": [
            {"id": r.id, "week_number": r.week_number, "summary": r.summary,
             "hours_logged": r.hours_logged, "mentor_comment": r.mentor_comment,
             "submitted_at": r.submitted_at}
            for r in reports
        ],
    }


@router.patch("/progress/{progress_id}", response_model=None)
def update_progress(
    progress_id: int,
    payload: ProgressUpdate,
    request: Request,
    user: am.User = Depends(perm.require_permission(om.RES_PROGRESS, om.ACT_EDIT)),
    db: Session = Depends(get_db),
):
    p = _load_progress(db, progress_id, user)
    updates = payload.model_dump(exclude_unset=True)

    # Attendance and task counts must stay internally consistent, or the
    # derived percentages become nonsense.
    present = updates.get("days_present", p.days_present) or 0
    total = updates.get("days_total", p.days_total) or 0
    if total and present > total:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            f"days_present ({present}) cannot exceed days_total ({total})")

    done = updates.get("tasks_completed", p.tasks_completed) or 0
    assigned = updates.get("tasks_assigned", p.tasks_assigned) or 0
    if assigned and done > assigned:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            f"tasks_completed ({done}) cannot exceed tasks_assigned ({assigned})")

    if updates.get("mentor_id"):
        if not db.query(om.Mentor).filter(om.Mentor.id == updates["mentor_id"]).first():
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "That mentor does not exist")

    before = {k: getattr(p, k) for k in updates}
    for k, v in updates.items():
        setattr(p, k, v)
    p.completion_percent = _completion(p)
    db.commit()

    perm.record_audit(db, user, "updated", "progress", progress_id,
                      summary=f"Progress #{progress_id}",
                      changes=perm.diff_changes(before, updates), request=request)
    return {"status": "ok", "completion_percent": p.completion_percent}


@router.post("/progress/{progress_id}/reports", response_model=None, status_code=201)
def add_weekly_report(
    progress_id: int,
    payload: WeeklyReportIn,
    request: Request,
    user: am.User = Depends(perm.require_permission(om.RES_PROGRESS, om.ACT_EDIT)),
    db: Session = Depends(get_db),
):
    p = _load_progress(db, progress_id, user)
    existing = db.query(om.WeeklyReport).filter(
        om.WeeklyReport.progress_id == progress_id,
        om.WeeklyReport.week_number == payload.week_number,
    ).first()
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT,
                            f"Week {payload.week_number} has already been submitted")

    row = om.WeeklyReport(progress_id=progress_id, **payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    perm.record_audit(db, user, "created", "weekly_report", row.id,
                      summary=f"Week {payload.week_number} for progress #{progress_id}",
                      request=request)
    return {"status": "ok", "id": row.id}


@router.patch("/progress/reports/{report_id}", response_model=None)
def comment_on_report(
    report_id: int,
    payload: MentorCommentIn,
    request: Request,
    user: am.User = Depends(perm.require_permission(om.RES_PROGRESS, om.ACT_EDIT)),
    db: Session = Depends(get_db),
):
    r = db.query(om.WeeklyReport).filter(om.WeeklyReport.id == report_id).first()
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Report not found")
    _load_progress(db, r.progress_id, user)   # re-uses the scoping check

    r.mentor_comment = payload.mentor_comment
    db.commit()
    perm.record_audit(db, user, "commented", "weekly_report", report_id,
                      summary=f"Week {r.week_number}", request=request)
    return {"status": "ok"}


@router.post("/progress/{progress_id}/complete", response_model=None)
def complete_internship(
    progress_id: int,
    request: Request,
    final_evaluation: Optional[str] = None,
    performance_score: Optional[float] = Query(None, ge=0, le=100),
    user: am.User = Depends(perm.require_permission(om.RES_PROGRESS, om.ACT_EDIT)),
    db: Session = Depends(get_db),
):
    """Close out an internship and move the application to 'completed'."""
    p = _load_progress(db, progress_id, user)
    a = db.query(am.Application).filter(am.Application.id == p.application_id).first()
    if not a:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Application not found")

    if not am.can_transition(a.status, am.APP_COMPLETED):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Application is '{a.status}' and cannot be completed from there",
        )

    p.actual_end_date = date.today()
    if final_evaluation is not None:
        p.final_evaluation = final_evaluation
    if performance_score is not None:
        p.performance_score = performance_score
    p.completion_percent = _completion(p)
    a.status = am.APP_COMPLETED

    db.add(am.Notification(
        user_id=a.student_id,
        title="Internship completed",
        body="Congratulations on completing your internship. Your certificate "
             "will be available once it has been approved.",
        kind="application", link="/dashboard/applications",
    ))
    db.commit()

    perm.record_audit(db, user, "completed", "progress", progress_id,
                      summary=f"Application #{a.id} completed", request=request)
    return {"status": "ok", "application_status": a.status}


# ===========================================================================
# 9. CERTIFICATE MANAGEMENT
# ===========================================================================

def _new_certificate_number(db: Session) -> str:
    year = date.today().year
    seq = db.query(func.count(om.Certificate.id)).scalar() or 0
    for bump in range(1, 500):
        candidate = f"OOS/{year}/{seq + bump:05d}"
        if not db.query(om.Certificate).filter(
            om.Certificate.certificate_number == candidate
        ).first():
            return candidate
    raise RuntimeError("Could not allocate a certificate number")


def _issue_one(db: Session, application_id: int) -> tuple[Optional[om.Certificate], str]:
    """Create a pending certificate row. Returns (certificate, reason)."""
    a = (
        db.query(am.Application)
        .options(joinedload(am.Application.internship).joinedload(am.Internship.company))
        .filter(am.Application.id == application_id).first()
    )
    if not a:
        return None, "application not found"

    # The core rule: no certificate without a completed internship. Stage 9
    # counts too -- an application already marked 'certificate issued' by hand
    # should still be able to have the actual certificate generated.
    if a.status not in (am.APP_COMPLETED, am.APP_CERTIFICATE_ISSUED):
        return None, f"application is '{a.status}', not 'completed'"
    if a.internship and not a.internship.certificate_available:
        return None, "this internship does not offer a certificate"

    existing = db.query(om.Certificate).filter(
        om.Certificate.application_id == application_id
    ).first()
    if existing:
        return None, f"certificate already exists ({existing.certificate_number})"

    cert = om.Certificate(
        application_id=application_id,
        student_id=a.student_id,
        certificate_number=_new_certificate_number(db),
        verification_code=secrets.token_urlsafe(24),
        status="pending",
    )
    db.add(cert)
    db.flush()
    return cert, "created"


@router.get("/certificates", response_model=None)
def list_certificates(
    user: am.User = Depends(perm.require_permission(om.RES_CERTIFICATES, om.ACT_VIEW)),
    db: Session = Depends(get_db),
    params: PageParams = Depends(),
    status_filter: Optional[str] = Query(None, alias="status"),
):
    q = (
        db.query(om.Certificate, am.Application, am.Internship, am.StudentProfile)
        .join(am.Application, am.Application.id == om.Certificate.application_id)
        .join(am.Internship, am.Internship.id == am.Application.internship_id)
        .outerjoin(am.StudentProfile, am.StudentProfile.user_id == om.Certificate.student_id)
    )
    own = perm.scope_company_id(user)
    if own is not None:
        q = q.filter(am.Internship.company_id == own)
    if status_filter:
        q = q.filter(om.Certificate.status == status_filter)

    def row(t):
        c, a, i, sp = t
        return {
            "id": c.id, "certificate_number": c.certificate_number,
            # The operations screen needs the code to build a verification link
            # and to run the public check without a second lookup.
            "verification_code": c.verification_code,
            "application_id": c.application_id,
            "status": c.status, "issued_on": c.issued_on,
            "file_url": c.file_url, "created_at": c.created_at,
            "student": {"id": c.student_id,
                        "full_name": sp.full_name if sp else None},
            "internship": {"id": i.id, "title": i.title},
        }

    return paginate(q.order_by(om.Certificate.created_at.desc()), params, row)


@router.get("/certificates/eligible", response_model=None)
def eligible_for_certificate(
    user: am.User = Depends(perm.require_permission(om.RES_CERTIFICATES, om.ACT_VIEW)),
    db: Session = Depends(get_db),
    limit: int = Query(200, ge=1, le=200),
):
    """Applications that a certificate can still be issued for.

    Applies the same rules as _issue_one, so the bulk-generate picker can only
    ever offer rows the server will accept. Keeping the rule in one place stops
    the UI from guessing and offering something that can only fail.
    """
    already = db.query(om.Certificate.application_id).subquery()
    q = (
        db.query(am.Application, am.Internship, am.StudentProfile)
        .join(am.Internship, am.Internship.id == am.Application.internship_id)
        .outerjoin(am.StudentProfile, am.StudentProfile.user_id == am.Application.student_id)
        .filter(
            am.Application.status.in_((am.APP_COMPLETED, am.APP_CERTIFICATE_ISSUED)),
            am.Internship.certificate_available.is_(True),
            ~am.Application.id.in_(already),
        )
    )
    own = perm.scope_company_id(user)
    if own is not None:
        q = q.filter(am.Internship.company_id == own)

    rows = q.order_by(am.Application.updated_at.desc()).limit(limit).all()
    return {
        "items": [
            {
                "application_id": a.id,
                "student_name": sp.full_name if sp else None,
                "internship_title": i.title,
                "status": a.status,
            }
            for a, i, sp in rows
        ],
        "count": len(rows),
    }


@router.post("/certificates/generate/{application_id}", response_model=None, status_code=201)
def generate_certificate(
    application_id: int,
    request: Request,
    user: am.User = Depends(perm.require_permission(om.RES_CERTIFICATES, om.ACT_ADD)),
    db: Session = Depends(get_db),
):
    cert, reason = _issue_one(db, application_id)
    if not cert:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Cannot issue: {reason}")
    db.commit()
    db.refresh(cert)
    perm.record_audit(db, user, "created", "certificate", cert.id,
                      summary=cert.certificate_number, request=request)
    return {"status": "ok", "id": cert.id,
            "certificate_number": cert.certificate_number,
            "note": "Created as pending. Approve it to render the PDF."}


@router.post("/certificates/bulk-generate", response_model=None)
def bulk_generate(
    request: Request,
    application_ids: list[int],
    user: am.User = Depends(perm.require_permission(om.RES_CERTIFICATES, om.ACT_ADD)),
    db: Session = Depends(get_db),
):
    if len(application_ids) > 200:
        raise HTTPException(400, "Maximum 200 certificates per batch")

    created, skipped = [], []
    for app_id in application_ids:
        cert, reason = _issue_one(db, app_id)
        if cert:
            created.append({"application_id": app_id,
                            "certificate_number": cert.certificate_number})
        else:
            skipped.append({"application_id": app_id, "reason": reason})
    db.commit()

    perm.record_audit(db, user, "bulk_created", "certificate", None,
                      summary=f"{len(created)} created, {len(skipped)} skipped",
                      request=request)
    return {"status": "ok", "created": created, "skipped": skipped}


@router.post("/certificates/{certificate_id}/approve", response_model=None)
def approve_certificate(
    certificate_id: int,
    request: Request,
    user: am.User = Depends(perm.require_permission(om.RES_CERTIFICATES, om.ACT_APPROVE)),
    db: Session = Depends(get_db),
):
    """Approve and render the PDF."""
    cert = db.query(om.Certificate).filter(om.Certificate.id == certificate_id).first()
    if not cert:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Certificate not found")
    if cert.status == "revoked":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This certificate was revoked")

    a = (
        db.query(am.Application)
        .options(joinedload(am.Application.internship).joinedload(am.Internship.company),
                 joinedload(am.Application.student).joinedload(am.User.student_profile))
        .filter(am.Application.id == cert.application_id).first()
    )
    if not a:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Linked application not found")

    prof = a.student.student_profile if a.student else None
    progress = db.query(om.InternshipProgress).filter(
        om.InternshipProgress.application_id == cert.application_id
    ).first()

    filename = f"{cert.certificate_number.replace('/', '-')}.pdf"
    try:
        render_certificate(
            output_path=CERT_DIR / filename,
            student_name=(prof.full_name if prof else None) or a.student.email,
            internship_title=a.internship.title if a.internship else "Internship",
            company_name=(a.internship.company.name
                          if a.internship and a.internship.company else "Out Of Syllabus"),
            certificate_number=cert.certificate_number,
            verification_url=f"{FRONTEND_URL}/verify/{cert.verification_code}",
            start_date=progress.joining_date if progress else None,
            end_date=progress.actual_end_date if progress else None,
            duration=a.internship.duration if a.internship else None,
            issued_on=date.today(),
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("Certificate render failed for %s", cert.certificate_number)
        raise HTTPException(500, f"Could not render the certificate PDF: {exc}")

    cert.status = "issued"
    cert.file_url = f"/uploads/certificates/{filename}"
    cert.issued_on = date.today()
    cert.approved_by_user_id = user.id
    cert.approved_at = datetime.now(timezone.utc)

    # Stage 9. Issuing the certificate is the last step of the pipeline, so the
    # application moves with it instead of having to be advanced by hand.
    if a.status == am.APP_COMPLETED:
        a.status = am.APP_CERTIFICATE_ISSUED

    db.add(am.Notification(
        user_id=cert.student_id,
        title="Your certificate is ready",
        body=f"Certificate {cert.certificate_number} has been issued. "
             "You can download it from your dashboard.",
        kind="general", link="/dashboard/applications",
    ))
    db.commit()

    perm.record_audit(db, user, "approved", "certificate", certificate_id,
                      summary=cert.certificate_number, request=request)
    return {"status": "ok", "file_url": cert.file_url,
            "verification_url": f"{FRONTEND_URL}/verify/{cert.verification_code}"}


@router.post("/certificates/{certificate_id}/revoke", response_model=None)
def revoke_certificate(
    certificate_id: int,
    request: Request,
    reason: Optional[str] = None,
    user: am.User = Depends(perm.require_permission(om.RES_CERTIFICATES, om.ACT_APPROVE)),
    db: Session = Depends(get_db),
):
    cert = db.query(om.Certificate).filter(om.Certificate.id == certificate_id).first()
    if not cert:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Certificate not found")
    cert.status = "revoked"
    db.commit()
    perm.record_audit(db, user, "revoked", "certificate", certificate_id,
                      summary=f"{cert.certificate_number}: {reason or 'no reason given'}",
                      request=request)
    return {"status": "ok"}


@router.get("/certificates/{certificate_id}/download")
def download_certificate(
    certificate_id: int,
    user: am.User = Depends(perm.require_permission(om.RES_CERTIFICATES, om.ACT_VIEW)),
    db: Session = Depends(get_db),
):
    cert = db.query(om.Certificate).filter(om.Certificate.id == certificate_id).first()
    if not cert or not cert.file_url:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No PDF has been generated yet")
    path = CERT_DIR / cert.file_url.rsplit("/", 1)[-1]
    if not path.exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Certificate file is missing on disk")
    return FileResponse(path, media_type="application/pdf",
                        filename=f"{cert.certificate_number.replace('/', '-')}.pdf")


# ===========================================================================
# PUBLIC CERTIFICATE VERIFICATION  (no auth -- anyone may check)
# ===========================================================================

@public_router.get("/verify/{verification_code}", response_model=None)
def verify_certificate(verification_code: str, db: Session = Depends(get_db)):
    """Public endpoint behind the QR code on every certificate.

    Returns only what an employer needs to confirm authenticity -- no contact
    details, no email address.
    """
    cert = db.query(om.Certificate).filter(
        om.Certificate.verification_code == verification_code
    ).first()
    if not cert:
        return {"valid": False, "reason": "No certificate matches this code."}
    if cert.status == "revoked":
        return {"valid": False, "reason": "This certificate has been revoked.",
                "certificate_number": cert.certificate_number}
    if cert.status != "issued":
        return {"valid": False, "reason": "This certificate has not been issued yet."}

    a = (
        db.query(am.Application)
        .options(joinedload(am.Application.internship).joinedload(am.Internship.company),
                 joinedload(am.Application.student).joinedload(am.User.student_profile))
        .filter(am.Application.id == cert.application_id).first()
    )
    prof = a.student.student_profile if a and a.student else None
    progress = db.query(om.InternshipProgress).filter(
        om.InternshipProgress.application_id == cert.application_id
    ).first()

    return {
        "valid": True,
        "certificate_number": cert.certificate_number,
        "student_name": prof.full_name if prof else None,
        "college_name": prof.college_name if prof else None,
        "internship_title": a.internship.title if a and a.internship else None,
        "company_name": (a.internship.company.name
                         if a and a.internship and a.internship.company else None),
        "start_date": progress.joining_date if progress else None,
        "end_date": progress.actual_end_date if progress else None,
        "issued_on": cert.issued_on,
    }
