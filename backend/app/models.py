# app/models.py
from sqlalchemy import Column, Integer, String, Text, DateTime
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import JSONB
from .database import Base

class CampusAmbassador(Base):
    __tablename__ = "campus_ambassadors"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    email = Column(String(200), nullable=False, index=True)
    phone = Column(String(50))
    college = Column(String(300))
    year = Column(String(100))
    major = Column(String(200))
    why = Column(Text)
    experience = Column(Text)
    photo = Column(String(500))  # URL to photo
    status = Column(String(50), default="unapproved")  # approved/unapproved
    linkedin_url = Column(String(500))  # LinkedIn profile URL
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class LeaderNomination(Base):
    __tablename__ = "leader_nominations"
    id = Column(Integer, primary_key=True, index=True)
    nominator_name = Column(String(200), nullable=True)  # Made nullable since leaders self-nominate
    nominator_email = Column(String(200), nullable=True)  # Made nullable since leaders self-nominate
    leader_name = Column(String(200), nullable=False)
    leader_title = Column(String(200))
    leader_company = Column(String(300))
    leader_email = Column(String(200))
    leader_phone = Column(String(50))  # Phone/mobile number for the leader
    why_nominate = Column(Text)
    photo = Column(String(500))  # URL to photo
    status = Column(String(50), default="unapproved")  # approved/unapproved
    linkedin_url = Column(String(500))  # LinkedIn profile URL
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class InternshipApplication(Base):
    __tablename__ = "internship_applications"
    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String(200), nullable=False)
    whatsapp_number = Column(String(50), nullable=False)
    email = Column(String(200), nullable=False, index=True)
    college_name = Column(String(300), nullable=False)
    current_year = Column(String(50), nullable=False)
    course = Column(String(100), nullable=False)
    status = Column(String(50), default="new")  # new/contacted/selected/rejected
    confirmation_email_sent = Column(String(10), default="no")  # yes/no/failed
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Volunteer(Base):
    __tablename__ = "volunteers"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    email = Column(String(200), nullable=False)
    phone = Column(String(50))
    location = Column(String(200))
    skills = Column(Text)
    availability = Column(Text)
    why = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
