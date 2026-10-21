# app/admin_routes.py
"""Admin portal API.

Per the spec, companies, colleges, internships, students, applications and
membership are all managed here rather than on the public site. Every route
sits behind require_admin.
"""
import logging
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy.orm import Session, joinedload

from . import auth_models as am
from . import platform_schemas as ps
from . import security
from .database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    dependencies=[Depends(security.require_admin)],
)


# --- payloads ---------------------------------------------------------------

class CompanyUpsert(BaseModel):
    name: str = Field(min_length=1, max_length=300)
    logo_url: Optional[str] = None
    about: Optional[str] = None
    industry: Optional[str] = None
    website: Optional[str] = None
    location: Optional[str] = None
    contact_person: Optional[str] = None
    contact_email: Optional[EmailStr] = None
    contact_phone: Optional[str] = None
    is_verified: bool = False


class CollegeUpsert(BaseModel):
    name: str = Field(min_length=1, max_length=300)
    logo_url: Optional[str] = None
    about: Optional[str] = None
    location: Optional[str] = None
    courses_offered: Optional[str] = None
    student_count: Optional[int] = None
    website: Optional[str] = None
    contact_person: Optional[str] = None
    contact_email: Optional[EmailStr] = None
    contact_phone: Optional[str] = None
    partnership_status: str = "pending"


class InternshipUpsert(BaseModel):
    company_id: int
    title: str = Field(min_length=1, max_length=300)
    description: Optional[str] = None
    responsibilities: Optional[str] = None
    duration: Optional[str] = None
    work_mode: Optional[str] = None
    location: Optional[str] = None
    stipend: Optional[str] = None
    required_skills: Optional[str] = None
    openings: int = 1
    last_date_to_apply: Optional[datetime] = None
    status: str = am.INTERNSHIP_DRAFT
    is_featured: bool = False

    @field_validator("work_mode")
    @classmethod
    def valid_mode(cls, v):
        if v not in (None, "") and v not in am.WORK_MODES:
            raise ValueError(f"work_mode must be one of: {', '.join(am.WORK_MODES)}")
        return v

    @field_validator("status")
    @classmethod
    def valid_status(cls, v):
        allowed = (am.INTERNSHIP_DRAFT, am.INTERNSHIP_ACTIVE, am.INTERNSHIP_CLOSED)
        if v not in allowed:
            raise ValueError(f"status must be one of: {', '.join(allowed)}")
        return v


class ApplicationStatusUpdate(BaseModel):
    status: str
    admin_notes: Optional[str] = None

    @field_validator("status")
    @classmethod
    def valid_status(cls, v):
        if v not in am.APPLICATION_STATUSES:
            raise ValueError(f"status must be one of: {', '.join(am.APPLICATION_STATUSES)}")
        return v


class SuccessStoryUpsert(BaseModel):
    student_name: str = Field(min_length=1, max_length=200)
    college_name: Optional[str] = None
    company_name: Optional[str] = None
    role: Optional[str] = None
    quote: str = Field(min_length=1)
    photo_url: Optional[str] = None
    is_published: bool = False
    display_order: int = 0


# --- companies --------------------------------------------------------------

@router.get("/companies", response_model=None)
def list_companies(db: Session = Depends(get_db)):
    rows = db.query(am.Company).order_by(am.Company.name).all()
    return [
        {
            "id": c.id, "name": c.name, "industry": c.industry, "location": c.location,
            "website": c.website, "logo_url": c.logo_url, "is_verified": c.is_verified,
            "contact_email": c.contact_email,
            "internship_count": len(c.internships),
            "created_at": c.created_at,
        }
        for c in rows
    ]


@router.post("/companies", response_model=None, status_code=201)
def create_company(payload: CompanyUpsert, db: Session = Depends(get_db)):
    row = am.Company(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"status": "ok", "id": row.id}


@router.patch("/companies/{company_id}", response_model=None)
def update_company(company_id: int, payload: CompanyUpsert, db: Session = Depends(get_db)):
    row = db.query(am.Company).filter(am.Company.id == company_id).first()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Company not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(row, k, v)
    db.commit()
    return {"status": "ok"}


@router.delete("/companies/{company_id}", response_model=None)
def delete_company(company_id: int, db: Session = Depends(get_db)):
    row = db.query(am.Company).filter(am.Company.id == company_id).first()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Company not found")
    # Refuse rather than silently cascade-delete live internships and their
    # applications.
    if row.internships:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Cannot delete: {len(row.internships)} internship(s) belong to this company. "
            "Close or reassign them first.",
        )
    db.delete(row)
    db.commit()
    return {"status": "ok"}


# --- colleges ---------------------------------------------------------------

@router.get("/colleges", response_model=None)
def list_colleges(db: Session = Depends(get_db)):
    return db.query(am.College).order_by(am.College.name).all()


@router.post("/colleges", response_model=None, status_code=201)
def create_college(payload: CollegeUpsert, db: Session = Depends(get_db)):
    row = am.College(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"status": "ok", "id": row.id}


@router.patch("/colleges/{college_id}", response_model=None)
def update_college(college_id: int, payload: CollegeUpsert, db: Session = Depends(get_db)):
    row = db.query(am.College).filter(am.College.id == college_id).first()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "College not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(row, k, v)
    db.commit()
    return {"status": "ok"}


@router.delete("/colleges/{college_id}", response_model=None)
def delete_college(college_id: int, db: Session = Depends(get_db)):
    row = db.query(am.College).filter(am.College.id == college_id).first()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "College not found")
    db.delete(row)
    db.commit()
    return {"status": "ok"}


# --- internships ------------------------------------------------------------

@router.get("/internships", response_model=None)
def admin_list_internships(
    db: Session = Depends(get_db),
    status_filter: Optional[str] = Query(None, alias="status"),
):
    q = db.query(am.Internship).options(joinedload(am.Internship.company))
    if status_filter:
        q = q.filter(am.Internship.status == status_filter)
    rows = q.order_by(am.Internship.created_at.desc()).all()
    return [
        {
            "id": i.id, "title": i.title,
            "company": {"id": i.company.id, "name": i.company.name} if i.company else None,
            "duration": i.duration, "work_mode": i.work_mode, "stipend": i.stipend,
            "status": i.status, "is_featured": i.is_featured,
            "openings": i.openings, "last_date_to_apply": i.last_date_to_apply,
            "application_count": len(i.applications),
            "created_at": i.created_at,
        }
        for i in rows
    ]


@router.post("/internships", response_model=None, status_code=201)
def create_internship(payload: InternshipUpsert, db: Session = Depends(get_db)):
    if not db.query(am.Company).filter(am.Company.id == payload.company_id).first():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "That company does not exist")
    row = am.Internship(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"status": "ok", "id": row.id}


@router.patch("/internships/{internship_id}", response_model=None)
def update_internship(internship_id: int, payload: InternshipUpsert,
                      db: Session = Depends(get_db)):
    row = db.query(am.Internship).filter(am.Internship.id == internship_id).first()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Internship not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(row, k, v)
    db.commit()
    return {"status": "ok"}


@router.delete("/internships/{internship_id}", response_model=None)
def delete_internship(internship_id: int, db: Session = Depends(get_db)):
    row = db.query(am.Internship).filter(am.Internship.id == internship_id).first()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Internship not found")
    if row.applications:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Cannot delete: {len(row.applications)} student application(s) exist. "
            "Set the status to 'closed' instead.",
        )
    db.delete(row)
    db.commit()
    return {"status": "ok"}


# --- students & applications ------------------------------------------------

@router.get("/students", response_model=None)
def list_students(db: Session = Depends(get_db), search: Optional[str] = None):
    q = (
        db.query(am.User, am.StudentProfile, am.Membership)
        .outerjoin(am.StudentProfile, am.StudentProfile.user_id == am.User.id)
        .outerjoin(am.Membership, am.Membership.user_id == am.User.id)
        .filter(am.User.role == am.ROLE_STUDENT)
    )
    if search:
        term = f"%{search.strip()}%"
        q = q.filter(am.User.email.ilike(term) | am.StudentProfile.full_name.ilike(term))

    return [
        {
            "id": u.id, "email": u.email, "status": u.status,
            "full_name": p.full_name if p else None,
            "college_name": p.college_name if p else None,
            "course": p.course if p else None,
            "current_year": p.current_year if p else None,
            "member_id": m.member_id if m else None,
            "created_at": u.created_at,
        }
        for u, p, m in q.order_by(am.User.created_at.desc()).all()
    ]


@router.post("/students/{user_id}/suspend", response_model=None)
def set_student_status(user_id: int, suspend: bool = True, db: Session = Depends(get_db)):
    u = db.query(am.User).filter(
        am.User.id == user_id, am.User.role == am.ROLE_STUDENT
    ).first()
    if not u:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Student not found")
    u.status = am.STATUS_SUSPENDED if suspend else am.STATUS_ACTIVE
    if suspend:
        # Suspension must take effect immediately, not at cookie expiry.
        db.query(am.UserSession).filter(
            am.UserSession.user_id == u.id,
            am.UserSession.revoked_at.is_(None),
        ).update({am.UserSession.revoked_at: datetime.utcnow()})
    db.commit()
    return {"status": "ok", "new_status": u.status}


@router.get("/applications", response_model=None)
def list_applications(
    db: Session = Depends(get_db),
    internship_id: Optional[int] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
):
    q = (
        db.query(am.Application)
        .options(
            joinedload(am.Application.internship).joinedload(am.Internship.company),
            joinedload(am.Application.student).joinedload(am.User.student_profile),
        )
    )
    if internship_id:
        q = q.filter(am.Application.internship_id == internship_id)
    if status_filter:
        q = q.filter(am.Application.status == status_filter)

    rows = q.order_by(am.Application.applied_at.desc()).all()
    return [
        {
            "id": a.id, "status": a.status, "applied_at": a.applied_at,
            "cover_note": a.cover_note, "resume_url": a.resume_url,
            "admin_notes": a.admin_notes,
            "student": {
                "id": a.student.id,
                "email": a.student.email,
                "full_name": a.student.student_profile.full_name
                             if a.student.student_profile else None,
                "college_name": a.student.student_profile.college_name
                                if a.student.student_profile else None,
            } if a.student else None,
            "internship": {
                "id": a.internship.id,
                "title": a.internship.title,
                "company": a.internship.company.name if a.internship.company else None,
            } if a.internship else None,
        }
        for a in rows
    ]


@router.patch("/applications/{application_id}", response_model=None)
def update_application_status(
    application_id: int,
    payload: ApplicationStatusUpdate,
    db: Session = Depends(get_db),
):
    row = (
        db.query(am.Application)
        .options(joinedload(am.Application.internship).joinedload(am.Internship.company))
        .filter(am.Application.id == application_id)
        .first()
    )
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Application not found")

    previous = row.status
    row.status = payload.status
    if payload.admin_notes is not None:
        row.admin_notes = payload.admin_notes

    # Tell the student when their status actually changes.
    if previous != payload.status:
        title = row.internship.title if row.internship else "your internship"
        company = (
            row.internship.company.name
            if row.internship and row.internship.company else "the company"
        )
        db.add(am.Notification(
            user_id=row.student_id,
            title=f"Application update: {payload.status.replace('_', ' ').title()}",
            body=f"Your application for {title} at {company} is now "
                 f"'{payload.status.replace('_', ' ')}'.",
            kind="application",
            link="/dashboard/applications",
        ))

    db.commit()
    return {"status": "ok", "new_status": row.status}


# --- success stories & contact messages -------------------------------------

@router.get("/success-stories", response_model=None)
def admin_success_stories(db: Session = Depends(get_db)):
    return db.query(am.SuccessStory).order_by(am.SuccessStory.display_order).all()


@router.post("/success-stories", response_model=None, status_code=201)
def create_success_story(payload: SuccessStoryUpsert, db: Session = Depends(get_db)):
    row = am.SuccessStory(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"status": "ok", "id": row.id}


@router.delete("/success-stories/{story_id}", response_model=None)
def delete_success_story(story_id: int, db: Session = Depends(get_db)):
    row = db.query(am.SuccessStory).filter(am.SuccessStory.id == story_id).first()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Story not found")
    db.delete(row)
    db.commit()
    return {"status": "ok"}


@router.get("/contact-messages", response_model=None)
def contact_messages(db: Session = Depends(get_db)):
    return (
        db.query(am.ContactMessage)
        .order_by(am.ContactMessage.created_at.desc())
        .limit(200)
        .all()
    )


# --- reports ----------------------------------------------------------------

@router.get("/reports/summary", response_model=None)
def reports_summary(db: Session = Depends(get_db)):
    by_status = {
        s: db.query(am.Application).filter(am.Application.status == s).count()
        for s in am.APPLICATION_STATUSES
    }
    return {
        "students": db.query(am.User).filter(am.User.role == am.ROLE_STUDENT).count(),
        "companies": db.query(am.Company).count(),
        "colleges": db.query(am.College).count(),
        "internships": {
            "total": db.query(am.Internship).count(),
            "active": db.query(am.Internship)
                .filter(am.Internship.status == am.INTERNSHIP_ACTIVE).count(),
        },
        "applications": {"total": sum(by_status.values()), "by_status": by_status},
        "unhandled_contact_messages": db.query(am.ContactMessage)
            .filter(am.ContactMessage.is_handled.is_(False)).count(),
    }
