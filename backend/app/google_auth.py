# app/google_auth.py
"""Google sign-in using the server-side authorization-code flow.

The browser never handles a token: Google redirects back to this API, which
exchanges the code server-side and issues the same httpOnly session cookie the
password login uses. That keeps one session model for the whole app.
"""
import logging
import secrets
import urllib.parse

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from . import auth_models as am
from . import security
from .config import (
    COOKIE_SAMESITE,
    COOKIE_SECURE,
    FRONTEND_URL,
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_ENABLED,
    GOOGLE_REDIRECT_URI,
)
from .database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth/google", tags=["auth"])

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"

# Non-sensitive scopes only. Anything beyond these would push the Google Cloud
# project into a verification review that takes weeks to clear.
SCOPES = "openid email profile"

# Where a signup that still owes us the register-form details is sent. The
# frontend renders this route in "finish your details" mode.
ONBOARDING_PATH = "/register"

STATE_COOKIE = "oos_oauth_state"
NEXT_COOKIE = "oos_oauth_next"
STATE_TTL_SECONDS = 600  # 10 minutes to complete the round trip


def _fail(reason: str) -> RedirectResponse:
    """Send the user back to the login page with a readable message.

    Returning raw JSON here would dump an API error into the address bar.
    """
    return RedirectResponse(
        f"{FRONTEND_URL}/login?error={urllib.parse.quote(reason)}",
        status_code=status.HTTP_302_FOUND,
    )


def _safe_next(raw: str | None) -> str:
    """Only allow same-site relative paths, so `next` can't be used as an
    open redirect to an attacker's domain."""
    if not raw or not raw.startswith("/") or raw.startswith("//"):
        return "/dashboard"
    return raw


@router.get("/login")
def google_login(request: Request, next: str | None = None):
    """Kick off the flow: set a CSRF state cookie and bounce to Google."""
    if not GOOGLE_ENABLED:
        return _fail("Google sign-in is not configured on this server.")

    state = secrets.token_urlsafe(32)
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": SCOPES,
        "state": state,
        "access_type": "online",
        # Always show the account chooser, so a shared machine doesn't
        # silently sign in as whoever used it last.
        "prompt": "select_account",
    }
    response = RedirectResponse(
        f"{GOOGLE_AUTH_URL}?{urllib.parse.urlencode(params)}",
        status_code=status.HTTP_302_FOUND,
    )
    response.set_cookie(
        STATE_COOKIE, state, max_age=STATE_TTL_SECONDS, httponly=True,
        secure=COOKIE_SECURE, samesite="lax", path="/",
    )
    response.set_cookie(
        NEXT_COOKIE, _safe_next(next), max_age=STATE_TTL_SECONDS, httponly=True,
        secure=COOKIE_SECURE, samesite="lax", path="/",
    )
    return response


@router.get("/callback")
def google_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: Session = Depends(get_db),
):
    if not GOOGLE_ENABLED:
        return _fail("Google sign-in is not configured on this server.")

    # The user pressed Cancel on Google's consent screen.
    if error:
        return _fail("Google sign-in was cancelled.")
    if not code:
        return _fail("Google did not return an authorization code.")

    # CSRF: the state we issued must come back unchanged.
    expected = request.cookies.get(STATE_COOKIE)
    if not expected or not state or not secrets.compare_digest(state, expected):
        return _fail("Sign-in session expired. Please try again.")

    try:
        with httpx.Client(timeout=20) as client:
            token_res = client.post(GOOGLE_TOKEN_URL, data={
                "code": code,
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri": GOOGLE_REDIRECT_URI,
                "grant_type": "authorization_code",
            })
            if token_res.status_code != 200:
                logger.error("Google token exchange failed: %s", token_res.text[:400])
                return _fail("Could not complete Google sign-in. Please try again.")

            access_token = token_res.json().get("access_token")
            if not access_token:
                return _fail("Could not complete Google sign-in. Please try again.")

            info_res = client.get(
                GOOGLE_USERINFO_URL,
                headers={"Authorization": f"Bearer {access_token}"},
            )
            if info_res.status_code != 200:
                logger.error("Google userinfo failed: %s", info_res.text[:400])
                return _fail("Could not read your Google profile. Please try again.")
            info = info_res.json()
    except httpx.HTTPError as exc:
        logger.error("Network error talking to Google: %s", exc)
        return _fail("Could not reach Google. Please try again.")

    email = (info.get("email") or "").lower().strip()
    google_sub = info.get("sub")
    full_name = (info.get("name") or "").strip() or (email.split("@")[0] if email else "Student")
    picture = info.get("picture")

    if not email or not google_sub:
        return _fail("Google did not share an email address with us.")

    # Refuse unverified Google addresses -- otherwise someone could claim an
    # email they do not control and take over a password account by linking.
    if info.get("email_verified") is not True:
        return _fail("Your Google email address is not verified.")

    # Match on the stable subject id first, then fall back to email so an
    # existing password account links instead of duplicating.
    user = db.query(am.User).filter(am.User.google_sub == google_sub).first()
    if not user:
        user = db.query(am.User).filter(am.User.email == email).first()

    if user:
        if user.status == am.STATUS_SUSPENDED:
            return _fail("This account has been suspended.")
        if not user.google_sub:
            user.google_sub = google_sub          # link on first Google login
        user.email_verified = True
        db.commit()
    else:
        user = am.User(
            email=email,
            # Unusable placeholder: password_set=False blocks password login
            # until the student deliberately sets one.
            password_hash=security.hash_password(secrets.token_urlsafe(32)),
            password_set=False,
            role=am.ROLE_STUDENT,
            status=am.STATUS_ACTIVE,
            email_verified=True,
            google_sub=google_sub,
            # Google gave us a name and an email; the rest of the register form
            # is still unanswered, so this signup is not finished yet.
            onboarding_completed=False,
        )
        db.add(user)
        db.flush()

        db.add(am.StudentProfile(
            user_id=user.id, full_name=full_name, photo_url=picture,
        ))
        # Import here to avoid a circular import at module load.
        from .auth_routes import _generate_member_id
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

    destination = _safe_next(request.cookies.get(NEXT_COOKIE))

    # A signup that has not been through the details form yet goes to that form
    # instead of straight into the app. `next` rides along so finishing there
    # still lands them where they were originally headed.
    if user.onboarding_completed is False:
        destination = (
            f"{ONBOARDING_PATH}?next={urllib.parse.quote(destination, safe='/')}"
        )

    response = RedirectResponse(
        f"{FRONTEND_URL}{destination}", status_code=status.HTTP_302_FOUND
    )
    security.create_session(db, user, request, response)
    response.delete_cookie(STATE_COOKIE, path="/")
    response.delete_cookie(NEXT_COOKIE, path="/")
    return response


@router.get("/status", response_model=None)
def google_status():
    """Lets the frontend hide the button when SSO isn't configured."""
    return {"enabled": GOOGLE_ENABLED}
