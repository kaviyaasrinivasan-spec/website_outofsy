# app/security.py
"""Password hashing, session issuing/validation, and role-based guards."""
import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, Request, Response, status
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from . import auth_models as am
from .config import (
    COOKIE_SAMESITE,
    COOKIE_SECURE,
    SESSION_COOKIE_NAME,
    SESSION_TTL_DAYS,
)  # noqa: F401
from .database import get_db

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# --- passwords --------------------------------------------------------------

def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return pwd_context.verify(plain, hashed)
    except Exception:
        return False


def password_problems(pw: str) -> list[str]:
    """Return a list of reasons the password is unacceptable (empty == fine)."""
    problems = []
    if len(pw) < 8:
        problems.append("at least 8 characters")
    if not any(c.isalpha() for c in pw):
        problems.append("at least one letter")
    if not any(c.isdigit() for c in pw):
        problems.append("at least one number")
    return problems


# --- sessions ---------------------------------------------------------------

def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_session(db: Session, user: am.User, request: Request, response: Response) -> str:
    """Issue a session and set it as an httpOnly cookie.

    The raw token goes to the browser; only its hash is persisted.
    """
    raw_token = secrets.token_urlsafe(48)
    expires = datetime.now(timezone.utc) + timedelta(days=SESSION_TTL_DAYS)

    row = am.UserSession(
        user_id=user.id,
        token_hash=_hash_token(raw_token),
        expires_at=expires,
        user_agent=(request.headers.get("user-agent") or "")[:300],
        ip_address=(request.client.host if request.client else "")[:64],
    )
    db.add(row)
    db.commit()

    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=raw_token,
        max_age=SESSION_TTL_DAYS * 24 * 3600,
        httponly=True,            # not readable by JavaScript -- blunts XSS
        secure=COOKIE_SECURE,     # true once served over HTTPS
        samesite=COOKIE_SAMESITE,
        path="/",
    )
    return raw_token


def revoke_session(db: Session, raw_token: str) -> None:
    row = (
        db.query(am.UserSession)
        .filter(am.UserSession.token_hash == _hash_token(raw_token))
        .first()
    )
    if row and row.revoked_at is None:
        row.revoked_at = datetime.now(timezone.utc)
        db.commit()


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(key=SESSION_COOKIE_NAME, path="/")


def _lookup_session_user(db: Session, raw_token: str):
    row = (
        db.query(am.UserSession)
        .filter(am.UserSession.token_hash == _hash_token(raw_token))
        .first()
    )
    if not row or row.revoked_at is not None:
        return None

    expires = row.expires_at
    if expires.tzinfo is None:                      # SQLite hands back naive datetimes
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < datetime.now(timezone.utc):
        return None

    user = db.query(am.User).filter(am.User.id == row.user_id).first()
    if not user or user.status == am.STATUS_SUSPENDED:
        return None
    return user


# --- dependencies -----------------------------------------------------------

def get_current_user_optional(request: Request, db: Session = Depends(get_db)):
    """Current user, or None. For endpoints that vary by auth but don't demand it."""
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if not token:
        return None
    return _lookup_session_user(db, token)


def get_current_user(request: Request, db: Session = Depends(get_db)) -> am.User:
    """Current user, or 401."""
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    user = _lookup_session_user(db, token)
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired or invalid")
    return user


def require_roles(*roles: str):
    """Guard factory: `Depends(require_roles(ROLE_COMPANY))`.

    403 on wrong role. Accounts still awaiting approval are also refused, so an
    unapproved company cannot post internships.
    """
    def dependency(user: am.User = Depends(get_current_user)) -> am.User:
        if user.role not in roles:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                "You do not have permission to perform this action",
            )
        return user

    return dependency


# Common guards
require_student = require_roles(am.ROLE_STUDENT)
require_admin = require_roles(am.ROLE_ADMIN)
