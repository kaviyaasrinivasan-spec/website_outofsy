# app/crud.py
from sqlalchemy.orm import Session
from . import models, schemas

def create_ambassador(db: Session, payload: schemas.CampusAmbassadorCreate):
    obj = models.CampusAmbassador(
        name=payload.name,
        email=payload.email,
        phone=payload.phone,
        college=payload.college,
        year=payload.year,
        major=payload.major,
        why=payload.why,
        experience=payload.experience,
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj

def get_approved_ambassadors(db: Session):
    """Get all approved campus ambassadors"""
    return db.query(models.CampusAmbassador).filter(
        models.CampusAmbassador.status == "approved"
    ).all()

def create_leader_nomination(db: Session, payload: schemas.LeaderNominationCreate):
    obj = models.LeaderNomination(
        nominator_name=payload.nominator_name,
        nominator_email=payload.nominator_email,
        leader_name=payload.leader_name,
        leader_title=payload.leader_title,
        leader_company=payload.leader_company,
        leader_email=payload.leader_email,
        why_nominate=payload.why_nominate,
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj

def get_approved_leaders(db: Session):
    """Get all approved leader nominations"""
    return db.query(models.LeaderNomination).filter(
        models.LeaderNomination.status == "approved"
    ).all()

def create_internship_application(db: Session, payload: schemas.InternshipApplicationCreate):
    obj = models.InternshipApplication(
        full_name=payload.full_name,
        whatsapp_number=payload.whatsapp_number,
        email=payload.email,
        college_name=payload.college_name,
        current_year=payload.current_year,
        course=payload.course,
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj

def mark_confirmation_email(db: Session, application_id: int, outcome: str):
    """Record whether the confirmation email went out ('yes' or 'failed')."""
    obj = db.query(models.InternshipApplication).filter(
        models.InternshipApplication.id == application_id
    ).first()
    if obj:
        obj.confirmation_email_sent = outcome
        db.commit()
    return obj

def create_volunteer(db: Session, payload: schemas.VolunteerCreate):
    obj = models.Volunteer(
        name=payload.name,
        email=payload.email,
        phone=payload.phone,
        location=payload.location,
        skills=payload.skills,
        availability=payload.availability,
        why=payload.why,
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj

