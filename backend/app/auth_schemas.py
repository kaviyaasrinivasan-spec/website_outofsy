# app/auth_schemas.py
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field, field_validator


class RegisterRequest(BaseModel):
    """Public registration. Students only -- companies and colleges are created
    by an admin, and admins are provisioned directly."""
    full_name: str = Field(min_length=1, max_length=200)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    phone: Optional[str] = Field(default=None, max_length=50)
    college_name: Optional[str] = Field(default=None, max_length=300)
    course: Optional[str] = Field(default=None, max_length=200)

    @field_validator("full_name")
    @classmethod
    def name_not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Full name is required")
        return v

    @field_validator("course")
    @classmethod
    def valid_course(cls, v):
        # Imported here rather than at module scope: platform_schemas pulls in
        # the ORM models, and this module is imported early during startup.
        from .platform_schemas import COURSES
        if v not in (None, "") and v not in COURSES:
            raise ValueError(f"course must be one of: {', '.join(COURSES)}")
        return v


class CompleteProfileRequest(BaseModel):
    """Finishes a Google signup.

    The account already exists at this point, so there is no email field --
    the address comes from Google and is not the student's to change here.
    Password is optional and the form no longer asks for one: the student can
    already sign in with Google. It is still accepted so an account can be
    given a password without a separate endpoint.
    """
    full_name: str = Field(min_length=1, max_length=200)
    phone: str = Field(min_length=1, max_length=50)
    college_name: str = Field(min_length=1, max_length=300)
    course: str = Field(min_length=1, max_length=200)
    password: Optional[str] = Field(default=None, max_length=128)

    @field_validator("full_name", "phone", "college_name", "course")
    @classmethod
    def not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("This field is required")
        return v

    @field_validator("course")
    @classmethod
    def valid_course(cls, v: str) -> str:
        # Imported here rather than at module scope: platform_schemas pulls in
        # the ORM models, and this module is imported early during startup.
        from .platform_schemas import COURSES
        if v not in COURSES:
            raise ValueError(f"course must be one of: {', '.join(COURSES)}")
        return v

    @field_validator("password")
    @classmethod
    def blank_password_means_none(cls, v: Optional[str]) -> Optional[str]:
        # An untouched optional field arrives as "", which must not be read as
        # a request to set an empty password.
        return v or None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: int
    email: str
    role: str
    status: str
    email_verified: bool
    name: Optional[str] = None
    member_id: Optional[str] = None
    created_at: datetime
    # False while a Google signup still has to fill in the details form.
    onboarding_completed: bool = True

    class Config:
        from_attributes = True


class MessageResponse(BaseModel):
    status: str
    message: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)
