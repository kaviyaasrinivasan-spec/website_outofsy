# app/schemas.py
from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional
from datetime import datetime

class CampusAmbassadorCreate(BaseModel):
    name: str
    email: EmailStr
    phone: Optional[str] = None
    college: Optional[str] = None
    year: Optional[str] = None
    major: Optional[str] = None
    why: Optional[str] = None
    experience: Optional[str] = None

class CampusAmbassadorResponse(BaseModel):
    id: int
    name: str
    email: str
    phone: Optional[str] = None
    college: Optional[str] = None
    year: Optional[str] = None
    major: Optional[str] = None
    photo: Optional[str] = None
    linkedin_url: Optional[str] = None
    status: str
    created_at: datetime
    
    class Config:
        from_attributes = True

class LeaderNominationCreate(BaseModel):
    nominator_name: Optional[str] = None  # Optional since leaders self-nominate
    nominator_email: Optional[EmailStr] = None  # Optional since leaders self-nominate
    leader_name: str
    leader_title: Optional[str] = None
    leader_company: Optional[str] = None
    leader_email: Optional[EmailStr] = None
    leader_phone: Optional[str] = None
    why_nominate: Optional[str] = None

class LeaderNominationResponse(BaseModel):
    id: int
    leader_name: str
    leader_title: Optional[str] = None
    leader_company: Optional[str] = None
    leader_email: Optional[str] = None
    leader_phone: Optional[str] = None
    why_nominate: Optional[str] = None
    photo: Optional[str] = None
    linkedin_url: Optional[str] = None
    status: str
    created_at: datetime
    
    class Config:
        from_attributes = True

CURRENT_YEARS = ["1st Year", "2nd Year", "3rd Year", "Final Year", "Passed Out"]

COURSES = [
    "B.E / B.Tech",
    "BCA",
    "MCA",
    "B.Sc Computer Science",
    "B.Sc Information Technology",
    "B.Sc AI & Data Science",
    "B.Sc Data Science",
    "B.Com",
    "B.Com (Computer Applications)",
    "BBA",
    "BBA (Computer Applications)",
    "M.Sc",
    "MBA",
    "Diploma",
    "Other",
]

class InternshipApplicationCreate(BaseModel):
    # every field is mandatory
    full_name: str = Field(min_length=1, max_length=200)
    whatsapp_number: str = Field(min_length=1, max_length=50)
    email: EmailStr
    college_name: str = Field(min_length=1, max_length=300)
    current_year: str
    course: str

    @field_validator("full_name", "whatsapp_number", "college_name")
    @classmethod
    def not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("This field is required")
        return v

    @field_validator("whatsapp_number")
    @classmethod
    def valid_phone(cls, v: str) -> str:
        digits = "".join(ch for ch in v if ch.isdigit())
        if len(digits) < 10:
            raise ValueError("Enter a valid mobile number (at least 10 digits)")
        return v.strip()

    @field_validator("current_year")
    @classmethod
    def valid_year(cls, v: str) -> str:
        if v not in CURRENT_YEARS:
            raise ValueError(f"current_year must be one of: {', '.join(CURRENT_YEARS)}")
        return v

    @field_validator("course")
    @classmethod
    def valid_course(cls, v: str) -> str:
        if v not in COURSES:
            raise ValueError(f"course must be one of: {', '.join(COURSES)}")
        return v

class VolunteerCreate(BaseModel):
    name: str
    email: EmailStr
    phone: Optional[str] = None
    location: Optional[str] = None
    skills: Optional[str] = None
    availability: Optional[str] = None
    why: Optional[str] = None

