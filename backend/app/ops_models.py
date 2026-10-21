# app/ops_models.py
"""Operations-portal entities: RBAC, audit logging, documents, certificates,
internship progress, and master data.

Deliberately NOT included: an `aadhaar_number` column. Storing Aadhaar numbers
carries specific obligations under the Aadhaar Act and the DPDP Act, and it is
not something to add casually to a student database. See the notes in the
Document model for the compliant alternative.
"""
from sqlalchemy import (
    Column, Integer, String, Text, DateTime, Boolean, ForeignKey, Date,
    UniqueConstraint, Index, Numeric,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from .database import Base

# --- roles ------------------------------------------------------------------
ROLE_SUPER_ADMIN = "super_admin"
ROLE_OPS_MANAGER = "ops_manager"
ROLE_OPS_EXECUTIVE = "ops_executive"
ROLE_COMPANY_HR = "company_hr"
ROLE_COLLEGE_COORDINATOR = "college_coordinator"
ROLE_MENTOR = "mentor"
ROLE_STUDENT = "student"

# Kept for backwards compatibility with accounts created before the ops portal;
# treated as super_admin at permission-check time.
ROLE_ADMIN = "admin"

STAFF_ROLES = (
    ROLE_SUPER_ADMIN, ROLE_OPS_MANAGER, ROLE_OPS_EXECUTIVE, ROLE_ADMIN,
)
ALL_ROLES = STAFF_ROLES + (
    ROLE_COMPANY_HR, ROLE_COLLEGE_COORDINATOR, ROLE_MENTOR, ROLE_STUDENT,
)

# --- permission vocabulary --------------------------------------------------
RES_STUDENTS = "students"
RES_COMPANIES = "companies"
RES_COLLEGES = "colleges"
RES_INTERNSHIPS = "internships"
RES_APPLICATIONS = "applications"
RES_PROGRESS = "progress"
RES_CERTIFICATES = "certificates"
RES_DOCUMENTS = "documents"
RES_REPORTS = "reports"
RES_COMMUNICATIONS = "communications"
RES_USERS = "users"
RES_MASTER_DATA = "master_data"
RES_AUDIT_LOGS = "audit_logs"
RES_SETTINGS = "settings"

RESOURCES = (
    RES_STUDENTS, RES_COMPANIES, RES_COLLEGES, RES_INTERNSHIPS, RES_APPLICATIONS,
    RES_PROGRESS, RES_CERTIFICATES, RES_DOCUMENTS, RES_REPORTS,
    RES_COMMUNICATIONS, RES_USERS, RES_MASTER_DATA, RES_AUDIT_LOGS, RES_SETTINGS,
)

ACT_VIEW = "view"
ACT_ADD = "add"
ACT_EDIT = "edit"
ACT_DELETE = "delete"
ACT_EXPORT = "export"
ACT_APPROVE = "approve"

ACTIONS = (ACT_VIEW, ACT_ADD, ACT_EDIT, ACT_DELETE, ACT_EXPORT, ACT_APPROVE)


class RolePermission(Base):
    """Which role may do what.

    Stored in the database rather than hard-coded so the Roles & Permissions
    screen can edit it without a deploy. super_admin bypasses this table
    entirely -- otherwise a bad edit could lock everyone out.
    """
    __tablename__ = "role_permissions"
    __table_args__ = (
        UniqueConstraint("role", "resource", "action", name="uq_role_resource_action"),
    )

    id = Column(Integer, primary_key=True, index=True)
    role = Column(String(40), nullable=False, index=True)
    resource = Column(String(40), nullable=False)
    action = Column(String(20), nullable=False)
    allowed = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class AuditLog(Base):
    """Append-only record of who changed what.

    Never updated or deleted by application code -- that is the entire point.
    """
    __tablename__ = "audit_logs"
    __table_args__ = (
        Index("ix_audit_entity", "entity_type", "entity_id"),
        Index("ix_audit_actor_time", "actor_user_id", "created_at"),
    )

    id = Column(Integer, primary_key=True, index=True)
    actor_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), index=True)
    actor_email = Column(String(255))      # denormalised: survives user deletion
    actor_role = Column(String(40))
    action = Column(String(60), nullable=False)     # created / updated / approved / login ...
    entity_type = Column(String(60))                # internship / student / company ...
    entity_id = Column(Integer)
    summary = Column(Text)                          # human-readable one-liner
    changes = Column(Text)                          # JSON blob: {field: [before, after]}
    ip_address = Column(String(64))
    user_agent = Column(String(300))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)


class Mentor(Base):
    """A mentor assigned to supervise interns. May optionally have a login."""
    __tablename__ = "mentors"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), unique=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    full_name = Column(String(200), nullable=False)
    email = Column(String(255), index=True)
    phone = Column(String(50))
    designation = Column(String(150))
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Document(Base):
    """Uploaded files tied to a student, company, or college.

    NOTE ON IDENTITY DOCUMENTS: `kind` may be 'aadhaar', but only the uploaded
    file is retained -- there is deliberately no column for the Aadhaar number
    itself. Storing the number brings it under the Aadhaar Act's handling
    rules; storing a college-issued ID instead avoids that entirely and is the
    recommended default.
    """
    __tablename__ = "documents"
    __table_args__ = (
        Index("ix_documents_owner", "owner_type", "owner_id"),
    )

    id = Column(Integer, primary_key=True, index=True)
    owner_type = Column(String(20), nullable=False)   # student / company / college
    owner_id = Column(Integer, nullable=False)
    kind = Column(String(60), nullable=False)         # resume / college_id / offer_letter ...
    file_url = Column(String(500), nullable=False)
    original_filename = Column(String(300))
    mime_type = Column(String(120))
    size_bytes = Column(Integer)
    is_verified = Column(Boolean, nullable=False, default=False)
    verified_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"))
    verified_at = Column(DateTime(timezone=True))
    uploaded_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class InternshipProgress(Base):
    """Tracking for a student who has actually joined an internship."""
    __tablename__ = "internship_progress"
    __table_args__ = (
        UniqueConstraint("application_id", name="uq_progress_application"),
    )

    id = Column(Integer, primary_key=True, index=True)
    application_id = Column(Integer, ForeignKey("applications.id", ondelete="CASCADE"),
                            nullable=False, index=True)
    mentor_id = Column(Integer, ForeignKey("mentors.id", ondelete="SET NULL"), index=True)
    joining_date = Column(Date)
    expected_end_date = Column(Date)
    actual_end_date = Column(Date)
    days_present = Column(Integer, default=0)
    days_total = Column(Integer, default=0)
    tasks_completed = Column(Integer, default=0)
    tasks_assigned = Column(Integer, default=0)
    completion_percent = Column(Integer, default=0)
    performance_score = Column(Numeric(5, 2))
    mentor_feedback = Column(Text)
    final_evaluation = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class WeeklyReport(Base):
    """A weekly report submitted by an intern."""
    __tablename__ = "weekly_reports"

    id = Column(Integer, primary_key=True, index=True)
    progress_id = Column(Integer, ForeignKey("internship_progress.id", ondelete="CASCADE"),
                         nullable=False, index=True)
    week_number = Column(Integer, nullable=False)
    summary = Column(Text)
    hours_logged = Column(Integer)
    mentor_comment = Column(Text)
    submitted_at = Column(DateTime(timezone=True), server_default=func.now())


class Certificate(Base):
    __tablename__ = "certificates"
    __table_args__ = (
        UniqueConstraint("certificate_number", name="uq_certificate_number"),
    )

    id = Column(Integer, primary_key=True, index=True)
    application_id = Column(Integer, ForeignKey("applications.id", ondelete="CASCADE"),
                            nullable=False, index=True)
    student_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    certificate_number = Column(String(60), nullable=False, index=True)
    # Public token used by the verification page, so the numeric id is never
    # guessable from a certificate.
    verification_code = Column(String(64), nullable=False, unique=True, index=True)
    template_id = Column(Integer, ForeignKey("certificate_templates.id", ondelete="SET NULL"))
    status = Column(String(30), nullable=False, default="pending")  # pending/approved/issued/revoked
    file_url = Column(String(500))
    issued_on = Column(Date)
    approved_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"))
    approved_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class CertificateTemplate(Base):
    __tablename__ = "certificate_templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=False)
    body_html = Column(Text)
    background_url = Column(String(500))
    is_default = Column(Boolean, nullable=False, default=False)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


# --- master data ------------------------------------------------------------

class MasterItem(Base):
    """One table for every simple lookup list.

    Skills, departments, industries, cities, states, countries, universities
    and internship categories are all just (category, name) pairs; nine
    near-identical tables would be nine sets of near-identical CRUD endpoints.
    """
    __tablename__ = "master_items"
    __table_args__ = (
        UniqueConstraint("category", "name", name="uq_master_category_name"),
        Index("ix_master_category_active", "category", "is_active"),
    )

    id = Column(Integer, primary_key=True, index=True)
    category = Column(String(40), nullable=False, index=True)
    name = Column(String(200), nullable=False)
    code = Column(String(60))
    parent_id = Column(Integer, ForeignKey("master_items.id", ondelete="SET NULL"))
    display_order = Column(Integer, default=0)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


MASTER_SKILL = "skill"
MASTER_DEPARTMENT = "department"
MASTER_INDUSTRY = "industry"
MASTER_UNIVERSITY = "university"
MASTER_CITY = "city"
MASTER_STATE = "state"
MASTER_COUNTRY = "country"
MASTER_INTERNSHIP_CATEGORY = "internship_category"

MASTER_CATEGORIES = (
    MASTER_SKILL, MASTER_DEPARTMENT, MASTER_INDUSTRY, MASTER_UNIVERSITY,
    MASTER_CITY, MASTER_STATE, MASTER_COUNTRY, MASTER_INTERNSHIP_CATEGORY,
)


# --- system settings --------------------------------------------------------

class SystemSetting(Base):
    """Key/value configuration editable from the portal.

    Secrets (SMTP password, gateway API keys) are stored here too, but are
    masked on read -- see the settings endpoints. They are never returned in
    full once written.
    """
    __tablename__ = "system_settings"
    __table_args__ = (
        UniqueConstraint("category", "key", name="uq_setting_category_key"),
    )

    id = Column(Integer, primary_key=True, index=True)
    category = Column(String(40), nullable=False, index=True)
    key = Column(String(80), nullable=False)
    value = Column(Text)
    is_secret = Column(Boolean, nullable=False, default=False)
    description = Column(String(300))
    updated_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"))
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


SETTING_EMAIL = "email"
SETTING_SMS = "sms"
SETTING_WHATSAPP = "whatsapp"
SETTING_BRANDING = "branding"
SETTING_LEGAL = "legal"
SETTING_NOTIFICATIONS = "notifications"
SETTING_CERTIFICATE = "certificate"

SETTING_CATEGORIES = (
    SETTING_EMAIL, SETTING_SMS, SETTING_WHATSAPP, SETTING_BRANDING,
    SETTING_LEGAL, SETTING_NOTIFICATIONS, SETTING_CERTIFICATE,
)
