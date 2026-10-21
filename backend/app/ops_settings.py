# app/ops_settings.py
"""Operations portal, section 20: system settings.

Secrets (SMTP password, gateway keys) live in the same table as ordinary
settings but are NEVER returned in full -- reads get a masked placeholder.
Once written, a secret can only be replaced, not retrieved.
"""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from . import auth_models as am
from . import ops_models as om
from . import permissions as perm
from .database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ops", tags=["operations"])

MASK = "********"

# Declared up-front so the settings screen can render before anything has been
# saved, and so we know which keys must be treated as secrets.
SETTING_SCHEMA: dict[str, list[dict]] = {
    om.SETTING_EMAIL: [
        {"key": "smtp_host", "label": "SMTP Host", "secret": False},
        {"key": "smtp_port", "label": "SMTP Port", "secret": False},
        {"key": "smtp_user", "label": "SMTP Username", "secret": False},
        {"key": "smtp_password", "label": "SMTP Password", "secret": True},
        {"key": "smtp_use_tls", "label": "Use TLS", "secret": False},
        {"key": "mail_from", "label": "From Address", "secret": False},
        {"key": "mail_from_name", "label": "From Name", "secret": False},
    ],
    om.SETTING_SMS: [
        {"key": "provider", "label": "SMS Provider", "secret": False},
        {"key": "sender_id", "label": "Sender ID", "secret": False},
        {"key": "api_key", "label": "API Key", "secret": True},
        {"key": "api_secret", "label": "API Secret", "secret": True},
    ],
    om.SETTING_WHATSAPP: [
        {"key": "phone_number_id", "label": "Phone Number ID", "secret": False},
        {"key": "business_account_id", "label": "Business Account ID", "secret": False},
        {"key": "access_token", "label": "Access Token", "secret": True},
    ],
    om.SETTING_BRANDING: [
        {"key": "site_name", "label": "Site Name", "secret": False},
        {"key": "logo_url", "label": "Logo URL", "secret": False},
        {"key": "primary_color", "label": "Primary Colour", "secret": False},
        {"key": "support_email", "label": "Support Email", "secret": False},
        {"key": "support_phone", "label": "Support Phone", "secret": False},
    ],
    om.SETTING_LEGAL: [
        {"key": "terms_html", "label": "Terms & Conditions", "secret": False},
        {"key": "privacy_html", "label": "Privacy Policy", "secret": False},
    ],
    om.SETTING_NOTIFICATIONS: [
        {"key": "notify_on_application", "label": "Notify on new application", "secret": False},
        {"key": "notify_on_status_change", "label": "Notify on status change", "secret": False},
        {"key": "notify_on_certificate", "label": "Notify on certificate issue", "secret": False},
    ],
    om.SETTING_CERTIFICATE: [
        {"key": "signatory_name", "label": "Signatory Name", "secret": False},
        {"key": "signatory_title", "label": "Signatory Title", "secret": False},
        {"key": "verification_base_url", "label": "Verification URL", "secret": False},
    ],
}

_SECRET_KEYS = {
    (cat, f["key"])
    for cat, fields in SETTING_SCHEMA.items()
    for f in fields if f["secret"]
}


class SettingIn(BaseModel):
    category: str
    key: str = Field(min_length=1, max_length=80)
    value: Optional[str] = None

    @field_validator("category")
    @classmethod
    def valid_category(cls, v):
        if v not in om.SETTING_CATEGORIES:
            raise ValueError(f"category must be one of: {', '.join(om.SETTING_CATEGORIES)}")
        return v


@router.get("/settings", response_model=None)
def get_settings(
    user: am.User = Depends(perm.require_permission(om.RES_SETTINGS, om.ACT_VIEW)),
    db: Session = Depends(get_db),
    category: Optional[str] = None,
):
    """Current settings, merged over the declared schema.

    Secret values are replaced with a mask and a `has_value` flag, so the UI
    can show "configured" without ever receiving the credential.
    """
    if category and category not in om.SETTING_CATEGORIES:
        raise HTTPException(400, f"Unknown category. Valid: {', '.join(om.SETTING_CATEGORIES)}")

    stored = {
        (s.category, s.key): s
        for s in db.query(om.SystemSetting).all()
    }

    out: dict[str, list[dict]] = {}
    for cat, fields in SETTING_SCHEMA.items():
        if category and cat != category:
            continue
        entries = []
        for f in fields:
            row = stored.get((cat, f["key"]))
            has_value = bool(row and row.value)
            entries.append({
                "key": f["key"],
                "label": f["label"],
                "secret": f["secret"],
                "has_value": has_value,
                "value": (MASK if (f["secret"] and has_value)
                          else (row.value if row else None)),
                "updated_at": row.updated_at if row else None,
            })
        out[cat] = entries
    return {"categories": out}


@router.put("/settings", response_model=None)
def update_setting(
    payload: SettingIn,
    request: Request,
    user: am.User = Depends(perm.require_permission(om.RES_SETTINGS, om.ACT_EDIT)),
    db: Session = Depends(get_db),
):
    known = {f["key"] for f in SETTING_SCHEMA.get(payload.category, [])}
    if payload.key not in known:
        raise HTTPException(
            400,
            f"Unknown key '{payload.key}' for category '{payload.category}'. "
            f"Valid: {', '.join(sorted(known))}",
        )

    is_secret = (payload.category, payload.key) in _SECRET_KEYS

    # The UI echoes the mask back when a secret field is untouched. Writing it
    # verbatim would replace the real credential with literal asterisks.
    if is_secret and payload.value == MASK:
        return {"status": "ok", "note": "Unchanged (masked value ignored)."}

    row = db.query(om.SystemSetting).filter(
        om.SystemSetting.category == payload.category,
        om.SystemSetting.key == payload.key,
    ).first()

    if row:
        row.value = payload.value
        row.is_secret = is_secret
        row.updated_by_user_id = user.id
    else:
        db.add(om.SystemSetting(
            category=payload.category, key=payload.key, value=payload.value,
            is_secret=is_secret, updated_by_user_id=user.id,
        ))
    db.commit()

    # Never write a secret's value into the audit trail.
    perm.record_audit(
        db, user, "updated", "setting", None,
        summary=(f"{payload.category}.{payload.key} = "
                 f"{'(secret updated)' if is_secret else payload.value}"),
        request=request,
    )
    return {"status": "ok"}


@router.get("/settings/health", response_model=None)
def settings_health(
    user: am.User = Depends(perm.require_permission(om.RES_SETTINGS, om.ACT_VIEW)),
    db: Session = Depends(get_db),
):
    """What is configured and what still is not.

    Reports honestly rather than optimistically -- a channel counts as ready
    only when every credential it needs is present.
    """
    stored = {
        (s.category, s.key): s.value
        for s in db.query(om.SystemSetting).all() if s.value
    }

    def ready(cat: str, keys: list[str]) -> bool:
        return all(stored.get((cat, k)) for k in keys)

    email_ready = ready(om.SETTING_EMAIL, ["smtp_host", "smtp_user", "smtp_password"])
    sms_ready = ready(om.SETTING_SMS, ["provider", "api_key"])
    whatsapp_ready = ready(om.SETTING_WHATSAPP, ["phone_number_id", "access_token"])

    return {
        "channels": {
            "email": {
                "configured": email_ready,
                "note": None if email_ready else
                        "Set smtp_host, smtp_user and smtp_password. No email is "
                        "sent until then -- notifications remain in-app only.",
            },
            "sms": {
                "configured": sms_ready,
                "note": None if sms_ready else "No SMS gateway configured.",
            },
            "whatsapp": {
                "configured": whatsapp_ready,
                "note": None if whatsapp_ready else
                        "WhatsApp Business API access must be approved by Meta "
                        "before this can work -- allow several weeks.",
            },
        },
        "legal": {
            "terms_published": bool(stored.get((om.SETTING_LEGAL, "terms_html"))),
            "privacy_published": bool(stored.get((om.SETTING_LEGAL, "privacy_html"))),
            "note": "Google SSO requires working privacy and terms URLs.",
        },
        "certificates": {
            "signatory_configured": bool(stored.get((om.SETTING_CERTIFICATE, "signatory_name"))),
            "cryptographic_signing": False,
            "note": "PDFs carry a QR verification link. PKCS#7 signing needs an "
                    "X.509 certificate from a CA and is not implemented.",
        },
    }
