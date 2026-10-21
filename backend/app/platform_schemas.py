# app/platform_schemas.py
"""Pydantic models for internships, applications, profiles and notifications."""
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, EmailStr, Field, field_validator

from . import auth_models as am

CURRENT_YEARS = ["1st Year", "2nd Year", "3rd Year", "Final Year", "Passed Out"]

COURSES = [
    "B.E / B.Tech", "BCA", "MCA", "B.Sc Computer Science",
    "B.Sc Information Technology", "B.Sc AI & Data Science", "B.Sc Data Science",
    "B.Com", "B.Com (Computer Applications)", "BBA",
    "BBA (Computer Applications)", "M.Sc", "MBA", "Diploma", "Other",
]


# --- public: companies & internships ----------------------------------------

class CompanyBrief(BaseModel):
    id: int
    name: str
    logo_url: Optional[str] = None
    industry: Optional[str] = None
    location: Optional[str] = None

    class Config:
        from_attributes = True


class InternshipCard(BaseModel):
    """Shape used by the public listing grid."""
    id: int
    title: str
    company: Optional[CompanyBrief] = None
    duration: Optional[str] = None
    work_mode: Optional[str] = None
    location: Optional[str] = None
    stipend: Optional[str] = None
    required_skills: List[str] = []
    last_date_to_apply: Optional[datetime] = None
    is_featured: bool = False
    created_at: Optional[datetime] = None

    # Only populated for signed-in students.
    has_applied: bool = False
    is_saved: bool = False
    # True when the student already has an application in play elsewhere. One
    # internship at a time, so every Apply button is closed until it finishes.
    has_active_application: bool = False

    class Config:
        from_attributes = True


class InternshipDetail(InternshipCard):
    description: Optional[str] = None
    responsibilities: Optional[str] = None
    openings: Optional[int] = None


class InternshipListResponse(BaseModel):
    items: List[InternshipCard]
    total: int
    page: int
    page_size: int


# --- student: applications ---------------------------------------------------

class ApplyRequest(BaseModel):
    internship_id: int
    cover_note: Optional[str] = Field(default=None, max_length=2000)


class ApplicationResponse(BaseModel):
    id: int
    status: str
    cover_note: Optional[str] = None
    applied_at: datetime
    updated_at: Optional[datetime] = None
    internship: Optional[InternshipCard] = None

    class Config:
        from_attributes = True


# --- student: profile --------------------------------------------------------

class StudentProfileResponse(BaseModel):
    full_name: str
    phone: Optional[str] = None
    whatsapp_number: Optional[str] = None
    college_name: Optional[str] = None
    course: Optional[str] = None
    current_year: Optional[str] = None
    skills: Optional[str] = None
    resume_url: Optional[str] = None
    linkedin_url: Optional[str] = None
    photo_url: Optional[str] = None
    city: Optional[str] = None
    bio: Optional[str] = None
    completion_percent: int = 0

    class Config:
        from_attributes = True


class StudentProfileUpdate(BaseModel):
    full_name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    phone: Optional[str] = Field(default=None, max_length=50)
    whatsapp_number: Optional[str] = Field(default=None, max_length=50)
    college_name: Optional[str] = Field(default=None, max_length=300)
    course: Optional[str] = None
    current_year: Optional[str] = None
    skills: Optional[str] = Field(default=None, max_length=1000)
    resume_url: Optional[str] = Field(default=None, max_length=500)
    linkedin_url: Optional[str] = Field(default=None, max_length=500)
    photo_url: Optional[str] = Field(default=None, max_length=500)
    city: Optional[str] = Field(default=None, max_length=150)
    bio: Optional[str] = Field(default=None, max_length=2000)

    @field_validator("current_year")
    @classmethod
    def valid_year(cls, v):
        if v not in (None, "") and v not in CURRENT_YEARS:
            raise ValueError(f"current_year must be one of: {', '.join(CURRENT_YEARS)}")
        return v

    @field_validator("course")
    @classmethod
    def valid_course(cls, v):
        if v not in (None, "") and v not in COURSES:
            raise ValueError(f"course must be one of: {', '.join(COURSES)}")
        return v


# --- student: membership, notifications, dashboard ---------------------------

class MembershipResponse(BaseModel):
    member_id: str
    tier: str
    started_at: datetime
    expires_at: Optional[datetime] = None
    is_active: bool

    class Config:
        from_attributes = True


class NotificationResponse(BaseModel):
    id: int
    title: str
    body: Optional[str] = None
    kind: Optional[str] = None
    link: Optional[str] = None
    read_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class DashboardOverview(BaseModel):
    active_applications: int
    total_applications: int
    saved_internships: int
    unread_notifications: int
    profile_completion: int
    member_id: Optional[str] = None


# --- public: contact ---------------------------------------------------------

class ContactMessageCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    email: EmailStr
    subject: Optional[str] = Field(default=None, max_length=300)
    message: str = Field(min_length=1, max_length=5000)

    @field_validator("name", "message")
    @classmethod
    def not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("This field is required")
        return v


class SuccessStoryResponse(BaseModel):
    id: int
    student_name: str
    college_name: Optional[str] = None
    company_name: Optional[str] = None
    role: Optional[str] = None
    quote: str
    photo_url: Optional[str] = None

    class Config:
        from_attributes = True


class MessageResponse(BaseModel):
    status: str
    message: str
