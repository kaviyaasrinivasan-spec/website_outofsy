# app/email_utils.py
"""Transactional email for internship applications.

Uses stdlib smtplib, so no extra dependency. All connection details come from
environment variables (see backend/.env). If SMTP is not configured, sending is
skipped with a warning instead of raising -- an applicant's submission must
never fail because email is misconfigured.

Every send here is called from a FastAPI background task, so a slow or dead mail
server delays nothing the student is waiting on.
"""
import logging
import os
import smtplib
from datetime import datetime
from email.message import EmailMessage
from email.utils import formataddr
from typing import Optional

logger = logging.getLogger(__name__)


def _settings() -> dict:
    """Read the mail settings at call time rather than import time.

    Import-time reads made this module depend on being imported after config
    (which loads .env) -- a fragile ordering that silently produced blank
    credentials if anything imported it first.
    """
    try:
        port = int(os.getenv("SMTP_PORT", "587") or 587)
    except ValueError:
        port = 587
    return {
        "host": os.getenv("SMTP_HOST", "").strip(),
        "port": port,
        "user": os.getenv("SMTP_USER", "").strip(),
        "password": os.getenv("SMTP_PASS", ""),
        "use_tls": os.getenv("SMTP_USE_TLS", "true").strip().lower() == "true",
        "from_addr": os.getenv("MAIL_FROM", "support@outofsyllabuss.org").strip(),
        "from_name": os.getenv("MAIL_FROM_NAME", "Out Of Syllabus").strip(),
    }


def smtp_configured() -> bool:
    s = _settings()
    return bool(s["host"] and s["user"] and s["password"])


def send_email(to_email: str, subject: str, body: str) -> bool:
    """Send one plain-text email. Returns True on success.

    Never raises: callers run this in a background task and only record the
    outcome, because nothing a student does should fail over email.
    """
    if not to_email:
        logger.warning("No recipient address; skipping email %r", subject)
        return False

    s = _settings()
    if not smtp_configured():
        logger.warning(
            "SMTP not configured (need SMTP_HOST, SMTP_USER, SMTP_PASS in "
            "backend/.env); skipping email %r to %s", subject, to_email,
        )
        return False

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = formataddr((s["from_name"], s["from_addr"]))
    msg["To"] = to_email
    msg["Reply-To"] = s["from_addr"]
    msg.set_content(body)

    try:
        if s["port"] == 465:
            with smtplib.SMTP_SSL(s["host"], s["port"], timeout=20) as server:
                server.login(s["user"], s["password"])
                server.send_message(msg)
        else:
            with smtplib.SMTP(s["host"], s["port"], timeout=20) as server:
                server.ehlo()
                if s["use_tls"]:
                    server.starttls()
                    server.ehlo()
                server.login(s["user"], s["password"])
                server.send_message(msg)
        logger.info("Email %r sent to %s", subject, to_email)
        return True
    except Exception as exc:  # noqa: BLE001 - log and report, never propagate
        logger.error("Failed to send %r to %s: %s", subject, to_email, exc)
        return False


def _never_raises(fn):
    """Guard a background sender.

    send_email already swallows SMTP errors, but these run as detached
    background tasks: anything that escaped -- a bad template argument, an
    unexpected None -- would surface as an unhandled ASGI error after the
    response had already gone out. Log it and move on instead.
    """
    def wrapper(*args, **kwargs) -> bool:
        try:
            return fn(*args, **kwargs)
        except Exception as exc:  # noqa: BLE001
            logger.exception("Email task %s failed: %s", fn.__name__, exc)
            return False
    wrapper.__name__ = fn.__name__
    wrapper.__doc__ = fn.__doc__
    return wrapper


def _signature() -> str:
    s = _settings()
    return f"Best regards,\nThe {s['from_name']} Team\n{s['from_addr']}"


def _greeting(full_name: Optional[str]) -> str:
    return f"Dear {full_name.strip()}," if full_name and full_name.strip() else "Hello,"


def _where(title: Optional[str], company: Optional[str]) -> str:
    """'Digital Marketing Intern at The Brand Authority', degrading gracefully."""
    title = title or "the internship"
    return f"{title} at {company}" if company else title


# ===========================================================================
# APPLICATION SUBMITTED
# ===========================================================================

@_never_raises
def send_application_received(
    to_email: str,
    full_name: Optional[str],
    internship_title: Optional[str],
    company_name: Optional[str] = None,
) -> bool:
    """Confirms a submission, so the student knows it actually went through."""
    where = _where(internship_title, company_name)
    body = (
        f"{_greeting(full_name)}\n\n"
        f"Thank you for applying for {where}.\n\n"
        "Your application has been received and is now with our team for review. "
        "We will email you at every stage, so you never have to wonder where it "
        "stands. You can also track it any time from your dashboard.\n\n"
        "If you have any questions, simply reply to this email.\n\n"
        f"{_signature()}\n"
    )
    return send_email(to_email, f"Application received - {internship_title or 'your internship'}", body)


# ===========================================================================
# STATUS CHANGED
# ===========================================================================

# Subject and message per pipeline stage. Keys match APPLICATION_STATUSES, and
# anything missing falls back to a neutral update, so a new stage can never
# leave a student without an email.
_STAGE_EMAILS: dict[str, tuple[str, str]] = {
    "applied": (
        "Application received - {where}",
        "Your application for {where} has been received and is with our team for review.",
    ),
    "shortlisted": (
        "You have been shortlisted - {where}",
        "Good news: you have been shortlisted for {where}.\n\n"
        "Our team will be in touch about the interview. Keep an eye on this inbox.",
    ),
    "interview_scheduled": (
        "Interview scheduled - {where}",
        "Your interview for {where} has been scheduled.\n\n"
        "{interview_line}"
        "Please be available a few minutes early. If the time does not work for "
        "you, reply to this email as soon as you can.",
    ),
    "selected": (
        "You have been selected - {where}",
        "Congratulations. You have been selected for {where}.\n\n"
        "Our team will contact you with the next steps, including the "
        "registration formalities.",
    ),
    "awaiting_registration_fee": (
        "Registration fee pending - {where}",
        "Your place for {where} is being held while we wait for your "
        "registration fee.\n\n"
        "Please complete the payment to confirm it. If you have already paid, "
        "or you are unsure how to, just reply to this email and our team will "
        "help you.",
    ),
    "registration_fee_paid": (
        "Registration confirmed - {where}",
        "We have received your registration for {where}. Your place is confirmed.\n\n"
        "You will receive your joining details before the start date.",
    ),
    "internship_started": (
        "Your internship has started - {where}",
        "Your internship for {where} has now started. All the best.\n\n"
        "Your mentor will guide you through the tasks and reviews. Do reach out "
        "if anything is unclear.",
    ),
    "completed": (
        "Internship completed - {where}",
        "Congratulations on completing your internship for {where}.\n\n"
        "Your certificate is being prepared and we will email you the moment it "
        "is issued.",
    ),
    "certificate_issued": (
        "Your certificate is ready - {where}",
        "Your certificate for {where} has been issued.\n\n"
        "You can download it from your dashboard. Every certificate carries a "
        "verification link an employer can check.",
    ),
    "on_hold": (
        "Your application is on hold - {where}",
        "Your application for {where} is on hold for the moment.\n\n"
        "Nothing has been decided and you do not need to do anything. We will "
        "be in touch as soon as it moves again.",
    ),
    "not_responded": (
        "We are trying to reach you - {where}",
        "We have been trying to reach you about your application for {where} "
        "and have not heard back.\n\n"
        "Please reply to this email so we can carry on. Your application is "
        "still open, and we would rather not close it for want of a reply.",
    ),
    "rejected": (
        "Update on your application - {where}",
        "Thank you for your interest in {where}, and for the time you put into "
        "your application.\n\n"
        "On this occasion we will not be taking it further. Please do apply for "
        "other internships on Out Of Syllabus -- new ones are posted regularly, "
        "and this outcome does not count against you.",
    ),
}

_FALLBACK_EMAIL = (
    "Update on your application - {where}",
    "There is an update on your application for {where}. Its current stage is "
    "\"{stage_label}\".\n\nYou can see the full history on your dashboard.",
)


def stage_label(status: str) -> str:
    """'interview_scheduled' -> 'Interview Scheduled'."""
    return status.replace("_", " ").title() if status else "Updated"


@_never_raises
def send_application_status_change(
    to_email: str,
    full_name: Optional[str],
    internship_title: Optional[str],
    company_name: Optional[str],
    status: str,
    interview_at: Optional[datetime] = None,
    remarks: Optional[str] = None,
) -> bool:
    """Tell the student their application moved, in words that fit the stage."""
    where = _where(internship_title, company_name)
    subject_tpl, body_tpl = _STAGE_EMAILS.get(status, _FALLBACK_EMAIL)

    interview_line = ""
    if interview_at is not None:
        interview_line = f"When: {interview_at.strftime('%d %b %Y at %I:%M %p')}\n\n"

    body = body_tpl.format(
        where=where,
        stage_label=stage_label(status),
        interview_line=interview_line,
    )

    # Remarks are internal by default; only a rejection reason is worth sharing,
    # and only because being told why is better than silence.
    if status == "rejected" and remarks and remarks.strip():
        body += f"\n\nNote from the team: {remarks.strip()}"

    full_body = (
        f"{_greeting(full_name)}\n\n"
        f"{body}\n\n"
        f"{_signature()}\n"
    )
    return send_email(to_email, subject_tpl.format(where=where), full_body)


# ===========================================================================
# PORTAL CREDENTIALS
# ===========================================================================

ROLE_LABELS = {
    "company_hr": "Company HR",
    "college_coordinator": "College Coordinator",
    "mentor": "Mentor",
    "ops_manager": "Operations Manager",
    "ops_executive": "Operations Executive",
    "super_admin": "Administrator",
}


@_never_raises
def send_portal_credentials(
    to_email: str,
    full_name: Optional[str],
    temp_password: str,
    role: str,
    organisation: Optional[str] = None,
) -> bool:
    """Hand a newly provisioned portal user their one-time password.

    The password is only known at creation time -- only its hash is stored -- so
    this is the single chance to deliver it. A failure here is logged, never
    raised: the account already exists either way, and the operations screen
    also shows the password so staff can pass it on by hand.
    """
    from .config import FRONTEND_URL

    role_label = ROLE_LABELS.get(role, role.replace("_", " ").title())
    for_org = f" for {organisation}" if organisation else ""

    body = (
        f"{_greeting(full_name)}\n\n"
        f"A {role_label} account{for_org} has been created for you on the "
        f"Out Of Syllabus portal.\n\n"
        f"Sign in here: {FRONTEND_URL}/login\n\n"
        f"  Email:    {to_email}\n"
        f"  Password: {temp_password}\n\n"
        "This is a temporary password. Please change it immediately after your "
        "first sign-in, and do not share it with anyone.\n\n"
        "If you were not expecting this email, please reply and let us know.\n\n"
        f"{_signature()}\n"
    )
    return send_email(to_email, f"Your {role_label} portal access", body)


# ===========================================================================
# LEGACY: the standalone public internship form (models.InternshipApplication)
# ===========================================================================

INTERNSHIP_SUBJECT = "Application Received - 1-Month Internship Program"


def send_internship_confirmation(to_email: str, full_name: str) -> bool:
    """Confirmation for the standalone /applications/internship form."""
    body = (
        f"{_greeting(full_name)}\n\n"
        "Thank you for applying for the 1-Month Internship Program.\n\n"
        "We have successfully received your application. Our team will review "
        "your details and get in touch with you soon regarding the next steps.\n\n"
        "If you have any questions, feel free to reply to this email.\n\n"
        f"{_signature()}\n"
    )
    return send_email(to_email, INTERNSHIP_SUBJECT, body)
