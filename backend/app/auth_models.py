# app/auth_models.py
"""Identity, profile, and platform tables for the OOS student platform.

Structure follows the product spec: students are the only role that registers
publicly. Companies and colleges have no login -- they are records managed
through the admin portal, so they are standalone tables with no user_id.
"""
from sqlalchemy import (
    Column, Integer, String, Text, DateTime, Boolean, ForeignKey, Date, Numeric,
    UniqueConstraint, Index,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from .database import Base

# Only these two roles hold accounts. Admins are provisioned, never self-signup.
ROLE_STUDENT = "student"
ROLE_ADMIN = "admin"
ROLES = (ROLE_STUDENT, ROLE_ADMIN)

STATUS_ACTIVE = "active"
STATUS_SUSPENDED = "suspended"

# Internship lifecycle
INTERNSHIP_DRAFT = "draft"
INTERNSHIP_ACTIVE = "active"
INTERNSHIP_PAUSED = "paused"     # temporarily hidden, applicants retained
INTERNSHIP_CLOSED = "closed"

WORK_MODES = ("Remote", "Hybrid", "On-site")

# Application lifecycle -- the 9-stage internship pipeline, in order. This is
# the sequence the operations portal tracks every intern through.
APP_APPLIED = "applied"                             # 1
APP_SHORTLISTED = "shortlisted"                     # 2
APP_INTERVIEW_SCHEDULED = "interview_scheduled"     # 3
APP_SELECTED = "selected"                           # 4
# The holding stage between being selected and paying: the fee has been asked
# for and the team is waiting on the student. Its own stage so the portal can
# see who has been chased and who has not.
APP_AWAITING_FEE = "awaiting_registration_fee"      # 5
APP_FEE_PAID = "registration_fee_paid"              # 6
APP_STARTED = "internship_started"                  # 7
APP_COMPLETED = "completed"                         # 8
APP_CERTIFICATE_ISSUED = "certificate_issued"       # 9

# Off the pipeline, but not the end of the road: an application parked here can
# be resumed at whichever stage it belongs to. Reachable from any live stage,
# because a student can go quiet or need pausing at any point.
APP_ON_HOLD = "on_hold"
APP_NOT_RESPONDED = "not_responded"

# Exits, not lifecycle stages: an application leaves the pipeline here.
APP_REJECTED = "rejected"
APP_WITHDRAWN = "withdrawn"   # student-initiated, from their own dashboard

# The happy path, in order. Kept separate from the exits so the UI can render
# the pipeline as the numbered sequence it is.
PIPELINE_STAGES = (
    APP_APPLIED, APP_SHORTLISTED, APP_INTERVIEW_SCHEDULED,
    APP_SELECTED, APP_AWAITING_FEE, APP_FEE_PAID,
    APP_STARTED, APP_COMPLETED, APP_CERTIFICATE_ISSUED,
)

# Paused rather than finished. Grouped so the UI can offer them together and
# tell them apart from the true endings.
HOLDING_STATUSES = (APP_ON_HOLD, APP_NOT_RESPONDED)

APPLICATION_STATUSES = (
    PIPELINE_STAGES + HOLDING_STATUSES + (APP_REJECTED, APP_WITHDRAWN)
)

# Terminal states -- nothing moves on from here. 'completed' is deliberately
# NOT terminal: the certificate stage still follows it.
TERMINAL_STATUSES = (APP_CERTIFICATE_ISSUED, APP_REJECTED, APP_WITHDRAWN)

# Still moving through the pipeline. Drives the student dashboard's "active
# applications" and the active/history split. Listed explicitly rather than as
# "not terminal", because 'completed' is neither -- the internship is over but
# the certificate is still outstanding.
# The holding states count as active: they are unresolved, and the application
# can still be picked back up.
ACTIVE_APPLICATION_STATUSES = (
    APP_APPLIED, APP_SHORTLISTED, APP_INTERVIEW_SCHEDULED,
    APP_SELECTED, APP_AWAITING_FEE, APP_FEE_PAID, APP_STARTED,
) + HOLDING_STATUSES

# The student has a place: counted as a placement in the reports.
PLACED_STATUSES = (APP_STARTED, APP_COMPLETED, APP_CERTIFICATE_ISSUED)

# One forward step per stage -- the pipeline is strictly sequential, so a stage
# can never be skipped. Rejection is handled separately, being reachable from
# almost anywhere.
#
# The one exception is 'selected', which may go straight to 'registration_fee_paid':
# waiting for the fee is a holding stage for students who have been asked and
# have not paid yet, so a student who pays immediately should not have to be
# parked in it first.
# A held application resumes wherever it left off, which is not knowable from
# the hold itself -- someone put on hold at shortlisting comes back to
# shortlisting, someone held at the fee stage comes back to the fee stage. So
# every stage is a legal target out of a hold, and the portal confirms the
# choice before making it.
ALLOWED_TRANSITIONS: dict[str, tuple[str, ...]] = {
    APP_APPLIED:              (APP_SHORTLISTED,),
    APP_SHORTLISTED:          (APP_INTERVIEW_SCHEDULED,),
    APP_INTERVIEW_SCHEDULED:  (APP_SELECTED,),
    APP_SELECTED:             (APP_AWAITING_FEE, APP_FEE_PAID),
    APP_AWAITING_FEE:         (APP_FEE_PAID,),
    APP_FEE_PAID:             (APP_STARTED,),
    APP_STARTED:              (APP_COMPLETED,),
    APP_COMPLETED:            (APP_CERTIFICATE_ISSUED,),
    APP_CERTIFICATE_ISSUED:   (),
    APP_ON_HOLD:              PIPELINE_STAGES,
    APP_NOT_RESPONDED:        PIPELINE_STAGES,
    APP_REJECTED:             (),
    APP_WITHDRAWN:            (),
}

# Reachable from any non-terminal state. Rejection ends the application; the
# two holds only pause it, and can_transition lets them be left again.
UNIVERSAL_TARGETS = (APP_REJECTED,) + HOLDING_STATUSES


def stage_number(status: str) -> int | None:
    """1-based position in the pipeline, or None for a hold or an exit."""
    return PIPELINE_STAGES.index(status) + 1 if status in PIPELINE_STAGES else None


def can_transition(current: str, target: str) -> bool:
    """Guard the pipeline so an application cannot jump backwards or skip
    stages -- e.g. 'completed' back to 'applied'."""
    if current == target:
        return True
    if current in TERMINAL_STATUSES:
        return False
    if target in UNIVERSAL_TARGETS:
        return True
    return target in ALLOWED_TRANSITIONS.get(current, ())


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), nullable=False, unique=True, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False, default=ROLE_STUDENT, index=True)
    # Contact details for provisioned portal logins -- HR, coordinators, mentors
    # and ops staff, who have no profile table of their own. Students are the
    # exception: their name and phone live on StudentProfile, which stays the
    # source of truth for them, so these are left null.
    full_name = Column(String(200))
    phone = Column(String(50))
    status = Column(String(20), nullable=False, default=STATUS_ACTIVE)
    email_verified = Column(Boolean, nullable=False, default=False)
    # Google's stable subject id. Matching on this rather than email means a
    # Google account that changes its address still resolves to the same user.
    google_sub = Column(String(64), unique=True, index=True)
    # False for accounts created via Google -- they hold an unusable random
    # hash and cannot sign in with a password until they set one.
    password_set = Column(Boolean, nullable=False, default=True)
    # Google gives us only a name and an email, so an account created that way
    # exists before the student has filled in the register form. False keeps
    # them on the details page until they do. Defaults True so password
    # registrations -- and every row that predates this column -- need no
    # special casing.
    onboarding_completed = Column(Boolean, nullable=False, default=True)

    # Row-level scoping for the operations portal. A company_hr user only sees
    # their own company's data; a college_coordinator only their college's.
    # Permissions say *what* a role may do; these say *which rows*.
    company_id = Column(Integer, ForeignKey("companies.id", ondelete="SET NULL"), index=True)
    college_id = Column(Integer, ForeignKey("colleges.id", ondelete="SET NULL"), index=True)
    last_login_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    sessions = relationship("UserSession", back_populates="user", cascade="all, delete-orphan")
    student_profile = relationship("StudentProfile", back_populates="user",
                                   uselist=False, cascade="all, delete-orphan")
    membership = relationship("Membership", back_populates="user",
                              uselist=False, cascade="all, delete-orphan")
    applications = relationship("Application", back_populates="student",
                                cascade="all, delete-orphan")


class UserSession(Base):
    """Server-side sessions.

    The cookie holds a random opaque token; only its SHA-256 hash is stored, so
    a database leak hands out no live sessions. Server-side rows also make
    logout and forced revocation actually work, unlike stateless JWTs.
    """
    __tablename__ = "user_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"),
                     nullable=False, index=True)
    token_hash = Column(String(64), nullable=False, unique=True, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)
    revoked_at = Column(DateTime(timezone=True))
    user_agent = Column(String(300))
    ip_address = Column(String(64))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="sessions")


class StudentProfile(Base):
    __tablename__ = "student_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"),
                     nullable=False, unique=True, index=True)
    full_name = Column(String(200), nullable=False)
    phone = Column(String(50))
    whatsapp_number = Column(String(50))
    college_name = Column(String(300))
    course = Column(String(100))
    current_year = Column(String(50))
    skills = Column(Text)          # comma-separated
    resume_url = Column(String(500))
    linkedin_url = Column(String(500))
    photo_url = Column(String(500))
    city = Column(String(150))
    bio = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="student_profile")

    def compute_completion(self) -> int:
        """Rough profile-completeness score, shown on the dashboard.

        Deliberately NOT named `completion_percent`: the response schema uses
        from_attributes, and a same-named method would be read as the field
        value and fail int validation.
        """
        fields = [
            self.full_name, self.phone, self.college_name, self.course,
            self.current_year, self.skills, self.resume_url, self.city,
        ]
        filled = sum(1 for f in fields if f and str(f).strip())
        return round(filled / len(fields) * 100)


class Membership(Base):
    """Every registered student is an OOS Member."""
    __tablename__ = "memberships"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"),
                     nullable=False, unique=True, index=True)
    member_id = Column(String(30), nullable=False, unique=True, index=True)
    tier = Column(String(30), nullable=False, default="OOS Member")
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True))  # null == no expiry
    is_active = Column(Boolean, nullable=False, default=True)

    user = relationship("User", back_populates="membership")


class Company(Base):
    """Admin-managed. Companies do not log in to the public site."""
    __tablename__ = "companies"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(300), nullable=False, index=True)
    logo_url = Column(String(500))
    about = Column(Text)
    industry = Column(String(150))
    website = Column(String(300))
    location = Column(String(200))
    contact_person = Column(String(200))
    contact_email = Column(String(200))
    contact_phone = Column(String(50))
    gst_number = Column(String(30))
    is_verified = Column(Boolean, nullable=False, default=False)
    is_active = Column(Boolean, nullable=False, default=True)
    rating = Column(Numeric(3, 2))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    internships = relationship("Internship", back_populates="company")


class College(Base):
    """Admin-managed. Colleges do not log in to the public site."""
    __tablename__ = "colleges"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(300), nullable=False, index=True)
    university = Column(String(300))
    college_code = Column(String(60), index=True)
    logo_url = Column(String(500))
    about = Column(Text)
    location = Column(String(200))
    courses_offered = Column(Text)
    departments = Column(Text)
    student_count = Column(Integer)
    website = Column(String(300))
    placement_officer = Column(String(200))
    contact_person = Column(String(200))
    contact_email = Column(String(200))
    contact_phone = Column(String(50))
    partnership_status = Column(String(30), nullable=False, default="pending")
    # Archived colleges keep their row and every link to it, but drop out of the
    # working list. Orthogonal to partnership_status, so archiving does not lose
    # whether the partnership was approved or merely pending.
    is_archived = Column(Boolean, nullable=False, default=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Internship(Base):
    __tablename__ = "internships"
    __table_args__ = (
        Index("ix_internships_status_lastdate", "status", "last_date_to_apply"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id", ondelete="CASCADE"),
                        nullable=False, index=True)
    title = Column(String(300), nullable=False)
    department = Column(String(150), index=True)
    description = Column(Text)
    responsibilities = Column(Text)
    eligibility = Column(Text)
    duration = Column(String(100))                 # e.g. "1 Month", "3 Months"
    start_date = Column(Date)
    end_date = Column(Date)
    work_mode = Column(String(20))                 # Remote / Hybrid / On-site
    location = Column(String(200))
    stipend = Column(String(100))                  # free text: "Unpaid", "5000/month"
    required_skills = Column(Text)                 # comma-separated
    openings = Column(Integer, default=1)
    certificate_available = Column(Boolean, nullable=False, default=True)
    ppo_available = Column(Boolean, nullable=False, default=False)
    last_date_to_apply = Column(DateTime(timezone=True), index=True)
    status = Column(String(20), nullable=False, default=INTERNSHIP_DRAFT, index=True)
    is_featured = Column(Boolean, nullable=False, default=False, index=True)
    # Archived listings keep their row and every application attached, but drop
    # out of the working list and off the public site. Orthogonal to `status`,
    # so archiving does not lose whether it was a draft or a closed posting.
    is_archived = Column(Boolean, nullable=False, default=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    company = relationship("Company", back_populates="internships")
    applications = relationship("Application", back_populates="internship",
                                cascade="all, delete-orphan")


class Application(Base):
    __tablename__ = "applications"
    # One application per student per internship, enforced by the database
    # rather than by application code.
    __table_args__ = (
        UniqueConstraint("student_id", "internship_id", name="uq_application_student_internship"),
    )

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"),
                        nullable=False, index=True)
    internship_id = Column(Integer, ForeignKey("internships.id", ondelete="CASCADE"),
                           nullable=False, index=True)
    status = Column(String(30), nullable=False, default=APP_APPLIED, index=True)
    cover_note = Column(Text)
    resume_url = Column(String(500))               # snapshot at time of applying
    admin_notes = Column(Text)
    interview_at = Column(DateTime(timezone=True))
    applied_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    student = relationship("User", back_populates="applications")
    internship = relationship("Internship", back_populates="applications")


class SavedInternship(Base):
    __tablename__ = "saved_internships"
    __table_args__ = (
        UniqueConstraint("student_id", "internship_id", name="uq_saved_student_internship"),
    )

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"),
                        nullable=False, index=True)
    internship_id = Column(Integer, ForeignKey("internships.id", ondelete="CASCADE"),
                           nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"),
                     nullable=False, index=True)
    title = Column(String(300), nullable=False)
    body = Column(Text)
    kind = Column(String(50), default="general")   # general/application/internship
    link = Column(String(300))
    read_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)


class SuccessStory(Base):
    """Admin-curated testimonials for the public home page."""
    __tablename__ = "success_stories"

    id = Column(Integer, primary_key=True, index=True)
    student_name = Column(String(200), nullable=False)
    college_name = Column(String(300))
    company_name = Column(String(300))
    role = Column(String(200))
    quote = Column(Text, nullable=False)
    photo_url = Column(String(500))
    is_published = Column(Boolean, nullable=False, default=False, index=True)
    display_order = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class ContactMessage(Base):
    """Contact-form submissions -- previously these were silently discarded."""
    __tablename__ = "contact_messages"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    email = Column(String(200), nullable=False, index=True)
    subject = Column(String(300))
    message = Column(Text, nullable=False)
    is_handled = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
