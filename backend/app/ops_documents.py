# app/ops_documents.py
"""Operations portal, sections 13 and 17: document management and the
approval centre.

Document kinds deliberately exclude an Aadhaar *number* field -- only an
uploaded file is ever stored, and the recommended identity document is the
college ID. See the note on ops_models.Document.
"""
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import (
    APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile, status,
)
from fastapi.responses import FileResponse
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from . import auth_models as am
from . import ops_models as om
from . import permissions as perm
from .config import ALLOWED_DOC_EXTS, ALLOWED_IMAGE_EXTS, MAX_UPLOAD_BYTES, UPLOAD_DIR
from .database import get_db
from .pagination import PageParams, paginate

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ops", tags=["operations"])

DOC_DIR = UPLOAD_DIR / "documents"

OWNER_TYPES = ("student", "company", "college")

DOCUMENT_KINDS = (
    # student
    "resume", "college_id", "marksheet", "offer_letter", "joining_letter",
    "internship_report", "completion_report",
    # company / college
    "company_agreement", "mou", "registration_certificate", "other",
)


@router.get("/documents/kinds", response_model=None)
def document_kinds(user: am.User = Depends(perm.require_staff)):
    return {
        "owner_types": list(OWNER_TYPES),
        "kinds": list(DOCUMENT_KINDS),
        "allowed_extensions": sorted(ALLOWED_IMAGE_EXTS | ALLOWED_DOC_EXTS),
        "max_bytes": MAX_UPLOAD_BYTES,
        "note": "Aadhaar numbers are not stored. Use 'college_id' for identity "
                "verification.",
    }


@router.get("/documents/summary", response_model=None)
def document_summary(
    user: am.User = Depends(perm.require_permission(om.RES_DOCUMENTS, om.ACT_VIEW)),
    db: Session = Depends(get_db),
):
    """Counts per kind, for the category tiles on the documents screen.

    One grouped query instead of one request per kind. Kinds with no documents
    are returned as 0 rather than omitted, so the tiles stay in a stable order.
    """
    rows = (
        db.query(om.Document.kind, func.count(om.Document.id))
        .group_by(om.Document.kind).all()
    )
    counted = {k: n for k, n in rows}
    verified = db.query(om.Document).filter(om.Document.is_verified.is_(True)).count()
    total = sum(counted.values())
    return {
        "total": total,
        "verified": verified,
        "pending": total - verified,
        "by_kind": {kind: counted.get(kind, 0) for kind in DOCUMENT_KINDS},
    }


def _owner_names(db: Session, docs: list) -> dict[tuple[str, int], str]:
    """Display names for a page of documents, in three queries rather than N.

    Documents store only owner_type + owner_id, so without this the table can
    only say "student #14".
    """
    wanted: dict[str, set[int]] = {"student": set(), "company": set(), "college": set()}
    for d in docs:
        if d.owner_type in wanted:
            wanted[d.owner_type].add(d.owner_id)

    names: dict[tuple[str, int], str] = {}

    if wanted["student"]:
        ids = wanted["student"]
        profiles = {
            p.user_id: p.full_name
            for p in db.query(am.StudentProfile)
            .filter(am.StudentProfile.user_id.in_(ids)).all()
        }
        for u in db.query(am.User).filter(am.User.id.in_(ids)).all():
            # Fall back through profile name -> account name -> email, so a
            # student with an incomplete profile still shows something usable.
            names[("student", u.id)] = profiles.get(u.id) or u.full_name or u.email

    if wanted["company"]:
        for c in db.query(am.Company).filter(am.Company.id.in_(wanted["company"])).all():
            names[("company", c.id)] = c.name

    if wanted["college"]:
        for c in db.query(am.College).filter(am.College.id.in_(wanted["college"])).all():
            names[("college", c.id)] = c.name

    return names


def _check_owner_scope(db: Session, user: am.User, owner_type: str, owner_id: int) -> None:
    """Stop a scoped user from reading or writing another org's documents."""
    own_company = perm.scope_company_id(user)
    if own_company is not None:
        if owner_type == "company" and owner_id != own_company:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your company's document")
        if owner_type == "college":
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Not available to company users")

    own_college = perm.scope_college_id(user)
    if own_college is not None:
        if owner_type == "college" and owner_id != own_college:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your college's document")
        if owner_type == "student":
            c = db.query(am.College).filter(am.College.id == own_college).first()
            p = db.query(am.StudentProfile).filter(
                am.StudentProfile.user_id == owner_id).first()
            if not p or not c or p.college_name != c.name:
                raise HTTPException(status.HTTP_403_FORBIDDEN,
                                    "Not a student of your college")


@router.get("/documents", response_model=None)
def list_documents(
    user: am.User = Depends(perm.require_permission(om.RES_DOCUMENTS, om.ACT_VIEW)),
    db: Session = Depends(get_db),
    params: PageParams = Depends(),
    owner_type: Optional[str] = None,
    owner_id: Optional[int] = None,
    kind: Optional[str] = None,
    is_verified: Optional[bool] = None,
):
    q = db.query(om.Document)
    if owner_type:
        if owner_type not in OWNER_TYPES:
            raise HTTPException(400, f"owner_type must be one of: {', '.join(OWNER_TYPES)}")
        q = q.filter(om.Document.owner_type == owner_type)
    if owner_id:
        q = q.filter(om.Document.owner_id == owner_id)
        if owner_type:
            _check_owner_scope(db, user, owner_type, owner_id)
    if kind:
        q = q.filter(om.Document.kind == kind)
    if is_verified is not None:
        q = q.filter(om.Document.is_verified.is_(is_verified))

    result = paginate(q.order_by(om.Document.created_at.desc()), params)
    page = result["items"]
    names = _owner_names(db, page)

    result["items"] = [{
        "id": d.id, "owner_type": d.owner_type, "owner_id": d.owner_id,
        "owner_name": names.get((d.owner_type, d.owner_id)),
        "kind": d.kind, "file_url": d.file_url,
        "original_filename": d.original_filename, "mime_type": d.mime_type,
        "size_bytes": d.size_bytes, "is_verified": d.is_verified,
        "verified_at": d.verified_at, "created_at": d.created_at,
    } for d in page]
    return result


@router.post("/documents", response_model=None, status_code=201)
async def upload_document(
    request: Request,
    file: UploadFile = File(...),
    owner_type: str = Form(...),
    owner_id: int = Form(...),
    kind: str = Form(...),
    user: am.User = Depends(perm.require_permission(om.RES_DOCUMENTS, om.ACT_ADD)),
    db: Session = Depends(get_db),
):
    if owner_type not in OWNER_TYPES:
        raise HTTPException(400, f"owner_type must be one of: {', '.join(OWNER_TYPES)}")
    if kind not in DOCUMENT_KINDS:
        raise HTTPException(400, f"kind must be one of: {', '.join(DOCUMENT_KINDS)}")

    _check_owner_scope(db, user, owner_type, owner_id)

    # Confirm the owner actually exists, or we accumulate orphaned files.
    exists = {
        "student": lambda: db.query(am.User).filter(
            am.User.id == owner_id, am.User.role == am.ROLE_STUDENT).first(),
        "company": lambda: db.query(am.Company).filter(am.Company.id == owner_id).first(),
        "college": lambda: db.query(am.College).filter(am.College.id == owner_id).first(),
    }[owner_type]()
    if not exists:
        raise HTTPException(400, f"No {owner_type} with id {owner_id}")

    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in (ALLOWED_IMAGE_EXTS | ALLOWED_DOC_EXTS):
        allowed = ", ".join(sorted(ALLOWED_IMAGE_EXTS | ALLOWED_DOC_EXTS))
        raise HTTPException(400, f"File type '{ext or 'unknown'}' not allowed. Allowed: {allowed}")

    contents = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"File too large (max {MAX_UPLOAD_BYTES // (1024*1024)} MB)")
    if not contents:
        raise HTTPException(400, "The uploaded file is empty")

    DOC_DIR.mkdir(parents=True, exist_ok=True)
    stored = f"{uuid.uuid4()}{ext}"
    try:
        (DOC_DIR / stored).write_bytes(contents)
    except Exception as exc:  # noqa: BLE001
        logger.error("Document write failed: %s", exc)
        raise HTTPException(500, "Could not save the file")

    row = om.Document(
        owner_type=owner_type, owner_id=owner_id, kind=kind,
        file_url=f"/uploads/documents/{stored}",
        original_filename=(file.filename or "")[:300],
        mime_type=file.content_type, size_bytes=len(contents),
        uploaded_by_user_id=user.id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    perm.record_audit(db, user, "uploaded", "document", row.id,
                      summary=f"{kind} for {owner_type} #{owner_id}", request=request)
    return {"status": "ok", "id": row.id, "file_url": row.file_url}


@router.post("/documents/{document_id}/verify", response_model=None)
def verify_document(
    document_id: int,
    request: Request,
    verified: bool = True,
    user: am.User = Depends(perm.require_permission(om.RES_DOCUMENTS, om.ACT_APPROVE)),
    db: Session = Depends(get_db),
):
    d = db.query(om.Document).filter(om.Document.id == document_id).first()
    if not d:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")

    d.is_verified = verified
    d.verified_by_user_id = user.id if verified else None
    d.verified_at = datetime.now(timezone.utc) if verified else None
    db.commit()

    perm.record_audit(db, user, "verified" if verified else "unverified", "document",
                      document_id, summary=f"{d.kind} for {d.owner_type} #{d.owner_id}",
                      request=request)
    return {"status": "ok", "is_verified": d.is_verified}


@router.get("/documents/{document_id}/download")
def download_document(
    document_id: int,
    user: am.User = Depends(perm.require_permission(om.RES_DOCUMENTS, om.ACT_VIEW)),
    db: Session = Depends(get_db),
):
    d = db.query(om.Document).filter(om.Document.id == document_id).first()
    if not d:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")
    _check_owner_scope(db, user, d.owner_type, d.owner_id)

    path = DOC_DIR / d.file_url.rsplit("/", 1)[-1]
    if not path.exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "File is missing on disk")
    return FileResponse(path, filename=d.original_filename or path.name)


@router.delete("/documents/{document_id}", response_model=None)
def delete_document(
    document_id: int,
    request: Request,
    user: am.User = Depends(perm.require_permission(om.RES_DOCUMENTS, om.ACT_DELETE)),
    db: Session = Depends(get_db),
):
    d = db.query(om.Document).filter(om.Document.id == document_id).first()
    if not d:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")

    path = DOC_DIR / d.file_url.rsplit("/", 1)[-1]
    summary = f"{d.kind} for {d.owner_type} #{d.owner_id}"
    db.delete(d)
    db.commit()
    # Remove the row first; a leftover file is harmless, a row pointing at a
    # deleted file is not.
    try:
        path.unlink(missing_ok=True)
    except OSError as exc:
        logger.warning("Could not remove %s: %s", path, exc)

    perm.record_audit(db, user, "deleted", "document", document_id,
                      summary=summary, request=request)
    return {"status": "ok"}


# ===========================================================================
# 17. APPROVAL CENTRE
# ===========================================================================

@router.get("/approvals", response_model=None)
def approval_centre(
    user: am.User = Depends(perm.require_staff),
    db: Session = Depends(get_db),
    limit: int = Query(20, ge=1, le=100),
):
    """Everything waiting on a human decision, in one place.

    Counts are always returned; the sample rows are capped so this stays fast
    when a backlog builds up.
    """
    # Deactivated companies are excluded: turning one off is how staff reject it,
    # and a rejected company that stayed in the queue could never be cleared.
    companies_q = db.query(am.Company).filter(
        am.Company.is_verified.is_(False), am.Company.is_active.is_(True),
    )
    colleges_q = db.query(am.College).filter(am.College.partnership_status == "pending")
    internships_q = (
        db.query(am.Internship).options(joinedload(am.Internship.company))
        .filter(am.Internship.status == am.INTERNSHIP_DRAFT)
    )
    documents_q = db.query(om.Document).filter(om.Document.is_verified.is_(False))
    certificates_q = db.query(om.Certificate).filter(om.Certificate.status == "pending")

    return {
        "counts": {
            "companies": companies_q.count(),
            "colleges": colleges_q.count(),
            "internships": internships_q.count(),
            "documents": documents_q.count(),
            "certificates": certificates_q.count(),
        },
        "companies": [
            {"id": c.id, "name": c.name, "industry": c.industry,
             "created_at": c.created_at}
            for c in companies_q.order_by(am.Company.created_at.desc()).limit(limit)
        ],
        "colleges": [
            {"id": c.id, "name": c.name, "university": c.university,
             "created_at": c.created_at}
            for c in colleges_q.order_by(am.College.created_at.desc()).limit(limit)
        ],
        "internships": [
            {"id": i.id, "title": i.title,
             "company": i.company.name if i.company else None,
             "created_at": i.created_at}
            for i in internships_q.order_by(am.Internship.created_at.desc()).limit(limit)
        ],
        "documents": [
            {"id": d.id, "kind": d.kind, "owner_type": d.owner_type,
             "owner_id": d.owner_id, "created_at": d.created_at}
            for d in documents_q.order_by(om.Document.created_at.desc()).limit(limit)
        ],
        "certificates": [
            {"id": c.id, "certificate_number": c.certificate_number,
             "created_at": c.created_at}
            for c in certificates_q.order_by(om.Certificate.created_at.desc()).limit(limit)
        ],
    }
