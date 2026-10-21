# app/ops_routes.py
"""Operations portal: dashboard, RBAC administration, audit log, master data."""
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from . import auth_models as am
from . import ops_models as om
from . import permissions as perm
from .database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ops", tags=["operations"])

# The dashboard runs ~15 COUNT queries. With several operations staff leaving
# it open, that is a lot of repeated work for numbers that do not need to be
# accurate to the second. A short in-process cache removes almost all of it.
#
# In-process means each uvicorn worker keeps its own copy; with 4 workers a
# figure can be up to CACHE_TTL stale. That is fine for headline counters.
# Move this to Redis if the numbers ever need to be exact across workers.
_DASHBOARD_CACHE: dict[str, tuple[float, dict]] = {}
DASHBOARD_CACHE_TTL = 60.0  # seconds


def _cache_get(key: str) -> Optional[dict]:
    import time
    hit = _DASHBOARD_CACHE.get(key)
    if hit and (time.monotonic() - hit[0]) < DASHBOARD_CACHE_TTL:
        return hit[1]
    return None


def _cache_put(key: str, value: dict) -> None:
    import time
    _DASHBOARD_CACHE[key] = (time.monotonic(), value)


# ===========================================================================
# 1. DASHBOARD
# ===========================================================================

@router.get("/dashboard", response_model=None)
def dashboard(
    user: am.User = Depends(perm.require_staff),
    db: Session = Depends(get_db),
    refresh: bool = False,
):
    """Headline counters for the operations home screen.

    Every number is a real query -- nothing is estimated or hard-coded.
    Cached for 60s; pass ?refresh=true to force a recount.
    """
    if not refresh:
        cached = _cache_get("dashboard")
        if cached is not None:
            return {**cached, "cached": True}
    today = datetime.now(timezone.utc).date()
    month_ago = today - timedelta(days=30)

    in_progress = db.query(om.InternshipProgress).filter(
        om.InternshipProgress.actual_end_date.is_(None),
        om.InternshipProgress.joining_date.isnot(None),
    ).count()
    completed = db.query(om.InternshipProgress).filter(
        om.InternshipProgress.actual_end_date.isnot(None)
    ).count()

    # Registrations per day for the last 30 days, for the trend chart.
    trend_rows = (
        db.query(func.date(am.User.created_at).label("day"), func.count().label("n"))
        .filter(am.User.role == am.ROLE_STUDENT)
        .filter(func.date(am.User.created_at) >= month_ago)
        .group_by("day").order_by("day").all()
    )

    top_colleges = (
        db.query(am.StudentProfile.college_name, func.count().label("n"))
        .filter(am.StudentProfile.college_name.isnot(None))
        .filter(am.StudentProfile.college_name != "")
        .group_by(am.StudentProfile.college_name)
        .order_by(func.count().desc()).limit(5).all()
    )

    top_companies = (
        db.query(am.Company.name, func.count(am.Application.id).label("n"))
        .join(am.Internship, am.Internship.company_id == am.Company.id)
        .join(am.Application, am.Application.internship_id == am.Internship.id)
        .group_by(am.Company.name)
        .order_by(func.count(am.Application.id).desc()).limit(5).all()
    )

    recent = (
        db.query(om.AuditLog)
        .order_by(om.AuditLog.created_at.desc()).limit(10).all()
    )

    payload = {
        "totals": {
            "students": db.query(am.User).filter(am.User.role == am.ROLE_STUDENT).count(),
            "companies": db.query(am.Company).count(),
            "colleges": db.query(am.College).count(),
            "active_internships": db.query(am.Internship)
                .filter(am.Internship.status == am.INTERNSHIP_ACTIVE).count(),
            "applications": db.query(am.Application).count(),
            # Same definition of "placed" the reports use, so the dashboard and
            # the placement report cannot disagree.
            "students_placed": db.query(am.Application)
                .filter(am.Application.status.in_(am.PLACED_STATUSES)).count(),
            "in_progress": in_progress,
            "completed": completed,
            "certificates_issued": db.query(om.Certificate)
                .filter(om.Certificate.status == "issued").count(),
        },
        "pending_approvals": {
            "companies": db.query(am.Company)
                .filter(am.Company.is_verified.is_(False)).count(),
            "colleges": db.query(am.College)
                .filter(am.College.partnership_status == "pending").count(),
            "internships": db.query(am.Internship)
                .filter(am.Internship.status == am.INTERNSHIP_DRAFT).count(),
            "documents": db.query(om.Document)
                .filter(om.Document.is_verified.is_(False)).count(),
            "certificates": db.query(om.Certificate)
                .filter(om.Certificate.status == "pending").count(),
        },
        "new_registrations_today": db.query(am.User)
            .filter(am.User.role == am.ROLE_STUDENT)
            .filter(func.date(am.User.created_at) == today).count(),
        "registration_trend": [
            {"date": str(r.day), "count": r.n} for r in trend_rows
        ],
        "top_colleges": [{"name": n, "students": c} for n, c in top_colleges],
        "top_companies": [{"name": n, "applications": c} for n, c in top_companies],
        "recent_activity": [
            {
                "action": a.action, "entity": a.entity_type, "entity_id": a.entity_id,
                "summary": a.summary, "actor": a.actor_email,
                "at": a.created_at,
            }
            for a in recent
        ],
    }

    _cache_put("dashboard", payload)
    return {**payload, "cached": False}


# ===========================================================================
# 12. USER MANAGEMENT -- roles & permissions
# ===========================================================================

class PermissionUpdate(BaseModel):
    role: str
    resource: str
    action: str
    allowed: bool


@router.get("/permissions", response_model=None)
def list_permissions(
    user: am.User = Depends(perm.require_permission(om.RES_USERS, om.ACT_VIEW)),
    db: Session = Depends(get_db),
):
    rows = db.query(om.RolePermission).order_by(
        om.RolePermission.role, om.RolePermission.resource, om.RolePermission.action
    ).all()
    matrix: dict[str, dict[str, list[str]]] = {}
    for r in rows:
        if r.allowed:
            matrix.setdefault(r.role, {}).setdefault(r.resource, []).append(r.action)
    return {
        "roles": list(om.ALL_ROLES),
        "resources": list(om.RESOURCES),
        "actions": list(om.ACTIONS),
        "matrix": matrix,
        "note": "super_admin bypasses this table and always has full access.",
    }


@router.patch("/permissions", response_model=None)
def update_permission(
    payload: PermissionUpdate,
    request: Request,
    user: am.User = Depends(perm.require_permission(om.RES_USERS, om.ACT_EDIT)),
    db: Session = Depends(get_db),
):
    if payload.role not in om.ALL_ROLES:
        raise HTTPException(400, f"Unknown role: {payload.role}")
    if payload.resource not in om.RESOURCES:
        raise HTTPException(400, f"Unknown resource: {payload.resource}")
    if payload.action not in om.ACTIONS:
        raise HTTPException(400, f"Unknown action: {payload.action}")
    # Guard against locking every administrator out of the system.
    if payload.role in (om.ROLE_SUPER_ADMIN, om.ROLE_ADMIN):
        raise HTTPException(400, "super_admin permissions cannot be edited")

    row = db.query(om.RolePermission).filter(
        om.RolePermission.role == payload.role,
        om.RolePermission.resource == payload.resource,
        om.RolePermission.action == payload.action,
    ).first()

    if row:
        row.allowed = payload.allowed
    else:
        db.add(om.RolePermission(
            role=payload.role, resource=payload.resource,
            action=payload.action, allowed=payload.allowed,
        ))
    db.commit()

    perm.record_audit(
        db, user, "permission_updated", "role_permission", None,
        summary=f"{payload.role}: {payload.action} {payload.resource} -> {payload.allowed}",
        request=request,
    )
    return {"status": "ok"}


@router.get("/me/permissions", response_model=None)
def my_permissions(
    user: am.User = Depends(perm.require_staff),
    db: Session = Depends(get_db),
):
    """Lets the portal UI hide menu items the signed-in user cannot use."""
    if perm.is_super_admin(user):
        return {
            "role": user.role,
            "super_admin": True,
            "permissions": {r: list(om.ACTIONS) for r in om.RESOURCES},
        }
    rows = db.query(om.RolePermission).filter(
        om.RolePermission.role == user.role,
        om.RolePermission.allowed.is_(True),
    ).all()
    out: dict[str, list[str]] = {}
    for r in rows:
        out.setdefault(r.resource, []).append(r.action)
    return {
        "role": user.role,
        "super_admin": False,
        "permissions": out,
        "scope": {"company_id": user.company_id, "college_id": user.college_id},
    }


# ===========================================================================
# 19. AUDIT LOGS
# ===========================================================================

@router.get("/audit-logs", response_model=None)
def audit_logs(
    user: am.User = Depends(perm.require_permission(om.RES_AUDIT_LOGS, om.ACT_VIEW)),
    db: Session = Depends(get_db),
    entity_type: Optional[str] = None,
    actor_user_id: Optional[int] = None,
    action: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
):
    q = db.query(om.AuditLog)
    if entity_type:
        q = q.filter(om.AuditLog.entity_type == entity_type)
    if actor_user_id:
        q = q.filter(om.AuditLog.actor_user_id == actor_user_id)
    if action:
        q = q.filter(om.AuditLog.action == action)

    total = q.count()
    rows = (
        q.order_by(om.AuditLog.created_at.desc())
        .offset((page - 1) * page_size).limit(page_size).all()
    )
    return {
        "total": total, "page": page, "page_size": page_size,
        "items": [
            {
                "id": a.id, "action": a.action, "entity_type": a.entity_type,
                "entity_id": a.entity_id, "summary": a.summary, "changes": a.changes,
                "actor_email": a.actor_email, "actor_role": a.actor_role,
                "ip_address": a.ip_address, "created_at": a.created_at,
            }
            for a in rows
        ],
    }


# ===========================================================================
# 18. MASTER DATA
# ===========================================================================

class MasterItemIn(BaseModel):
    category: str
    name: str = Field(min_length=1, max_length=200)
    code: Optional[str] = None
    parent_id: Optional[int] = None
    display_order: int = 0
    is_active: bool = True


@router.get("/master/{category}", response_model=None)
def list_master(
    category: str,
    user: am.User = Depends(perm.require_permission(om.RES_MASTER_DATA, om.ACT_VIEW)),
    db: Session = Depends(get_db),
    include_inactive: bool = False,
):
    if category not in om.MASTER_CATEGORIES:
        raise HTTPException(400, f"Unknown category. Valid: {', '.join(om.MASTER_CATEGORIES)}")
    q = db.query(om.MasterItem).filter(om.MasterItem.category == category)
    if not include_inactive:
        q = q.filter(om.MasterItem.is_active.is_(True))
    return q.order_by(om.MasterItem.display_order, om.MasterItem.name).all()


@router.post("/master", response_model=None, status_code=201)
def create_master(
    payload: MasterItemIn,
    request: Request,
    user: am.User = Depends(perm.require_permission(om.RES_MASTER_DATA, om.ACT_ADD)),
    db: Session = Depends(get_db),
):
    if payload.category not in om.MASTER_CATEGORIES:
        raise HTTPException(400, f"Unknown category. Valid: {', '.join(om.MASTER_CATEGORIES)}")
    existing = db.query(om.MasterItem).filter(
        om.MasterItem.category == payload.category,
        om.MasterItem.name == payload.name,
    ).first()
    if existing:
        raise HTTPException(409, f"'{payload.name}' already exists in {payload.category}")

    row = om.MasterItem(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    perm.record_audit(db, user, "created", "master_item", row.id,
                      summary=f"{payload.category}: {payload.name}", request=request)
    return {"status": "ok", "id": row.id}


@router.delete("/master/{item_id}", response_model=None)
def delete_master(
    item_id: int,
    request: Request,
    user: am.User = Depends(perm.require_permission(om.RES_MASTER_DATA, om.ACT_DELETE)),
    db: Session = Depends(get_db),
):
    row = db.query(om.MasterItem).filter(om.MasterItem.id == item_id).first()
    if not row:
        raise HTTPException(404, "Item not found")
    # Deactivate rather than delete: existing records may reference this value.
    row.is_active = False
    db.commit()
    perm.record_audit(db, user, "deactivated", "master_item", item_id,
                      summary=f"{row.category}: {row.name}", request=request)
    return {"status": "ok", "note": "Deactivated rather than deleted to preserve references."}
