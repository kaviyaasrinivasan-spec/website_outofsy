# app/permissions.py
"""Role-based access control and audit logging."""
import json
import logging
from typing import Any, Optional

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from . import auth_models as am
from . import ops_models as om
from .database import get_db
from .security import get_current_user

logger = logging.getLogger(__name__)

# Default matrix, seeded into role_permissions on first run. Operations staff
# can then edit it from the Roles & Permissions screen.
#
# super_admin is intentionally absent: it bypasses the table, so a mistaken
# edit can never lock every administrator out of the system.
DEFAULT_PERMISSIONS: dict[str, dict[str, tuple[str, ...]]] = {
    om.ROLE_OPS_MANAGER: {
        om.RES_STUDENTS:       om.ACTIONS,
        om.RES_COMPANIES:      om.ACTIONS,
        om.RES_COLLEGES:       om.ACTIONS,
        om.RES_INTERNSHIPS:    om.ACTIONS,
        om.RES_APPLICATIONS:   om.ACTIONS,
        om.RES_PROGRESS:       om.ACTIONS,
        om.RES_CERTIFICATES:   om.ACTIONS,
        om.RES_DOCUMENTS:      om.ACTIONS,
        om.RES_REPORTS:        (om.ACT_VIEW, om.ACT_EXPORT),
        om.RES_COMMUNICATIONS: (om.ACT_VIEW, om.ACT_ADD),
        om.RES_MASTER_DATA:    om.ACTIONS,
        om.RES_AUDIT_LOGS:     (om.ACT_VIEW, om.ACT_EXPORT),
        om.RES_USERS:          (om.ACT_VIEW, om.ACT_ADD, om.ACT_EDIT),
    },
    # Executives run day-to-day operations but cannot delete or manage users.
    om.ROLE_OPS_EXECUTIVE: {
        om.RES_STUDENTS:       (om.ACT_VIEW, om.ACT_ADD, om.ACT_EDIT, om.ACT_EXPORT),
        om.RES_COMPANIES:      (om.ACT_VIEW, om.ACT_ADD, om.ACT_EDIT),
        om.RES_COLLEGES:       (om.ACT_VIEW, om.ACT_ADD, om.ACT_EDIT),
        om.RES_INTERNSHIPS:    (om.ACT_VIEW, om.ACT_ADD, om.ACT_EDIT),
        om.RES_APPLICATIONS:   (om.ACT_VIEW, om.ACT_EDIT, om.ACT_APPROVE),
        om.RES_PROGRESS:       (om.ACT_VIEW, om.ACT_ADD, om.ACT_EDIT),
        om.RES_CERTIFICATES:   (om.ACT_VIEW, om.ACT_ADD),
        om.RES_DOCUMENTS:      (om.ACT_VIEW, om.ACT_ADD, om.ACT_EDIT),
        om.RES_REPORTS:        (om.ACT_VIEW, om.ACT_EXPORT),
        om.RES_COMMUNICATIONS: (om.ACT_VIEW, om.ACT_ADD),
        om.RES_MASTER_DATA:    (om.ACT_VIEW,),
    },
    # Company HR sees only their own company's data -- enforced by scoping
    # (see scope_company_id) as well as by these permissions.
    om.ROLE_COMPANY_HR: {
        # view/edit only reaches their OWN company -- scope_company_id filters
        # the rows. No add/delete: companies are created by operations staff.
        om.RES_COMPANIES:    (om.ACT_VIEW, om.ACT_EDIT),
        om.RES_INTERNSHIPS:  (om.ACT_VIEW, om.ACT_ADD, om.ACT_EDIT),
        om.RES_APPLICATIONS: (om.ACT_VIEW, om.ACT_EDIT, om.ACT_APPROVE),
        om.RES_PROGRESS:     (om.ACT_VIEW, om.ACT_EDIT),
        om.RES_STUDENTS:     (om.ACT_VIEW,),
        om.RES_DOCUMENTS:    (om.ACT_VIEW,),
        om.RES_REPORTS:      (om.ACT_VIEW,),
    },
    om.ROLE_COLLEGE_COORDINATOR: {
        # Same pattern: their own college only, via scope_college_id.
        om.RES_COLLEGES:     (om.ACT_VIEW, om.ACT_EDIT),
        om.RES_STUDENTS:     (om.ACT_VIEW, om.ACT_ADD, om.ACT_EDIT, om.ACT_EXPORT),
        om.RES_APPLICATIONS: (om.ACT_VIEW,),
        om.RES_PROGRESS:     (om.ACT_VIEW,),
        om.RES_REPORTS:      (om.ACT_VIEW, om.ACT_EXPORT),
        om.RES_DOCUMENTS:    (om.ACT_VIEW, om.ACT_ADD),
    },
    om.ROLE_MENTOR: {
        om.RES_PROGRESS:     (om.ACT_VIEW, om.ACT_EDIT),
        om.RES_APPLICATIONS: (om.ACT_VIEW,),
        om.RES_STUDENTS:     (om.ACT_VIEW,),
    },
    # Students use the public student API, not the operations portal.
    om.ROLE_STUDENT: {},
}


def is_super_admin(user: am.User) -> bool:
    return user.role in (om.ROLE_SUPER_ADMIN, om.ROLE_ADMIN)


def has_permission(db: Session, user: am.User, resource: str, action: str) -> bool:
    if is_super_admin(user):
        return True
    row = (
        db.query(om.RolePermission)
        .filter(
            om.RolePermission.role == user.role,
            om.RolePermission.resource == resource,
            om.RolePermission.action == action,
        )
        .first()
    )
    return bool(row and row.allowed)


def require_permission(resource: str, action: str):
    """Guard factory: `Depends(require_permission(RES_STUDENTS, ACT_EDIT))`."""
    def dependency(
        user: am.User = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> am.User:
        if not has_permission(db, user, resource, action):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                f"Your role ({user.role}) cannot {action} {resource.replace('_', ' ')}",
            )
        return user
    return dependency


def require_staff(user: am.User = Depends(get_current_user)) -> am.User:
    """Any operations-portal login (excludes students)."""
    if user.role == om.ROLE_STUDENT:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Operations portal access required")
    return user


def scope_company_id(user: am.User) -> Optional[int]:
    """Company HR must only ever see their own company's records.

    Returns the company id to filter by, or None when the user is unrestricted.
    Callers MUST apply this -- permissions alone do not scope rows.
    """
    if user.role == om.ROLE_COMPANY_HR:
        return user.company_id
    return None


def scope_college_id(user: am.User) -> Optional[int]:
    if user.role == om.ROLE_COLLEGE_COORDINATOR:
        return user.college_id
    return None


# --- audit ------------------------------------------------------------------

def record_audit(
    db: Session,
    actor: Optional[am.User],
    action: str,
    entity_type: str | None = None,
    entity_id: int | None = None,
    summary: str | None = None,
    changes: dict[str, Any] | None = None,
    request: Request | None = None,
    commit: bool = True,
) -> None:
    """Write an audit row.

    Failures are swallowed: losing an audit line is bad, but failing the
    operation the user actually asked for would be worse.
    """
    try:
        entry = om.AuditLog(
            actor_user_id=actor.id if actor else None,
            actor_email=actor.email if actor else None,
            actor_role=actor.role if actor else None,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            summary=summary,
            changes=json.dumps(changes, default=str) if changes else None,
            ip_address=(request.client.host if request and request.client else None),
            user_agent=((request.headers.get("user-agent") or "")[:300] if request else None),
        )
        db.add(entry)
        if commit:
            db.commit()
    except Exception as exc:  # noqa: BLE001
        logger.error("Failed to write audit log (%s %s): %s", action, entity_type, exc)


def diff_changes(before: dict[str, Any], after: dict[str, Any]) -> dict[str, list[Any]]:
    """{field: [old, new]} for fields that actually changed."""
    out: dict[str, list[Any]] = {}
    for key, new_value in after.items():
        old_value = before.get(key)
        if old_value != new_value:
            out[key] = [old_value, new_value]
    return out


def seed_default_permissions(db: Session) -> int:
    """Insert any missing default permission rows. Never overwrites edits."""
    existing = {
        (r.role, r.resource, r.action)
        for r in db.query(om.RolePermission).all()
    }
    added = 0
    for role, resources in DEFAULT_PERMISSIONS.items():
        for resource, actions in resources.items():
            for action in actions:
                if (role, resource, action) not in existing:
                    db.add(om.RolePermission(
                        role=role, resource=resource, action=action, allowed=True,
                    ))
                    added += 1
    if added:
        db.commit()
    return added
