# app/auth_routes.py
"""Student registration, login, logout, and session inspection."""
import logging
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from . import auth_models as am
from . import auth_schemas as asch
from . import security
from .config import SESSION_COOKIE_NAME
from .database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


def _generate_member_id(db: Session) -> str:
    """Human-friendly membership number, e.g. OOS-7F3A9C21."""
    for _ in range(10):
        candidate = f"OOS-{secrets.token_hex(4).upper()}"
        exists = db.query(am.Membership).filter(am.Membership.member_id == candidate).first()
        if not exists:
            return candidate
    raise RuntimeError("Could not allocate a unique member id")


def _to_response(db: Session, user: am.User) -> asch.UserResponse:
    profile = (
        db.query(am.StudentProfile).filter(am.StudentProfile.user_id == user.id).first()
    )
    membership = db.query(am.Membership).filter(am.Membership.user_id == user.id).first()
    return asch.UserResponse(
        id=user.id,
        email=user.email,
        role=user.role,
        status=user.status,
        email_verified=user.email_verified,
        name=profile.full_name if profile else None,
        member_id=membership.member_id if membership else None,
        created_at=user.created_at,
        # A row added before this column existed reads as NULL, which is not a
        # valid bool -- treat it as done, same as the model default.
        onboarding_completed=user.onboarding_completed is not False,
    )


@router.post("/register", response_model=asch.UserResponse, status_code=status.HTTP_201_CREATED)
def register(
    payload: asch.RegisterRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    email = payload.email.lower().strip()

    if db.query(am.User).filter(am.User.email == email).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")

    problems = security.password_problems(payload.password)
    if problems:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Password must contain {', '.join(problems)}",
        )

    user = am.User(
        email=email,
        password_hash=security.hash_password(payload.password),
        role=am.ROLE_STUDENT,
        status=am.STATUS_ACTIVE,
    )
    db.add(user)
    db.flush()  # assign user.id without ending the transaction

    db.add(am.StudentProfile(
        user_id=user.id,
        full_name=payload.full_name,
        phone=payload.phone,
        college_name=payload.college_name,
        course=payload.course,
    ))

    # Every registered student becomes an OOS Member on signup.
    db.add(am.Membership(user_id=user.id, member_id=_generate_member_id(db)))

    db.add(am.Notification(
        user_id=user.id,
        title="Welcome to Out Of Syllabus!",
        body="You're now an OOS Member. Complete your profile to get better "
             "internship recommendations.",
        kind="general",
        link="/dashboard/profile",
    ))

    db.commit()
    db.refresh(user)

    security.create_session(db, user, request, response)
    return _to_response(db, user)


@router.post("/complete-profile", response_model=asch.UserResponse)
def complete_profile(
    payload: asch.CompleteProfileRequest,
    user: am.User = Depends(security.get_current_user),
    db: Session = Depends(get_db),
):
    """Second half of a Google signup.

    Google hands us a name and an email; everything else on the register form
    still has to be collected, so the account is only marked onboarded once
    this succeeds.
    """
    if payload.password:
        problems = security.password_problems(payload.password)
        if problems:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"Password must contain {', '.join(problems)}",
            )
        user.password_hash = security.hash_password(payload.password)
        user.password_set = True

    profile = (
        db.query(am.StudentProfile).filter(am.StudentProfile.user_id == user.id).first()
    )
    if not profile:
        profile = am.StudentProfile(user_id=user.id, full_name=payload.full_name)
        db.add(profile)

    profile.full_name = payload.full_name
    profile.phone = payload.phone
    profile.college_name = payload.college_name
    profile.course = payload.course

    # A Google account is created without a membership only if the callback
    # failed midway; issuing one here keeps every student an OOS Member.
    if not db.query(am.Membership).filter(am.Membership.user_id == user.id).first():
        db.add(am.Membership(user_id=user.id, member_id=_generate_member_id(db)))

    user.onboarding_completed = True
    db.commit()
    db.refresh(user)

    return _to_response(db, user)


@router.post("/login", response_model=asch.UserResponse)
def login(
    payload: asch.LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    email = payload.email.lower().strip()
    user = db.query(am.User).filter(am.User.email == email).first()

    # Identical message and comparable work whether or not the account exists,
    # so this cannot be used to enumerate registered emails.
    if not user or not security.verify_password(payload.password, user.password_hash):
        if not user:
            security.hash_password(payload.password)  # equalise timing
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect email or password")

    if user.status == am.STATUS_SUSPENDED:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account has been suspended")

    user.last_login_at = datetime.now(timezone.utc)
    db.commit()

    security.create_session(db, user, request, response)
    return _to_response(db, user)


@router.post("/logout", response_model=asch.MessageResponse)
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if token:
        security.revoke_session(db, token)
    security.clear_session_cookie(response)
    return asch.MessageResponse(status="ok", message="Signed out")


@router.get("/me", response_model=asch.UserResponse)
def me(user: am.User = Depends(security.get_current_user), db: Session = Depends(get_db)):
    return _to_response(db, user)


@router.get("/session", response_model=None)
def session_status(
    user: am.User | None = Depends(security.get_current_user_optional),
    db: Session = Depends(get_db),
):
    """Never 401s -- lets the frontend boot without treating logged-out as an error."""
    if not user:
        return {"authenticated": False, "user": None}
    return {"authenticated": True, "user": _to_response(db, user).model_dump(mode="json")}


@router.post("/change-password", response_model=asch.MessageResponse)
def change_password(
    payload: asch.ChangePasswordRequest,
    user: am.User = Depends(security.get_current_user),
    db: Session = Depends(get_db),
):
    if not security.verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Current password is incorrect")

    problems = security.password_problems(payload.new_password)
    if problems:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Password must contain {', '.join(problems)}",
        )

    user.password_hash = security.hash_password(payload.new_password)

    # Changing a password kills every other session for that account.
    db.query(am.UserSession).filter(
        am.UserSession.user_id == user.id,
        am.UserSession.revoked_at.is_(None),
    ).update({am.UserSession.revoked_at: datetime.now(timezone.utc)})
    db.commit()

    return asch.MessageResponse(status="ok", message="Password updated. Please sign in again.")
