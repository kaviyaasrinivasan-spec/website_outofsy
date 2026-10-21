# app/main.py
import logging
import os
import shutil
import uuid

from fastapi import FastAPI, Depends, HTTPException, File, UploadFile, BackgroundTasks, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session
from typing import List

from . import models, schemas, crud
from . import auth_models  # noqa: F401 -- registers auth tables on Base
from . import ops_models  # noqa: F401 -- registers operations-portal tables
from .ops_routes import router as ops_router
from .auth_routes import router as auth_router
from .google_auth import router as google_router
from .ops_entities import router as ops_entities_router
from .ops_progress import router as ops_progress_router
from .ops_progress import public_router as verify_router
from .ops_users import router as ops_users_router
from .ops_documents import router as ops_documents_router
from .ops_reports import router as ops_reports_router
from .ops_settings import router as ops_settings_router
from .platform_routes import public_router, student_router
from .config import (
    ALLOWED_DOC_EXTS,
    ALLOWED_IMAGE_EXTS,
    CORS_ORIGINS,
    MAX_UPLOAD_BYTES,
    SESSION_SECRET_IS_DEFAULT,
    UPLOAD_DIR,
)
from .database import SessionLocal, engine, Base, get_db
from .email_utils import send_internship_confirmation, smtp_configured

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="OutOfSyllabuss Platform API")


def init_db() -> None:
    """Create any missing tables. Run explicitly via `python -m app.init_db`.

    Deliberately NOT called at import: the shared Postgres host periodically
    hits max_connections, and doing DDL on import meant a transient
    "too many clients" error took the whole API down instead of failing a
    single request.
    """
    Base.metadata.create_all(bind=engine)

if SESSION_SECRET_IS_DEFAULT:
    logger.warning(
        "SESSION_SECRET is still the default development value. "
        "Set a real one in backend/.env before deploying."
    )

UPLOAD_DIR.mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

# CORS -- an explicit origin list, because allow_credentials with "*" is both
# rejected by browsers and unsafe. Session cookies require credentials=True.
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

@app.exception_handler(OperationalError)
async def database_unavailable_handler(request: Request, exc: OperationalError):
    """Return a clean 503 when the database is unreachable.

    Without this, an unhandled exception skips CORSMiddleware, so the browser
    gets a header-less cross-origin 500 and reports it as a network/CORS
    failure -- which hides the real cause. Returning a proper response keeps
    the CORS headers attached and tells the user something true.
    """
    logger.error("Database unavailable on %s %s: %s", request.method, request.url.path, exc)
    return JSONResponse(
        status_code=503,
        content={
            "detail": "The service is temporarily unavailable. "
                      "Please try again in a few moments."
        },
    )


@app.exception_handler(Exception)
async def unhandled_error_handler(request: Request, exc: Exception):
    """Catch-all so unexpected errors still carry CORS headers."""
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "Something went wrong on our side. Please try again."},
    )


app.include_router(auth_router)
app.include_router(google_router)
app.include_router(public_router)
app.include_router(student_router)
app.include_router(ops_router)
app.include_router(ops_entities_router)
app.include_router(ops_progress_router)
app.include_router(ops_users_router)
app.include_router(ops_documents_router)
app.include_router(ops_reports_router)
app.include_router(ops_settings_router)
app.include_router(verify_router)


@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    """Upload an image or document and return its URL.

    Validates extension and size -- previously this accepted any file of any
    size under an attacker-supplied extension.
    """
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in (ALLOWED_IMAGE_EXTS | ALLOWED_DOC_EXTS):
        allowed = ", ".join(sorted(ALLOWED_IMAGE_EXTS | ALLOWED_DOC_EXTS))
        raise HTTPException(400, f"File type '{ext or 'unknown'}' not allowed. Allowed: {allowed}")

    # Read with a cap rather than trusting the client-declared length.
    contents = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"File too large (max {MAX_UPLOAD_BYTES // (1024 * 1024)} MB)")

    unique_filename = f"{uuid.uuid4()}{ext}"
    try:
        with open(UPLOAD_DIR / unique_filename, "wb") as buffer:
            buffer.write(contents)
    except Exception as e:
        logger.error("Upload failed: %s", e)
        raise HTTPException(500, "Could not save file")

    return {"url": f"/uploads/{unique_filename}"}


# --- 1-Month Internship Program ---------------------------------------------

def _send_confirmation_and_record(application_id: int, to_email: str, full_name: str):
    """Background task: send the confirmation email, then record the outcome."""
    if not smtp_configured():
        outcome = "skipped"  # no SMTP credentials yet -- distinct from a real failure
    else:
        outcome = "yes" if send_internship_confirmation(to_email, full_name) else "failed"

    db = SessionLocal()
    try:
        crud.mark_confirmation_email(db, application_id, outcome)
    finally:
        db.close()


@app.post("/applications/internship", response_model=None)
def submit_internship(
    payload: schemas.InternshipApplicationCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """The record is committed first; the email is queued so a mail outage
    can never cost us an application."""
    created = crud.create_internship_application(db, payload)
    background_tasks.add_task(
        _send_confirmation_and_record, created.id, payload.email, payload.full_name
    )
    return {"status": "ok", "id": created.id, "email_queued": smtp_configured()}


@app.get("/applications/internship/options", response_model=None)
def internship_options():
    """Dropdown values, so the frontend and backend can't drift apart."""
    return {"current_years": schemas.CURRENT_YEARS, "courses": schemas.COURSES}


# --- existing marketing-site forms ------------------------------------------

@app.post("/applications/student", response_model=None)
def submit_student(payload: schemas.CampusAmbassadorCreate, db: Session = Depends(get_db)):
    created = crud.create_ambassador(db, payload)
    return {"status": "ok", "id": created.id}


@app.get("/ambassadors/approved", response_model=List[schemas.CampusAmbassadorResponse])
def get_approved_ambassadors(db: Session = Depends(get_db)):
    return crud.get_approved_ambassadors(db)


@app.post("/applications/leader", response_model=None)
def submit_leader(payload: schemas.LeaderNominationCreate, db: Session = Depends(get_db)):
    created = crud.create_leader_nomination(db, payload)
    return {"status": "ok", "id": created.id}


@app.get("/leaders/approved", response_model=List[schemas.LeaderNominationResponse])
def get_approved_leaders(db: Session = Depends(get_db)):
    return crud.get_approved_leaders(db)


@app.post("/applications/volunteer", response_model=None)
def submit_volunteer(payload: schemas.VolunteerCreate, db: Session = Depends(get_db)):
    created = crud.create_volunteer(db, payload)
    return {"status": "ok", "id": created.id}


@app.get("/health")
def health():
    return {"status": "ok"}
