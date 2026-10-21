# app/ops_entities.py
"""Operations portal, sections 2-7:
company, college, internship, student, and application management.

Three rules hold across every endpoint here:
  1. Permission checked via require_permission (what the role may do).
  2. Rows scoped via scope_company_id / scope_college_id (which rows they see).
  3. Mutations written to the audit log.

Permissions alone are not access control -- without scoping, a company_hr with
`internships:view` would see every company's internships.
"""
import logging
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import (
    APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, status,
)
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from . import auth_models as am
from . import ops_models as om
from . import permissions as perm
from . import tracking
from .database import get_db
from .email_utils import send_application_status_change
from .pagination import PageParams, paginate

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ops", tags=["operations"])


# ===========================================================================
# 2. COMPANY MANAGEMENT
# ===========================================================================

class CompanyIn(BaseModel):
    name: str = Field(min_length=1, max_length=300)
    industry: Optional[str] = None
    website: Optional[str] = None
    logo_url: Optional[str] = None
    about: Optional[str] = None
    location: Optional[str] = None
    contact_person: Optional[str] = None
    contact_email: Optional[EmailStr] = None
    contact_phone: Optional[str] = None
    gst_number: Optional[str] = Field(default=None, max_length=30)
    is_verified: bool = False
    is_active: bool = True


def _company_row(c: am.Company) -> dict:
    return {
        "id": c.id, "name": c.name, "industry": c.industry, "website": c.website,
        "logo_url": c.logo_url, "location": c.location,
        "contact_person": c.contact_person, "contact_email": c.contact_email,
        "contact_phone": c.contact_phone, "gst_number": c.gst_number,
        "is_verified": c.is_verified, "is_active": c.is_active,
        "rating": float(c.rating) if c.rating is not None else None,
        "created_at": c.created_at,
    }


@router.get("/companies", response_model=None)
def list_companies(
    user: am.User = Depends(perm.require_permission(om.RES_COMPANIES, om.ACT_VIEW)),
    db: Session = Depends(get_db),
    params: PageParams = Depends(),
    search: Optional[str] = None,
    is_verified: Optional[bool] = None,
    is_active: Optional[bool] = None,
):
    q = db.query(am.Company)

    # Company HR sees only their own record.
    own = perm.scope_company_id(user)
    if own is not None:
        q = q.filter(am.Company.id == own)

    if search:
        term = f"%{search.strip()}%"
        q = q.filter(or_(am.Company.name.ilike(term), am.Company.industry.ilike(term)))
    if is_verified is not None:
        q = q.filter(am.Company.is_verified.is_(is_verified))
    if is_active is not None:
        q = q.filter(am.Company.is_active.is_(is_active))

    return paginate(q.order_by(am.Company.name), params, _company_row)


@router.get("/companies/{company_id}", response_model=None)
def get_company(
    company_id: int,
    user: am.User = Depends(perm.require_permission(om.RES_COMPANIES, om.ACT_VIEW)),
    db: Session = Depends(get_db),
):
    own = perm.scope_company_id(user)
    if own is not None and own != company_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only view your own company")

    c = db.query(am.Company).filter(am.Company.id == company_id).first()
    if not c:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Company not found")

    internships = db.query(am.Internship).filter(am.Internship.company_id == company_id).all()
    intern_ids = [i.id for i in internships]
    hired = 0
    if intern_ids:
        hired = db.query(am.Application).filter(
            am.Application.internship_id.in_(intern_ids),
            am.Application.status.in_(am.PLACED_STATUSES),
        ).count()

    return {
        **_company_row(c),
        "internship_count": len(internships),
        "active_internships": sum(1 for i in internships if i.status == am.INTERNSHIP_ACTIVE),
        "hired_count": hired,
        "hr_users": [
            {"id": u.id, "email": u.email, "status": u.status}
            for u in db.query(am.User).filter(am.User.company_id == company_id).all()
        ],
        "documents": [
            {"id": d.id, "kind": d.kind, "file_url": d.file_url,
             "is_verified": d.is_verified, "created_at": d.created_at}
            for d in db.query(om.Document).filter(
                om.Document.owner_type == "company", om.Document.owner_id == company_id
            ).all()
        ],
    }


@router.post("/companies", response_model=None, status_code=201)
def create_company(
    payload: CompanyIn,
    request: Request,
    user: am.User = Depends(perm.require_permission(om.RES_COMPANIES, om.ACT_ADD)),
    db: Session = Depends(get_db),
):
    if db.query(am.Company).filter(func.lower(am.Company.name) == payload.name.lower()).first():
        raise HTTPException(status.HTTP_409_CONFLICT, f"A company named '{payload.name}' already exists")

    row = am.Company(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    perm.record_audit(db, user, "created", "company", row.id,
                      summary=f"Company '{row.name}'", request=request)
    return {"status": "ok", "id": row.id}


@router.patch("/companies/{company_id}", response_model=None)
def update_company(
    company_id: int,
    payload: CompanyIn,
    request: Request,
    user: am.User = Depends(perm.require_permission(om.RES_COMPANIES, om.ACT_EDIT)),
    db: Session = Depends(get_db),
):
    own = perm.scope_company_id(user)
    if own is not None and own != company_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only edit your own company")

    row = db.query(am.Company).filter(am.Company.id == company_id).first()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Company not found")

    updates = payload.model_dump(exclude_unset=True)
    # Verification is an approval action, not an ordinary field edit.
    if "is_verified" in updates and not perm.has_permission(
        db, user, om.RES_COMPANIES, om.ACT_APPROVE
    ):
        updates.pop("is_verified")

    before = {k: getattr(row, k) for k in updates}
    for k, v in updates.items():
        setattr(row, k, v)
    db.commit()

    perm.record_audit(db, user, "updated", "company", company_id,
                      summary=f"Company '{row.name}'",
                      changes=perm.diff_changes(before, updates), request=request)
    return {"status": "ok"}


@router.post("/companies/{company_id}/verify", response_model=None)
def verify_company(
    company_id: int,
    request: Request,
    approve: bool = True,
    user: am.User = Depends(perm.require_permission(om.RES_COMPANIES, om.ACT_APPROVE)),
    db: Session = Depends(get_db),
):
    row = db.query(am.Company).filter(am.Company.id == company_id).first()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Company not found")
    row.is_verified = approve
    db.commit()
    perm.record_audit(db, user, "approved" if approve else "unapproved", "company",
                      company_id, summary=f"Company '{row.name}'", request=request)
    return {"status": "ok", "is_verified": row.is_verified}


@router.post("/companies/{company_id}/activate", response_model=None)
def activate_company(
    company_id: int,
    request: Request,
    active: bool = True,
    user: am.User = Depends(perm.require_permission(om.RES_COMPANIES, om.ACT_EDIT)),
    db: Session = Depends(get_db),
):
    row = db.query(am.Company).filter(am.Company.id == company_id).first()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Company not found")
    row.is_active = active
    if not active:
        # Deactivating must also pull their live listings, or students keep
        # applying to a company that is no longer trading with us.
        db.query(am.Internship).filter(
            am.Internship.company_id == company_id,
            am.Internship.status == am.INTERNSHIP_ACTIVE,
        ).update({am.Internship.status: am.INTERNSHIP_CLOSED})
    db.commit()
    perm.record_audit(db, user, "activated" if active else "deactivated", "company",
                      company_id, summary=f"Company '{row.name}'", request=request)
    return {"status": "ok", "is_active": row.is_active}


@router.delete("/companies/{company_id}", response_model=None)
def delete_company(
    company_id: int,
    request: Request,
    user: am.User = Depends(perm.require_permission(om.RES_COMPANIES, om.ACT_DELETE)),
    db: Session = Depends(get_db),
):
    row = db.query(am.Company).filter(am.Company.id == company_id).first()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Company not found")
    n = db.query(am.Internship).filter(am.Internship.company_id == company_id).count()
    if n:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Cannot delete: {n} internship(s) belong to this company. Deactivate it instead.",
        )
    name = row.name
    db.delete(row)
    db.commit()
    perm.record_audit(db, user, "deleted", "company", company_id,
                      summary=f"Company '{name}'", request=request)
    return {"status": "ok"}


# ===========================================================================
# 3. COLLEGE MANAGEMENT
# ===========================================================================

class CollegeIn(BaseModel):
    name: str = Field(min_length=1, max_length=300)
    university: Optional[str] = None
    college_code: Optional[str] = Field(default=None, max_length=60)
    location: Optional[str] = None
    website: Optional[str] = None
    logo_url: Optional[str] = None
    about: Optional[str] = None
    courses_offered: Optional[str] = None
    departments: Optional[str] = None
    student_count: Optional[int] = None
    placement_officer: Optional[str] = None
    contact_person: Optional[str] = None
    contact_email: Optional[EmailStr] = None
    contact_phone: Optional[str] = None
    partnership_status: str = "pending"

    @field_validator("partnership_status")
    @classmethod
    def valid_status(cls, v):
        allowed = ("pending", "approved", "suspended")
        if v not in allowed:
            raise ValueError(f"partnership_status must be one of: {', '.join(allowed)}")
        return v


def _college_row(c: am.College) -> dict:
    return {
        "id": c.id, "name": c.name, "university": c.university,
        "college_code": c.college_code, "location": c.location, "website": c.website,
        "logo_url": c.logo_url, "departments": c.departments,
        "student_count": c.student_count, "placement_officer": c.placement_officer,
        "contact_person": c.contact_person, "contact_email": c.contact_email,
        "contact_phone": c.contact_phone,
        "partnership_status": c.partnership_status,
        # A row that predates the column reads as NULL, which is not a bool.
        "is_archived": c.is_archived is True,
        "created_at": c.created_at,
    }


@router.get("/colleges", response_model=None)
def list_colleges(
    user: am.User = Depends(perm.require_permission(om.RES_COLLEGES, om.ACT_VIEW)),
    db: Session = Depends(get_db),
    params: PageParams = Depends(),
    search: Optional[str] = None,
    partnership_status: Optional[str] = None,
):
    q = db.query(am.College)

    own = perm.scope_college_id(user)
    if own is not None:
        q = q.filter(am.College.id == own)

    if search:
        term = f"%{search.strip()}%"
        q = q.filter(or_(am.College.name.ilike(term), am.College.university.ilike(term)))

    # "archived" is a view rather than a partnership status: it filters on the
    # flag and is the only selection that shows archived colleges. `isnot(True)`
    # rather than `is_(False)` so rows predating the column still show up.
    if partnership_status == "archived":
        q = q.filter(am.College.is_archived.is_(True))
    else:
        q = q.filter(am.College.is_archived.isnot(True))
        if partnership_status:
            q = q.filter(am.College.partnership_status == partnership_status)

    return paginate(q.order_by(am.College.name), params, _college_row)


@router.get("/colleges/{college_id}", response_model=None)
def get_college(
    college_id: int,
    user: am.User = Depends(perm.require_permission(om.RES_COLLEGES, om.ACT_VIEW)),
    db: Session = Depends(get_db),
):
    own = perm.scope_college_id(user)
    if own is not None and own != college_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only view your own college")

    c = db.query(am.College).filter(am.College.id == college_id).first()
    if not c:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "College not found")

    # Students are matched by the free-text college name on their profile;
    # there is no FK from student to college yet.
    student_count = db.query(am.StudentProfile).filter(
        am.StudentProfile.college_name == c.name
    ).count()

    return {
        **_college_row(c),
        "registered_students": student_count,
        "coordinators": [
            {"id": u.id, "email": u.email, "status": u.status}
            for u in db.query(am.User).filter(am.User.college_id == college_id).all()
        ],
        "documents": [
            {"id": d.id, "kind": d.kind, "file_url": d.file_url,
             "is_verified": d.is_verified}
            for d in db.query(om.Document).filter(
                om.Document.owner_type == "college", om.Document.owner_id == college_id
            ).all()
        ],
    }


@router.post("/colleges", response_model=None, status_code=201)
def create_college(
    payload: CollegeIn,
    request: Request,
    user: am.User = Depends(perm.require_permission(om.RES_COLLEGES, om.ACT_ADD)),
    db: Session = Depends(get_db),
):
    if db.query(am.College).filter(func.lower(am.College.name) == payload.name.lower()).first():
        raise HTTPException(status.HTTP_409_CONFLICT, f"A college named '{payload.name}' already exists")
    row = am.College(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    perm.record_audit(db, user, "created", "college", row.id,
                      summary=f"College '{row.name}'", request=request)
    return {"status": "ok", "id": row.id}


@router.patch("/colleges/{college_id}", response_model=None)
def update_college(
    college_id: int,
    payload: CollegeIn,
    request: Request,
    user: am.User = Depends(perm.require_permission(om.RES_COLLEGES, om.ACT_EDIT)),
    db: Session = Depends(get_db),
):
    own = perm.scope_college_id(user)
    if own is not None and own != college_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only edit your own college")

    row = db.query(am.College).filter(am.College.id == college_id).first()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "College not found")

    updates = payload.model_dump(exclude_unset=True)
    if "partnership_status" in updates and not perm.has_permission(
        db, user, om.RES_COLLEGES, om.ACT_APPROVE
    ):
        updates.pop("partnership_status")

    before = {k: getattr(row, k) for k in updates}
    for k, v in updates.items():
        setattr(row, k, v)
    db.commit()
    perm.record_audit(db, user, "updated", "college", college_id,
                      summary=f"College '{row.name}'",
                      changes=perm.diff_changes(before, updates), request=request)
    return {"status": "ok"}


@router.post("/colleges/{college_id}/status", response_model=None)
def set_college_status(
    college_id: int,
    request: Request,
    partnership_status: str = Query(..., pattern="^(pending|approved|suspended)$"),
    user: am.User = Depends(perm.require_permission(om.RES_COLLEGES, om.ACT_APPROVE)),
    db: Session = Depends(get_db),
):
    row = db.query(am.College).filter(am.College.id == college_id).first()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "College not found")
    before = row.partnership_status
    row.partnership_status = partnership_status
    db.commit()
    perm.record_audit(db, user, "status_changed", "college", college_id,
                      summary=f"College '{row.name}': {before} -> {partnership_status}",
                      request=request)
    return {"status": "ok", "partnership_status": partnership_status}


@router.post("/colleges/{college_id}/archive", response_model=None)
def set_college_archived(
    college_id: int,
    request: Request,
    archived: bool = Query(True),
    user: am.User = Depends(perm.require_permission(om.RES_COLLEGES, om.ACT_EDIT)),
    db: Session = Depends(get_db),
):
    """Archive a college, or restore one.

    Destroys nothing: the college, its coordinators and its students stay
    exactly as they are, it simply leaves the working list. That makes it the
    safe alternative to delete for a college that is no longer active.
    """
    own = perm.scope_college_id(user)
    if own is not None and own != college_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only archive your own college")

    row = db.query(am.College).filter(am.College.id == college_id).first()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "College not found")

    row.is_archived = archived
    db.commit()

    perm.record_audit(db, user, "archived" if archived else "restored",
                      "college", college_id, summary=f"College '{row.name}'",
                      request=request)
    return {"status": "ok", "is_archived": row.is_archived}


@router.delete("/colleges/{college_id}", response_model=None)
def delete_college(
    college_id: int,
    request: Request,
    user: am.User = Depends(perm.require_permission(om.RES_COLLEGES, om.ACT_DELETE)),
    db: Session = Depends(get_db),
):
    row = db.query(am.College).filter(am.College.id == college_id).first()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "College not found")

    # users.college_id is ON DELETE SET NULL, and a coordinator with a NULL
    # college_id is treated as unscoped -- so deleting the college would quietly
    # widen their access to every college's students. Refuse instead.
    linked = db.query(am.User).filter(am.User.college_id == college_id).count()
    if linked:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Cannot delete: {linked} coordinator account(s) are attached to this "
            "college. Reassign or remove them first, or archive the college "
            "instead -- that hides it and keeps every link intact.",
        )

    name = row.name
    db.delete(row)
    db.commit()
    perm.record_audit(db, user, "deleted", "college", college_id,
                      summary=f"College '{name}'", request=request)
    return {"status": "ok"}


# ===========================================================================
# 4. INTERNSHIP MANAGEMENT
# ===========================================================================

class InternshipIn(BaseModel):
    company_id: int
    title: str = Field(min_length=1, max_length=300)
    department: Optional[str] = None
    description: Optional[str] = None
    responsibilities: Optional[str] = None
    required_skills: Optional[str] = None
    eligibility: Optional[str] = None
    duration: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    work_mode: Optional[str] = None
    location: Optional[str] = None
    openings: int = 1
    stipend: Optional[str] = None
    certificate_available: bool = True
    ppo_available: bool = False
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
        allowed = (am.INTERNSHIP_DRAFT, am.INTERNSHIP_ACTIVE,
                   am.INTERNSHIP_PAUSED, am.INTERNSHIP_CLOSED)
        if v not in allowed:
            raise ValueError(f"status must be one of: {', '.join(allowed)}")
        return v


def _internship_row(i: am.Internship) -> dict:
    return {
        "id": i.id, "title": i.title, "department": i.department,
        "company": {"id": i.company.id, "name": i.company.name} if i.company else None,
        "duration": i.duration, "work_mode": i.work_mode, "location": i.location,
        "stipend": i.stipend, "openings": i.openings,
        "certificate_available": i.certificate_available,
        "ppo_available": i.ppo_available,
        "start_date": i.start_date, "end_date": i.end_date,
        "last_date_to_apply": i.last_date_to_apply,
        "status": i.status, "is_featured": i.is_featured,
        # A row that predates the column reads as NULL, which is not a bool.
        "is_archived": i.is_archived is True,
        "created_at": i.created_at,
    }


@router.get("/internships", response_model=None)
def list_internships(
    user: am.User = Depends(perm.require_permission(om.RES_INTERNSHIPS, om.ACT_VIEW)),
    db: Session = Depends(get_db),
    params: PageParams = Depends(),
    search: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    company_id: Optional[int] = None,
):
    q = db.query(am.Internship).options(joinedload(am.Internship.company))

    own = perm.scope_company_id(user)
    if own is not None:
        q = q.filter(am.Internship.company_id == own)
    elif company_id:
        q = q.filter(am.Internship.company_id == company_id)

    if search:
        q = q.filter(am.Internship.title.ilike(f"%{search.strip()}%"))

    # "archived" is a view, not a status: it filters on the flag and is the only
    # tab that shows archived listings. Every other tab hides them, so the
    # working list stays the set of postings still in play. `isnot(True)` rather
    # than `is_(False)` so rows predating the column count as not archived.
    if status_filter == "archived":
        q = q.filter(am.Internship.is_archived.is_(True))
    else:
        q = q.filter(am.Internship.is_archived.isnot(True))
        if status_filter:
            q = q.filter(am.Internship.status == status_filter)

    result = paginate(q.order_by(am.Internship.created_at.desc()), params, _internship_row)

    # Attach applicant counts for just this page, not the whole table.
    ids = [r["id"] for r in result["items"]]
    if ids:
        counts = dict(
            db.query(am.Application.internship_id, func.count())
            .filter(am.Application.internship_id.in_(ids))
            .group_by(am.Application.internship_id).all()
        )
        for r in result["items"]:
            r["application_count"] = counts.get(r["id"], 0)
    return result


@router.get("/internships/{internship_id}", response_model=None)
def get_internship(
    internship_id: int,
    user: am.User = Depends(perm.require_permission(om.RES_INTERNSHIPS, om.ACT_VIEW)),
    db: Session = Depends(get_db),
):
    """One listing in full, including the long text the list view leaves out.

    The public detail route only serves active listings, so the portal needs its
    own in order to show a draft, closed or archived posting.
    """
    row = (
        db.query(am.Internship)
        .options(joinedload(am.Internship.company))
        .filter(am.Internship.id == internship_id)
        .first()
    )
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Internship not found")

    own = perm.scope_company_id(user)
    if own is not None and row.company_id != own:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your company's internship")

    return {
        **_internship_row(row),
        "description": row.description,
        "responsibilities": row.responsibilities,
        "eligibility": row.eligibility,
        "required_skills": row.required_skills,
        "application_count": db.query(am.Application).filter(
            am.Application.internship_id == internship_id
        ).count(),
    }


@router.post("/internships", response_model=None, status_code=201)
def create_internship(
    payload: InternshipIn,
    request: Request,
    user: am.User = Depends(perm.require_permission(om.RES_INTERNSHIPS, om.ACT_ADD)),
    db: Session = Depends(get_db),
):
    own = perm.scope_company_id(user)
    if own is not None and payload.company_id != own:
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            "You can only create internships for your own company")

    company = db.query(am.Company).filter(am.Company.id == payload.company_id).first()
    if not company:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "That company does not exist")
    if not company.is_active:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            "That company is deactivated and cannot post internships")

    if payload.start_date and payload.end_date and payload.end_date < payload.start_date:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "End date cannot precede start date")

    row = am.Internship(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    perm.record_audit(db, user, "created", "internship", row.id,
                      summary=f"'{row.title}' at {company.name}", request=request)
    return {"status": "ok", "id": row.id}


@router.patch("/internships/{internship_id}", response_model=None)
def update_internship(
    internship_id: int,
    payload: InternshipIn,
    request: Request,
    user: am.User = Depends(perm.require_permission(om.RES_INTERNSHIPS, om.ACT_EDIT)),
    db: Session = Depends(get_db),
):
    row = db.query(am.Internship).filter(am.Internship.id == internship_id).first()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Internship not found")

    own = perm.scope_company_id(user)
    if own is not None and row.company_id != own:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your company's internship")

    updates = payload.model_dump(exclude_unset=True)
    before = {k: getattr(row, k) for k in updates}
    for k, v in updates.items():
        setattr(row, k, v)
    db.commit()
    perm.record_audit(db, user, "updated", "internship", internship_id,
                      summary=f"'{row.title}'",
                      changes=perm.diff_changes(before, updates), request=request)
    return {"status": "ok"}


@router.post("/internships/{internship_id}/clone", response_model=None, status_code=201)
def clone_internship(
    internship_id: int,
    request: Request,
    user: am.User = Depends(perm.require_permission(om.RES_INTERNSHIPS, om.ACT_ADD)),
    db: Session = Depends(get_db),
):
    src = db.query(am.Internship).filter(am.Internship.id == internship_id).first()
    if not src:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Internship not found")

    own = perm.scope_company_id(user)
    if own is not None and src.company_id != own:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your company's internship")

    # Clone the description, never the applicants; always land as a draft so
    # nothing goes live by accident.
    clone = am.Internship(
        company_id=src.company_id, title=f"{src.title} (Copy)",
        department=src.department, description=src.description,
        responsibilities=src.responsibilities, required_skills=src.required_skills,
        eligibility=src.eligibility, duration=src.duration,
        work_mode=src.work_mode, location=src.location, openings=src.openings,
        stipend=src.stipend, certificate_available=src.certificate_available,
        ppo_available=src.ppo_available,
        status=am.INTERNSHIP_DRAFT, is_featured=False,
    )
    db.add(clone)
    db.commit()
    db.refresh(clone)
    perm.record_audit(db, user, "cloned", "internship", clone.id,
                      summary=f"Cloned #{internship_id} -> #{clone.id}", request=request)
    return {"status": "ok", "id": clone.id}


@router.post("/internships/{internship_id}/status", response_model=None)
def set_internship_status(
    internship_id: int,
    request: Request,
    new_status: str = Query(..., alias="status", pattern="^(draft|active|paused|closed)$"),
    user: am.User = Depends(perm.require_permission(om.RES_INTERNSHIPS, om.ACT_EDIT)),
    db: Session = Depends(get_db),
):
    row = db.query(am.Internship).filter(am.Internship.id == internship_id).first()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Internship not found")

    own = perm.scope_company_id(user)
    if own is not None and row.company_id != own:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your company's internship")

    # Publishing is an approval step, so an executive cannot push a listing
    # live to students without sign-off.
    if new_status == am.INTERNSHIP_ACTIVE and row.status == am.INTERNSHIP_DRAFT:
        if not perm.has_permission(db, user, om.RES_INTERNSHIPS, om.ACT_APPROVE):
            raise HTTPException(status.HTTP_403_FORBIDDEN,
                                "Publishing a draft internship requires approval permission")

    before = row.status
    row.status = new_status
    db.commit()
    perm.record_audit(db, user, "status_changed", "internship", internship_id,
                      summary=f"'{row.title}': {before} -> {new_status}", request=request)
    return {"status": "ok", "new_status": new_status}


@router.post("/internships/{internship_id}/archive", response_model=None)
def set_internship_archived(
    internship_id: int,
    request: Request,
    archived: bool = Query(True),
    user: am.User = Depends(perm.require_permission(om.RES_INTERNSHIPS, om.ACT_EDIT)),
    db: Session = Depends(get_db),
):
    """Archive a listing, or restore one.

    Unlike delete this destroys nothing: the internship and every application on
    it stay exactly as they are, it simply leaves the working list and the public
    site. That makes archiving the right move for a posting that already has
    applicants -- which delete refuses outright.
    """
    row = db.query(am.Internship).filter(am.Internship.id == internship_id).first()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Internship not found")

    own = perm.scope_company_id(user)
    if own is not None and row.company_id != own:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your company's internship")

    row.is_archived = archived

    # An archived posting must not still read as open for applications. It is
    # already hidden from the public site, so leaving it 'active' would only be
    # misleading in the ops list.
    if archived and row.status == am.INTERNSHIP_ACTIVE:
        row.status = am.INTERNSHIP_CLOSED
    db.commit()

    perm.record_audit(db, user, "archived" if archived else "restored",
                      "internship", internship_id,
                      summary=f"'{row.title}'", request=request)
    return {"status": "ok", "is_archived": row.is_archived,
            "internship_status": row.status}


@router.delete("/internships/{internship_id}", response_model=None)
def delete_internship(
    internship_id: int,
    request: Request,
    user: am.User = Depends(perm.require_permission(om.RES_INTERNSHIPS, om.ACT_DELETE)),
    db: Session = Depends(get_db),
):
    row = db.query(am.Internship).filter(am.Internship.id == internship_id).first()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Internship not found")
    n = db.query(am.Application).filter(am.Application.internship_id == internship_id).count()
    if n:
        # Deleting would take the students' applications and tracking records
        # with it, so this stays refused. Archiving hides the listing and keeps
        # the history.
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Cannot delete: {n} student application(s) exist. Archive it instead "
            "-- that hides the listing and keeps the applications.",
        )
    title = row.title
    db.delete(row)
    db.commit()
    perm.record_audit(db, user, "deleted", "internship", internship_id,
                      summary=f"'{title}'", request=request)
    return {"status": "ok"}


# ===========================================================================
# 5. STUDENT MANAGEMENT
# ===========================================================================

@router.get("/students", response_model=None)
def list_students(
    user: am.User = Depends(perm.require_permission(om.RES_STUDENTS, om.ACT_VIEW)),
    db: Session = Depends(get_db),
    params: PageParams = Depends(),
    search: Optional[str] = None,
    college: Optional[str] = None,
    course: Optional[str] = None,
    current_year: Optional[str] = None,
    account_status: Optional[str] = None,
):
    q = (
        db.query(am.User, am.StudentProfile, am.Membership)
        .outerjoin(am.StudentProfile, am.StudentProfile.user_id == am.User.id)
        .outerjoin(am.Membership, am.Membership.user_id == am.User.id)
        .filter(am.User.role == am.ROLE_STUDENT)
    )

    # A coordinator sees only their own college's students.
    own_college = perm.scope_college_id(user)
    if own_college is not None:
        c = db.query(am.College).filter(am.College.id == own_college).first()
        q = q.filter(am.StudentProfile.college_name == (c.name if c else "\x00"))
    elif college:
        q = q.filter(am.StudentProfile.college_name.ilike(f"%{college.strip()}%"))

    if search:
        term = f"%{search.strip()}%"
        # Phone included: staff often have a number to hand and nothing else.
        clauses = [
            am.User.email.ilike(term),
            am.StudentProfile.full_name.ilike(term),
            am.StudentProfile.phone.ilike(term),
        ]
        # Numbers are stored with whatever spacing was typed, so also compare
        # digits only -- otherwise searching "8610037036" misses the stored
        # "+91 86100 37036".
        digits = "".join(ch for ch in search if ch.isdigit())
        if digits:
            clauses.append(
                func.regexp_replace(am.StudentProfile.phone, r"[^0-9]", "", "g")
                .ilike(f"%{digits}%")
            )
        q = q.filter(or_(*clauses))
    if course:
        q = q.filter(am.StudentProfile.course == course)
    if current_year:
        q = q.filter(am.StudentProfile.current_year == current_year)
    if account_status:
        q = q.filter(am.User.status == account_status)

    def row(t):
        u, p, m = t
        return {
            "id": u.id, "email": u.email, "status": u.status,
            "email_verified": u.email_verified,
            "full_name": p.full_name if p else None,
            "phone": p.phone if p else None,
            "college_name": p.college_name if p else None,
            "course": p.course if p else None,
            "current_year": p.current_year if p else None,
            "member_id": m.member_id if m else None,
            "created_at": u.created_at,
        }

    return paginate(q.order_by(am.User.created_at.desc()), params, row)


@router.get("/students/{user_id}", response_model=None)
def get_student(
    user_id: int,
    user: am.User = Depends(perm.require_permission(om.RES_STUDENTS, om.ACT_VIEW)),
    db: Session = Depends(get_db),
):
    u = db.query(am.User).filter(
        am.User.id == user_id, am.User.role == am.ROLE_STUDENT
    ).first()
    if not u:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Student not found")

    p = db.query(am.StudentProfile).filter(am.StudentProfile.user_id == user_id).first()

    own_college = perm.scope_college_id(user)
    if own_college is not None:
        c = db.query(am.College).filter(am.College.id == own_college).first()
        if not p or not c or p.college_name != c.name:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Not a student of your college")

    m = db.query(am.Membership).filter(am.Membership.user_id == user_id).first()
    apps = (
        db.query(am.Application)
        .options(joinedload(am.Application.internship).joinedload(am.Internship.company))
        .filter(am.Application.student_id == user_id)
        .order_by(am.Application.applied_at.desc()).all()
    )

    return {
        "id": u.id, "email": u.email, "status": u.status,
        "email_verified": u.email_verified, "password_set": u.password_set,
        "google_linked": bool(u.google_sub),
        "created_at": u.created_at, "last_login_at": u.last_login_at,
        "profile": {
            "full_name": p.full_name, "phone": p.phone,
            "whatsapp_number": p.whatsapp_number, "college_name": p.college_name,
            "course": p.course, "current_year": p.current_year, "skills": p.skills,
            "resume_url": p.resume_url, "linkedin_url": p.linkedin_url,
            "photo_url": p.photo_url, "city": p.city, "bio": p.bio,
            "completion_percent": p.compute_completion(),
        } if p else None,
        "membership": {
            "member_id": m.member_id, "tier": m.tier, "is_active": m.is_active,
        } if m else None,
        "documents": [
            {"id": d.id, "kind": d.kind, "file_url": d.file_url,
             "is_verified": d.is_verified, "created_at": d.created_at}
            for d in db.query(om.Document).filter(
                om.Document.owner_type == "student", om.Document.owner_id == user_id
            ).all()
        ],
        "internship_history": [
            {
                "application_id": a.id, "status": a.status, "applied_at": a.applied_at,
                "internship": a.internship.title if a.internship else None,
                "company": a.internship.company.name
                           if a.internship and a.internship.company else None,
            }
            for a in apps
        ],
    }


@router.post("/students/{user_id}/status", response_model=None)
def set_student_status(
    user_id: int,
    request: Request,
    new_status: str = Query(..., alias="status", pattern="^(active|suspended)$"),
    user: am.User = Depends(perm.require_permission(om.RES_STUDENTS, om.ACT_EDIT)),
    db: Session = Depends(get_db),
):
    u = db.query(am.User).filter(
        am.User.id == user_id, am.User.role == am.ROLE_STUDENT
    ).first()
    if not u:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Student not found")

    before = u.status
    u.status = new_status
    if new_status == am.STATUS_SUSPENDED:
        # Take effect immediately rather than at cookie expiry.
        db.query(am.UserSession).filter(
            am.UserSession.user_id == u.id,
            am.UserSession.revoked_at.is_(None),
        ).update({am.UserSession.revoked_at: datetime.now(timezone.utc)})
    db.commit()
    perm.record_audit(db, user, "status_changed", "student", user_id,
                      summary=f"{u.email}: {before} -> {new_status}", request=request)
    return {"status": "ok", "new_status": new_status}


@router.delete("/students/{user_id}", response_model=None)
def delete_student(
    user_id: int,
    request: Request,
    user: am.User = Depends(perm.require_staff),
    db: Session = Depends(get_db),
):
    u = db.query(am.User).filter(
        am.User.id == user_id, am.User.role == am.ROLE_STUDENT
    ).first()
    if not u:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Student not found")

    email = u.email
    try:
        app_ids = [a.id for a in db.query(am.Application).filter(am.Application.student_id == user_id).all()]
        if app_ids:
            db.query(om.InternshipProgress).filter(om.InternshipProgress.application_id.in_(app_ids)).delete(synchronize_session=False)
        db.query(om.Certificate).filter(om.Certificate.student_id == user_id).delete(synchronize_session=False)
        db.query(am.Application).filter(am.Application.student_id == user_id).delete(synchronize_session=False)
        db.query(om.Document).filter(om.Document.owner_type == "student", om.Document.owner_id == user_id).delete(synchronize_session=False)
        db.query(am.StudentProfile).filter(am.StudentProfile.user_id == user_id).delete(synchronize_session=False)
        db.query(am.Membership).filter(am.Membership.user_id == user_id).delete(synchronize_session=False)
        db.query(am.UserSession).filter(am.UserSession.user_id == user_id).delete(synchronize_session=False)
        db.query(am.Notification).filter(am.Notification.user_id == user_id).delete(synchronize_session=False)
        db.query(om.AuditLog).filter(om.AuditLog.actor_user_id == user_id).update({om.AuditLog.actor_user_id: None}, synchronize_session=False)
        db.delete(u)
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.error("Failed to delete student %s: %s", user_id, exc)
        raise HTTPException(500, f"Database error deleting student: {str(exc)}")

    perm.record_audit(db, user, "deleted", "student", user_id,
                      summary=f"Deleted student account '{email}'", request=request)
    return {"status": "ok"}





# ===========================================================================
# 6 & 7. APPLICATIONS -- registration management and the 12-stage pipeline
# ===========================================================================

class ApplicationStatusIn(BaseModel):
    status: str
    remarks: Optional[str] = None
    interview_at: Optional[datetime] = None
    # Set only when staff have deliberately confirmed a move that skips or
    # reverses stages -- correcting a mistake, or an internship with no
    # interview round. Without it the sequence is still enforced, so an
    # out-of-sequence move can never happen by accident or by a stray client.
    force: bool = False

    @field_validator("status")
    @classmethod
    def valid(cls, v):
        if v not in am.APPLICATION_STATUSES:
            raise ValueError(f"status must be one of: {', '.join(am.APPLICATION_STATUSES)}")
        return v


@router.get("/applications", response_model=None)
def list_applications(
    user: am.User = Depends(perm.require_permission(om.RES_APPLICATIONS, om.ACT_VIEW)),
    db: Session = Depends(get_db),
    params: PageParams = Depends(),
    company_id: Optional[int] = None,
    college: Optional[str] = None,
    internship_id: Optional[int] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    department: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
):
    q = (
        db.query(am.Application)
        .options(
            joinedload(am.Application.internship).joinedload(am.Internship.company),
            joinedload(am.Application.student).joinedload(am.User.student_profile),
        )
        .join(am.Internship, am.Application.internship_id == am.Internship.id)
        .outerjoin(am.StudentProfile, am.StudentProfile.user_id == am.Application.student_id)
    )

    own_company = perm.scope_company_id(user)
    if own_company is not None:
        q = q.filter(am.Internship.company_id == own_company)
    elif company_id:
        q = q.filter(am.Internship.company_id == company_id)

    own_college = perm.scope_college_id(user)
    if own_college is not None:
        c = db.query(am.College).filter(am.College.id == own_college).first()
        q = q.filter(am.StudentProfile.college_name == (c.name if c else "\x00"))
    elif college:
        q = q.filter(am.StudentProfile.college_name.ilike(f"%{college.strip()}%"))

    if internship_id:
        q = q.filter(am.Application.internship_id == internship_id)
    if status_filter:
        q = q.filter(am.Application.status == status_filter)
    if department:
        q = q.filter(am.Internship.department == department)
    if date_from:
        q = q.filter(func.date(am.Application.applied_at) >= date_from)
    if date_to:
        q = q.filter(func.date(am.Application.applied_at) <= date_to)

    def row(a: am.Application):
        prof = a.student.student_profile if a.student else None
        return {
            "id": a.id, "status": a.status, "applied_at": a.applied_at,
            "updated_at": a.updated_at, "cover_note": a.cover_note,
            "resume_url": a.resume_url, "admin_notes": a.admin_notes,
            "interview_at": a.interview_at,
            "student": {
                "id": a.student.id, "email": a.student.email,
                "full_name": prof.full_name if prof else None,
                "phone": prof.phone if prof else None,
                "college_name": prof.college_name if prof else None,
                "course": prof.course if prof else None,
            } if a.student else None,
            "internship": {
                "id": a.internship.id, "title": a.internship.title,
                "department": a.internship.department,
                "company": a.internship.company.name
                           if a.internship.company else None,
            } if a.internship else None,
        }

    return paginate(q.order_by(am.Application.applied_at.desc()), params, row)


@router.get("/applications/workflow", response_model=None)
def application_workflow(
    user: am.User = Depends(perm.require_staff),
):
    """The pipeline definition, so the UI never hard-codes stage names."""
    return {
        "statuses": list(am.APPLICATION_STATUSES),
        # The lifecycle stages in order, so the UI can number them without
        # keeping its own copy of the sequence.
        "stages": list(am.PIPELINE_STAGES),
        "active": list(am.ACTIVE_APPLICATION_STATUSES),
        "terminal": list(am.TERMINAL_STATUSES),
        "placed": list(am.PLACED_STATUSES),
        "holding": list(am.HOLDING_STATUSES),
        "transitions": {k: list(v) for k, v in am.ALLOWED_TRANSITIONS.items()},
        "universal_targets": list(am.UNIVERSAL_TARGETS),
    }


@router.patch("/applications/{application_id}", response_model=None)
def update_application_status(
    application_id: int,
    payload: ApplicationStatusIn,
    request: Request,
    background_tasks: BackgroundTasks,
    user: am.User = Depends(perm.require_permission(om.RES_APPLICATIONS, om.ACT_EDIT)),
    db: Session = Depends(get_db),
):
    a = (
        db.query(am.Application)
        .options(joinedload(am.Application.internship).joinedload(am.Internship.company),
                 # Loaded for the notification email's recipient and greeting.
                 joinedload(am.Application.student).joinedload(am.User.student_profile))
        .filter(am.Application.id == application_id)
        .first()
    )
    if not a:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Application not found")

    own_company = perm.scope_company_id(user)
    if own_company is not None and (
        not a.internship or a.internship.company_id != own_company
    ):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your company's applicant")

    previous = a.status

    # Enforce the pipeline: no jumping backwards or skipping stages, unless the
    # caller has explicitly confirmed an override.
    out_of_sequence = not am.can_transition(previous, payload.status)
    if out_of_sequence and not payload.force:
        allowed = list(am.ALLOWED_TRANSITIONS.get(previous, ()))
        if previous not in am.TERMINAL_STATUSES:
            allowed += list(am.UNIVERSAL_TARGETS)
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Cannot move from '{previous}' to '{payload.status}'. "
            f"Allowed from here: {', '.join(allowed) or 'none (terminal state)'}. "
            "Confirm the change to override the sequence.",
        )

    # No cap on selections: 'openings' is an advertised figure, not a hard limit,
    # so ops can select as many candidates as they need without editing it first.

    a.status = payload.status
    if payload.remarks is not None:
        a.admin_notes = payload.remarks
    if payload.interview_at is not None:
        a.interview_at = payload.interview_at

    # Any stage from 'internship started' onwards means the internship has
    # begun, so stamp the joining date. Covers a jump straight to 'completed',
    # which would otherwise leave the certificate with no start date.
    if payload.status in am.PLACED_STATUSES:
        tracking.mark_joined(db, a, a.internship)

    # Only tell the student when something actually moved. Saving remarks or an
    # interview time re-sends the current status, and "your application is now
    # 'applied'" would be a confusing thing to receive.
    if payload.status != previous:
        title = a.internship.title if a.internship else "your internship"
        company = a.internship.company.name if a.internship and a.internship.company else "the company"
        db.add(am.Notification(
            user_id=a.student_id,
            title=f"Application update: {payload.status.replace('_', ' ').title()}",
            body=f"Your application for {title} at {company} is now "
                 f"'{payload.status.replace('_', ' ')}'.",
            kind="application",
            link="/dashboard/applications",
        ))
        # And by email, in the background, so a slow mail server never holds up
        # the status change itself.
        prof = a.student.student_profile if a.student else None
        background_tasks.add_task(
            send_application_status_change,
            a.student.email if a.student else "",
            prof.full_name if prof else None,
            a.internship.title if a.internship else None,
            a.internship.company.name if a.internship and a.internship.company else None,
            payload.status,
            a.interview_at,
            payload.remarks,
        )
    db.commit()

    if payload.status != previous:
        # Flag overrides in the summary: an out-of-sequence move is exactly the
        # kind of thing someone will want to find in the audit log later.
        note = " (out of sequence)" if out_of_sequence else ""
        perm.record_audit(db, user, "status_changed", "application", application_id,
                          summary=f"{previous} -> {payload.status}{note}",
                          changes={"status": [previous, payload.status]}, request=request)
    else:
        # Remarks or an interview time, with the stage left alone. Logging this
        # as "applied -> applied" would bury the real change.
        perm.record_audit(db, user, "updated", "application", application_id,
                          summary=f"Details updated (still '{previous}')", request=request)
    return {"status": "ok", "new_status": a.status}


@router.post("/applications/bulk-status", response_model=None)
def bulk_update_status(
    request: Request,
    application_ids: list[int],
    background_tasks: BackgroundTasks,
    new_status: str = Query(..., alias="status"),
    user: am.User = Depends(perm.require_permission(om.RES_APPLICATIONS, om.ACT_EDIT)),
    db: Session = Depends(get_db),
):
    """Shortlist or reject a batch. Reports per-application outcomes rather
    than failing the whole batch on one bad row."""
    if new_status not in am.APPLICATION_STATUSES:
        raise HTTPException(400, f"Unknown status: {new_status}")
    if len(application_ids) > 200:
        raise HTTPException(400, "Maximum 200 applications per batch")

    own_company = perm.scope_company_id(user)
    updated, skipped = [], []

    for app_id in application_ids:
        a = (
            db.query(am.Application)
            .options(joinedload(am.Application.internship).joinedload(am.Internship.company),
                     joinedload(am.Application.student).joinedload(am.User.student_profile))
            .filter(am.Application.id == app_id).first()
        )
        if not a:
            skipped.append({"id": app_id, "reason": "not found"})
            continue
        if own_company is not None and (
            not a.internship or a.internship.company_id != own_company
        ):
            skipped.append({"id": app_id, "reason": "not your company"})
            continue
        if not am.can_transition(a.status, new_status):
            skipped.append({"id": app_id, "reason": f"cannot move from '{a.status}'"})
            continue

        previous = a.status
        a.status = new_status

        # Same rule as the single-application path, which this used to skip --
        # a batch move to 'internship started' left the interns untracked.
        if new_status in am.PLACED_STATUSES:
            tracking.mark_joined(db, a, a.internship)

        db.add(am.Notification(
            user_id=a.student_id,
            title=f"Application update: {new_status.replace('_', ' ').title()}",
            body=f"Your application status changed to '{new_status.replace('_', ' ')}'.",
            kind="application", link="/dashboard/applications",
        ))
        # One email per student, same as the single-application path.
        prof = a.student.student_profile if a.student else None
        background_tasks.add_task(
            send_application_status_change,
            a.student.email if a.student else "",
            prof.full_name if prof else None,
            a.internship.title if a.internship else None,
            a.internship.company.name if a.internship and a.internship.company else None,
            new_status,
            a.interview_at,
            None,
        )
        updated.append({"id": app_id, "from": previous, "to": new_status})

    db.commit()
    # One row covers many applications, so the ids go in `changes`. Without them
    # there is no way to attribute a bulk review back to individual applications
    # -- which is what the per-HR "Reviewed" count is built from.
    perm.record_audit(db, user, "bulk_status_changed", "application", None,
                      summary=f"{len(updated)} updated to {new_status}, {len(skipped)} skipped",
                      changes={"application_ids": [u["id"] for u in updated],
                               "status": new_status},
                      request=request)
    return {"status": "ok", "updated": updated, "skipped": skipped}


@router.delete("/applications/{application_id}", response_model=None)
def delete_application(
    application_id: int,
    request: Request,
    user: am.User = Depends(perm.require_permission(om.RES_APPLICATIONS, om.ACT_DELETE)),
    db: Session = Depends(get_db),
):
    """Remove a registration, along with its tracking record and weekly reports.

    Refuses once a certificate has been issued: certificates cascade off the
    application, and that certificate's verification code is already printed on
    a PDF the student holds. Deleting the row would turn a public verification
    URL into "no certificate matches this code". Revoke it first if the record
    genuinely has to go.
    """
    a = (
        db.query(am.Application)
        .options(joinedload(am.Application.internship),
                 joinedload(am.Application.student))
        .filter(am.Application.id == application_id)
        .first()
    )
    if not a:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Registration not found")

    own = perm.scope_company_id(user)
    if own is not None and (not a.internship or a.internship.company_id != own):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your company's applicant")

    issued = (
        db.query(om.Certificate)
        .filter(om.Certificate.application_id == application_id,
                om.Certificate.status == "issued")
        .first()
    )
    if issued:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Cannot delete: certificate {issued.certificate_number} has already "
            "been issued for this internship, and deleting the registration would "
            "break its verification link. Revoke the certificate first.",
        )

    # Read everything the audit line needs before the row goes: after the
    # commit the instance is gone and these attributes are unreadable.
    who = a.student.email if a.student else f"student #{a.student_id}"
    title = a.internship.title if a.internship else f"internship #{a.internship_id}"
    was_status = a.status

    # The FKs cascade, but clear the children explicitly so this behaves the
    # same regardless of how the database was created.
    progress_ids = [
        p.id for p in db.query(om.InternshipProgress)
        .filter(om.InternshipProgress.application_id == application_id).all()
    ]
    if progress_ids:
        db.query(om.WeeklyReport).filter(
            om.WeeklyReport.progress_id.in_(progress_ids)
        ).delete(synchronize_session=False)
    db.query(om.InternshipProgress).filter(
        om.InternshipProgress.application_id == application_id
    ).delete(synchronize_session=False)
    db.query(om.Certificate).filter(
        om.Certificate.application_id == application_id
    ).delete(synchronize_session=False)
    db.delete(a)
    db.commit()

    perm.record_audit(db, user, "deleted", "application", application_id,
                      summary=f"'{who}' from '{title}' (was {was_status})",
                      request=request)
    return {"status": "ok"}
