# app/ops_users.py
"""Operations portal, sections 10-12: user management.

Creates and manages the portal logins that the RBAC layer already understands:
operations staff, Company HR, College Coordinators, and Mentors.

Two invariants are enforced everywhere in this module:
  * A company_hr MUST have a company_id and a college_coordinator MUST have a
    college_id. Without it, scope_company_id/scope_college_id return None and
    the user would silently see every company's data.
  * Nobody can strip their own access. Several endpoints refuse to act on the
    caller's own account, because a single mis-click would otherwise lock the
    last administrator out.
"""
import csv
import io
import json
import logging
import secrets
import string
from datetime import datetime, timezone
from typing import Optional

from fastapi import (
    APIRouter, BackgroundTasks, Depends, File, HTTPException, Query, Request,
    UploadFile, status,
)
from pydantic import AliasChoices, BaseModel, EmailStr, Field, field_validator
from sqlalchemy import func
from sqlalchemy.orm import Session

from . import auth_models as am
from . import ops_models as om
from . import permissions as perm
from . import security
from .database import get_db
from .email_utils import send_portal_credentials, smtp_configured
from .pagination import PageParams, paginate

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ops", tags=["operations"])

# Roles that can be created through this screen. Students self-register on the
# public site and are never provisioned here.
PROVISIONABLE_ROLES = (
    om.ROLE_OPS_MANAGER, om.ROLE_OPS_EXECUTIVE,
    om.ROLE_COMPANY_HR, om.ROLE_COLLEGE_COORDINATOR, om.ROLE_MENTOR,
    om.ROLE_SUPER_ADMIN,
)

MAX_BULK_STUDENTS = 500

# Audit actions that count towards a user's "posted" and "reviewed" tallies.
# Neither internships nor applications record who acted on them, so the audit
# log is the only place that attribution exists.
POSTED_ACTIONS = ("created", "cloned")
REVIEWED_ACTIONS = ("status_changed", "updated", "bulk_status_changed")


def _bulk_application_ids(changes: Optional[str]) -> list[int]:
    """Application ids from a bulk_status_changed audit row.

    One audit row stands for many applications, so the ids live in the JSON
    blob. Older rows predate that and carry none -- they contribute nothing
    rather than breaking the count.
    """
    if not changes:
        return []
    try:
        blob = json.loads(changes)
    except (ValueError, TypeError):
        return []
    ids = blob.get("application_ids") if isinstance(blob, dict) else None
    return [i for i in ids if isinstance(i, int)] if isinstance(ids, list) else []


def _activity_counts(
    db: Session, user_ids: list[int],
) -> tuple[dict[int, int], dict[int, int]]:
    """How many internships each user posted, and applications each reviewed.

    Counts distinct entities, so editing one application three times is one
    review, not three. Runs as three fixed queries regardless of how many users
    are on the page -- a per-user count would be an N+1 on every list load.
    """
    if not user_ids:
        return {}, {}

    posted = dict(
        db.query(
            om.AuditLog.actor_user_id,
            func.count(func.distinct(om.AuditLog.entity_id)),
        )
        .filter(
            om.AuditLog.actor_user_id.in_(user_ids),
            om.AuditLog.entity_type == "internship",
            om.AuditLog.action.in_(POSTED_ACTIONS),
            om.AuditLog.entity_id.isnot(None),
        )
        .group_by(om.AuditLog.actor_user_id)
        .all()
    )

    # Distinct (actor, application) pairs for one-at-a-time reviews...
    reviewed: dict[int, set[int]] = {}
    for actor_id, entity_id in (
        db.query(om.AuditLog.actor_user_id, om.AuditLog.entity_id)
        .filter(
            om.AuditLog.actor_user_id.in_(user_ids),
            om.AuditLog.entity_type == "application",
            om.AuditLog.action.in_(REVIEWED_ACTIONS),
            om.AuditLog.entity_id.isnot(None),
        )
        .distinct()
        .all()
    ):
        reviewed.setdefault(actor_id, set()).add(entity_id)

    # ...then fold in the bulk rows, whose ids are in the changes blob. Merging
    # into the same set is what stops an application reviewed both ways from
    # being counted twice.
    for actor_id, changes in (
        db.query(om.AuditLog.actor_user_id, om.AuditLog.changes)
        .filter(
            om.AuditLog.actor_user_id.in_(user_ids),
            om.AuditLog.entity_type == "application",
            om.AuditLog.action == "bulk_status_changed",
        )
        .all()
    ):
        bucket = reviewed.setdefault(actor_id, set())
        bucket.update(_bulk_application_ids(changes))

    return posted, {k: len(v) for k, v in reviewed.items()}


def _temp_password() -> str:
    """A readable one-time password. Excludes characters that are easy to
    misread when someone types them from a printout."""
    alphabet = "".join(c for c in string.ascii_letters + string.digits
                       if c not in "O0Il1")
    return "".join(secrets.choice(alphabet) for _ in range(12)) + "@1"


class PortalUserIn(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=200)
    role: str
    company_id: Optional[int] = None
    college_id: Optional[int] = None
    phone: Optional[str] = Field(default=None, max_length=50)
    # Optional: staff may set the first password themselves, which is what the
    # provisioning screen offers. Left out, one is generated. Either way the
    # effective password is returned once and only its hash is stored.
    password: Optional[str] = Field(default=None, max_length=128)
    # Email the one-time password straight to the new user. Off by default so
    # existing callers keep the show-it-on-screen behaviour they expect.
    send_credentials_email: bool = False

    @field_validator("role")
    @classmethod
    def valid_role(cls, v):
        if v not in PROVISIONABLE_ROLES:
            raise ValueError(f"role must be one of: {', '.join(PROVISIONABLE_ROLES)}")
        return v

    @field_validator("full_name")
    @classmethod
    def name_not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Full name is required")
        return v

    @field_validator("password", "phone")
    @classmethod
    def blank_is_none(cls, v: Optional[str]) -> Optional[str]:
        # An untouched optional field arrives as "", which must not be stored
        # or read as a request to set an empty password.
        return (v or "").strip() or None


class PortalUserUpdate(BaseModel):
    role: Optional[str] = None
    company_id: Optional[int] = None
    college_id: Optional[int] = None
    full_name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    phone: Optional[str] = Field(default=None, max_length=50)
    # Accepts "status" too. Callers naturally send that, and because unknown
    # fields are ignored a mismatch here returned 200 while changing nothing --
    # which is exactly how the suspend button came to silently do nothing.
    account_status: Optional[str] = Field(
        default=None, validation_alias=AliasChoices("account_status", "status"),
    )

    @field_validator("role")
    @classmethod
    def valid_role(cls, v):
        if v is not None and v not in PROVISIONABLE_ROLES:
            raise ValueError(f"role must be one of: {', '.join(PROVISIONABLE_ROLES)}")
        return v

    @field_validator("account_status")
    @classmethod
    def valid_status(cls, v):
        if v is not None and v not in (am.STATUS_ACTIVE, am.STATUS_SUSPENDED):
            raise ValueError("account_status must be 'active' or 'suspended'")
        return v


def _validate_scope(db: Session, role: str, company_id: Optional[int],
                    college_id: Optional[int]) -> None:
    """A scoped role without its scope would see everything. Refuse it."""
    if role == om.ROLE_COMPANY_HR:
        if not company_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST,
                                "company_id is required for a Company HR account")
        if not db.query(am.Company).filter(am.Company.id == company_id).first():
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "That company does not exist")

    if role == om.ROLE_COLLEGE_COORDINATOR:
        if not college_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST,
                                "college_id is required for a College Coordinator account")
        if not db.query(am.College).filter(am.College.id == college_id).first():
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "That college does not exist")


def _guard_super_admin(actor: am.User, target_role: str) -> None:
    """Only a super_admin may mint another super_admin."""
    if target_role == om.ROLE_SUPER_ADMIN and not perm.is_super_admin(actor):
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            "Only a super admin can create or assign the super_admin role")


# ===========================================================================
# 12. USER MANAGEMENT
# ===========================================================================

@router.get("/users", response_model=None)
def list_users(
    user: am.User = Depends(perm.require_permission(om.RES_USERS, om.ACT_VIEW)),
    db: Session = Depends(get_db),
    params: PageParams = Depends(),
    role: Optional[str] = None,
    search: Optional[str] = None,
    account_status: Optional[str] = None,
):
    """Portal users only -- students are managed on the Students screen."""
    q = db.query(am.User).filter(am.User.role != am.ROLE_STUDENT)
    if role:
        q = q.filter(am.User.role == role)
    if account_status:
        q = q.filter(am.User.status == account_status)
    if search:
        q = q.filter(am.User.email.ilike(f"%{search.strip()}%"))

    companies = {c.id: c.name for c in db.query(am.Company).all()}
    colleges = {c.id: c.name for c in db.query(am.College).all()}

    # Paginate first, then tally only the users actually on this page -- counting
    # every portal user would be wasted work on a 200-row table.
    result = paginate(q.order_by(am.User.created_at.desc()), params)
    page_users: list[am.User] = result["items"]
    posted, reviewed = _activity_counts(db, [u.id for u in page_users])

    def row(u: am.User):
        return {
            "id": u.id, "email": u.email, "role": u.role, "status": u.status,
            "full_name": u.full_name, "phone": u.phone,
            "email_verified": u.email_verified, "password_set": u.password_set,
            "company": {"id": u.company_id, "name": companies.get(u.company_id)}
                       if u.company_id else None,
            "college": {"id": u.college_id, "name": colleges.get(u.college_id)}
                       if u.college_id else None,
            "internships_posted": posted.get(u.id, 0),
            "applications_reviewed": reviewed.get(u.id, 0),
            "last_login_at": u.last_login_at, "created_at": u.created_at,
        }

    result["items"] = [row(u) for u in page_users]
    return result


@router.post("/users", response_model=None, status_code=201)
def create_portal_user(
    payload: PortalUserIn,
    request: Request,
    background: BackgroundTasks,
    user: am.User = Depends(perm.require_permission(om.RES_USERS, om.ACT_ADD)),
    db: Session = Depends(get_db),
):
    """Create an HR, coordinator, mentor or operations login.

    Returns a one-time password. It is shown exactly once -- only the hash is
    stored, so it cannot be retrieved later; use the reset endpoint instead.
    """
    email = payload.email.lower().strip()
    if db.query(am.User).filter(am.User.email == email).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")

    _guard_super_admin(user, payload.role)
    _validate_scope(db, payload.role, payload.company_id, payload.college_id)

    # Honour a password staff typed in, so the credentials they hand over are
    # the ones that actually work. Otherwise generate one.
    if payload.password:
        problems = security.password_problems(payload.password)
        if problems:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"Password must contain {', '.join(problems)}",
            )
        temp = payload.password
    else:
        temp = _temp_password()

    row = am.User(
        email=email,
        password_hash=security.hash_password(temp),
        full_name=payload.full_name,
        phone=payload.phone,
        role=payload.role,
        status=am.STATUS_ACTIVE,
        email_verified=True,       # provisioned by staff, so already trusted
        password_set=False,        # flags that this is still the temp password
        company_id=payload.company_id if payload.role == om.ROLE_COMPANY_HR else None,
        college_id=payload.college_id if payload.role == om.ROLE_COLLEGE_COORDINATOR else None,
    )
    db.add(row)
    db.flush()

    # A mentor login also needs a mentor record to attach progress to.
    if payload.role == om.ROLE_MENTOR:
        db.add(om.Mentor(
            user_id=row.id, company_id=payload.company_id,
            full_name=payload.full_name, email=email, phone=payload.phone,
        ))

    db.commit()
    db.refresh(row)

    # Queued after the commit so the account exists before the mail goes out,
    # and in the background so a slow SMTP server does not hold the response.
    email_queued = False
    if payload.send_credentials_email and smtp_configured():
        org = None
        if payload.company_id:
            c = db.query(am.Company).filter(am.Company.id == payload.company_id).first()
            org = c.name if c else None
        elif payload.college_id:
            c = db.query(am.College).filter(am.College.id == payload.college_id).first()
            org = c.name if c else None
        background.add_task(send_portal_credentials, email, row.full_name, temp,
                            payload.role, org)
        email_queued = True

    perm.record_audit(db, user, "created", "portal_user", row.id,
                      summary=f"{payload.role} '{email}'", request=request)
    return {
        "status": "ok", "id": row.id, "email": email, "role": payload.role,
        "full_name": row.full_name, "phone": row.phone,
        "temporary_password": temp,
        "password_was_generated": not payload.password,
        "credentials_email_queued": email_queued,
        # Distinguishes "you didn't ask" from "asked, but SMTP is not set up" so
        # the UI can tell staff to hand the password over themselves.
        "credentials_email_skipped_reason": (
            None if email_queued
            else "not_requested" if not payload.send_credentials_email
            else "smtp_not_configured"
        ),
        "note": "Share this securely. It is shown only once and must be changed "
                "by the user via /auth/change-password.",
    }


@router.patch("/users/{user_id}", response_model=None)
def update_portal_user(
    user_id: int,
    payload: PortalUserUpdate,
    request: Request,
    user: am.User = Depends(perm.require_permission(om.RES_USERS, om.ACT_EDIT)),
    db: Session = Depends(get_db),
):
    target = db.query(am.User).filter(am.User.id == user_id).first()
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if target.role == am.ROLE_STUDENT:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            "Students are managed on the Students screen")

    # Self-lockout guards.
    if target.id == user.id:
        if payload.role and payload.role != user.role:
            raise HTTPException(status.HTTP_400_BAD_REQUEST,
                                "You cannot change your own role")
        if payload.account_status == am.STATUS_SUSPENDED:
            raise HTTPException(status.HTTP_400_BAD_REQUEST,
                                "You cannot suspend your own account")

    updates = payload.model_dump(exclude_unset=True)
    new_role = updates.get("role", target.role)
    if "role" in updates:
        _guard_super_admin(user, updates["role"])
    if perm.is_super_admin(target) and not perm.is_super_admin(user):
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            "Only a super admin can modify another super admin")

    company_id = updates.get("company_id", target.company_id)
    college_id = updates.get("college_id", target.college_id)
    _validate_scope(db, new_role, company_id, college_id)

    before = {"role": target.role, "status": target.status,
              "company_id": target.company_id, "college_id": target.college_id}

    if "role" in updates:
        target.role = updates["role"]
    if "company_id" in updates:
        target.company_id = updates["company_id"]
    if "college_id" in updates:
        target.college_id = updates["college_id"]
    if "full_name" in updates:
        target.full_name = updates["full_name"]
    if "phone" in updates:
        target.phone = updates["phone"]
    if "account_status" in updates:
        target.status = updates["account_status"]
        if target.status == am.STATUS_SUSPENDED:
            db.query(am.UserSession).filter(
                am.UserSession.user_id == target.id,
                am.UserSession.revoked_at.is_(None),
            ).update({am.UserSession.revoked_at: datetime.now(timezone.utc)})

    # A role change alters what this session may do, so force a fresh sign-in.
    if "role" in updates and updates["role"] != before["role"]:
        db.query(am.UserSession).filter(
            am.UserSession.user_id == target.id,
            am.UserSession.revoked_at.is_(None),
        ).update({am.UserSession.revoked_at: datetime.now(timezone.utc)})

    # Clear any scope that no longer applies to the new role.
    if target.role != om.ROLE_COMPANY_HR:
        target.company_id = None
    if target.role != om.ROLE_COLLEGE_COORDINATOR:
        target.college_id = None

    db.commit()
    after = {"role": target.role, "status": target.status,
             "company_id": target.company_id, "college_id": target.college_id}
    perm.record_audit(db, user, "updated", "portal_user", user_id,
                      summary=target.email,
                      changes=perm.diff_changes(before, after), request=request)
    return {"status": "ok"}


@router.post("/users/{user_id}/reset-password", response_model=None)
def reset_password(
    user_id: int,
    request: Request,
    user: am.User = Depends(perm.require_permission(om.RES_USERS, om.ACT_EDIT)),
    db: Session = Depends(get_db),
):
    """Issue a new one-time password and kill every existing session."""
    target = db.query(am.User).filter(am.User.id == user_id).first()
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if perm.is_super_admin(target) and not perm.is_super_admin(user):
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            "Only a super admin can reset another super admin's password")

    temp = _temp_password()
    target.password_hash = security.hash_password(temp)
    target.password_set = False
    db.query(am.UserSession).filter(
        am.UserSession.user_id == target.id,
        am.UserSession.revoked_at.is_(None),
    ).update({am.UserSession.revoked_at: datetime.now(timezone.utc)})
    db.commit()

    perm.record_audit(db, user, "password_reset", "portal_user", user_id,
                      summary=target.email, request=request)
    return {"status": "ok", "email": target.email, "temporary_password": temp,
            "note": "All existing sessions were signed out."}


@router.post("/users/{user_id}/revoke-sessions", response_model=None)
def revoke_sessions(
    user_id: int,
    request: Request,
    user: am.User = Depends(perm.require_permission(om.RES_USERS, om.ACT_EDIT)),
    db: Session = Depends(get_db),
):
    target = db.query(am.User).filter(am.User.id == user_id).first()
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    n = db.query(am.UserSession).filter(
        am.UserSession.user_id == user_id,
        am.UserSession.revoked_at.is_(None),
    ).update({am.UserSession.revoked_at: datetime.now(timezone.utc)})
    db.commit()
    perm.record_audit(db, user, "sessions_revoked", "portal_user", user_id,
                      summary=f"{target.email}: {n} session(s)", request=request)
    return {"status": "ok", "revoked": n}


@router.get("/users/{user_id}/activity", response_model=None)
def user_activity(
    user_id: int,
    user: am.User = Depends(perm.require_permission(om.RES_AUDIT_LOGS, om.ACT_VIEW)),
    db: Session = Depends(get_db),
    params: PageParams = Depends(),
):
    """Section 11: 'View Activity Logs' for one portal user."""
    target = db.query(am.User).filter(am.User.id == user_id).first()
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    q = db.query(om.AuditLog).filter(om.AuditLog.actor_user_id == user_id)
    result = paginate(q.order_by(om.AuditLog.created_at.desc()), params, lambda a: {
        "id": a.id, "action": a.action, "entity_type": a.entity_type,
        "entity_id": a.entity_id, "summary": a.summary,
        "ip_address": a.ip_address, "created_at": a.created_at,
    })
    result["user"] = {"id": target.id, "email": target.email, "role": target.role}
    result["active_sessions"] = db.query(am.UserSession).filter(
        am.UserSession.user_id == user_id,
        am.UserSession.revoked_at.is_(None),
    ).count()
    return result


@router.delete("/users/{user_id}", response_model=None)
def delete_portal_user(
    user_id: int,
    request: Request,
    user: am.User = Depends(perm.require_permission(om.RES_USERS, om.ACT_DELETE)),
    db: Session = Depends(get_db),
):
    target = db.query(am.User).filter(am.User.id == user_id).first()
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if target.id == user.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You cannot delete your own account")
    if target.role == am.ROLE_STUDENT:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            "Students are managed on the Students screen")
    if perm.is_super_admin(target):
        remaining = db.query(am.User).filter(
            am.User.role.in_((om.ROLE_SUPER_ADMIN, om.ROLE_ADMIN)),
            am.User.status == am.STATUS_ACTIVE,
            am.User.id != user_id,
        ).count()
        if remaining == 0:
            raise HTTPException(status.HTTP_400_BAD_REQUEST,
                                "This is the last active super admin and cannot be deleted")

    email = target.email
    db.delete(target)
    db.commit()
    perm.record_audit(db, user, "deleted", "portal_user", user_id,
                      summary=email, request=request)
    return {"status": "ok"}


# ===========================================================================
# 10. COLLEGE COORDINATOR -- bulk student upload
# ===========================================================================

@router.post("/students/bulk-upload", response_model=None)
async def bulk_upload_students(
    request: Request,
    file: UploadFile = File(...),
    college_id: Optional[int] = Query(None),
    user: am.User = Depends(perm.require_permission(om.RES_STUDENTS, om.ACT_ADD)),
    db: Session = Depends(get_db),
):
    """Create student accounts from a CSV.

    Expected header: full_name,email,phone,course,current_year
    Only full_name and email are required.

    Existing emails are skipped, never overwritten -- a re-upload of the same
    list must not reset a student's password or clobber their profile.
    """
    if not (file.filename or "").lower().endswith(".csv"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Please upload a .csv file")

    raw = await file.read(2 * 1024 * 1024)      # 2 MB cap
    try:
        text = raw.decode("utf-8-sig")           # tolerate Excel's BOM
    except UnicodeDecodeError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            "Could not read the file as UTF-8 text")

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The CSV appears to be empty")

    headers = {(h or "").strip().lower() for h in reader.fieldnames}
    if not {"full_name", "email"} <= headers:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "CSV must contain at least 'full_name' and 'email' columns. "
            f"Found: {', '.join(sorted(headers))}",
        )

    # A coordinator can only import into their own college.
    own_college = perm.scope_college_id(user)
    target_college_id = own_college if own_college is not None else college_id
    college_name = None
    if target_college_id:
        c = db.query(am.College).filter(am.College.id == target_college_id).first()
        if not c:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "That college does not exist")
        college_name = c.name

    created, skipped = [], []
    seen_in_file: set[str] = set()

    from .auth_routes import _generate_member_id

    for line_no, raw_row in enumerate(reader, start=2):
        row = {(k or "").strip().lower(): (v or "").strip()
               for k, v in raw_row.items() if k}
        email = row.get("email", "").lower()
        name = row.get("full_name", "")

        if not email or not name:
            skipped.append({"line": line_no, "email": email or "(blank)",
                            "reason": "missing full_name or email"})
            continue
        if "@" not in email or "." not in email.split("@")[-1]:
            skipped.append({"line": line_no, "email": email, "reason": "invalid email"})
            continue
        if email in seen_in_file:
            skipped.append({"line": line_no, "email": email, "reason": "duplicate within file"})
            continue
        seen_in_file.add(email)

        if db.query(am.User).filter(am.User.email == email).first():
            skipped.append({"line": line_no, "email": email, "reason": "already registered"})
            continue

        if len(created) >= MAX_BULK_STUDENTS:
            skipped.append({"line": line_no, "email": email,
                            "reason": f"batch limit of {MAX_BULK_STUDENTS} reached"})
            continue

        temp = _temp_password()
        u = am.User(
            email=email, password_hash=security.hash_password(temp),
            role=am.ROLE_STUDENT, status=am.STATUS_ACTIVE,
            email_verified=False, password_set=False,
        )
        db.add(u)
        db.flush()
        db.add(am.StudentProfile(
            user_id=u.id, full_name=name, phone=row.get("phone") or None,
            college_name=college_name or row.get("college_name") or None,
            course=row.get("course") or None,
            current_year=row.get("current_year") or None,
        ))
        db.add(am.Membership(user_id=u.id, member_id=_generate_member_id(db)))
        created.append({"email": email, "full_name": name, "temporary_password": temp})

    db.commit()
    perm.record_audit(db, user, "bulk_created", "student", None,
                      summary=f"{len(created)} students imported, {len(skipped)} skipped",
                      request=request)
    return {
        "status": "ok",
        "created_count": len(created), "skipped_count": len(skipped),
        "created": created, "skipped": skipped,
        "warning": "Temporary passwords are listed once and are not recoverable. "
                   "Distribute them securely; email invites are the better route "
                   "once SMTP is configured.",
    }


@router.get("/students/bulk-upload/template", response_model=None)
def bulk_upload_template(
    user: am.User = Depends(perm.require_permission(om.RES_STUDENTS, om.ACT_ADD)),
):
    """The exact CSV header the importer expects."""
    return {
        "required_columns": ["full_name", "email"],
        "optional_columns": ["phone", "course", "current_year", "college_name"],
        "example_csv": (
            "full_name,email,phone,course,current_year\n"
            "Kaviya S,kaviya@example.com,9876543210,B.E / B.Tech,Final Year\n"
            "Ravi Kumar,ravi@example.com,9876543211,BCA,3rd Year\n"
        ),
        "notes": [
            f"Maximum {MAX_BULK_STUDENTS} new students per upload.",
            "Existing email addresses are skipped, never overwritten.",
            "A coordinator's uploads are forced to their own college.",
        ],
    }
