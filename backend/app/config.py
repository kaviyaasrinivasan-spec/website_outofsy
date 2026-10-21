# app/config.py
"""Central configuration. Everything comes from backend/.env -- no secrets in code."""
import os
from pathlib import Path
from urllib.parse import quote_plus
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


def _bool(name: str, default: str = "false") -> bool:
    return os.getenv(name, default).strip().lower() in ("1", "true", "yes", "on")


def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


# --- Database ---------------------------------------------------------------
DB_HOST = os.getenv("DB_HOST", "127.0.0.1")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_USER = os.getenv("DB_USER", "user")
DB_PASS = os.getenv("DB_PASS", "")
DB_NAME = os.getenv("DB_NAME", "db")

DATABASE_URL = (
    f"postgresql+psycopg2://{DB_USER}:{quote_plus(DB_PASS)}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
)

# The Postgres host is shared with a dozen other apps and sits near its
# max_connections ceiling, so this pool is deliberately small.
DB_POOL_SIZE = _int("DB_POOL_SIZE", 3)
DB_MAX_OVERFLOW = _int("DB_MAX_OVERFLOW", 2)
DB_POOL_RECYCLE = _int("DB_POOL_RECYCLE", 1800)

# --- Server -----------------------------------------------------------------
BACKEND_HOST = os.getenv("BACKEND_HOST", "0.0.0.0")
BACKEND_PORT = _int("BACKEND_PORT", 8001)

CORS_ORIGINS = [
    o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()
]

# --- Sessions ---------------------------------------------------------------
SESSION_SECRET = os.getenv("SESSION_SECRET", "dev-only-insecure-change-me")
SESSION_COOKIE_NAME = os.getenv("SESSION_COOKIE_NAME", "oos_session")
SESSION_TTL_DAYS = _int("SESSION_TTL_DAYS", 14)
COOKIE_SECURE = _bool("COOKIE_SECURE", "false")
COOKIE_SAMESITE = os.getenv("COOKIE_SAMESITE", "lax")

SESSION_SECRET_IS_DEFAULT = SESSION_SECRET == "dev-only-insecure-change-me"

# --- Google SSO -------------------------------------------------------------
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI = os.getenv(
    "GOOGLE_REDIRECT_URI", "http://localhost:8001/auth/google/callback"
)
# Where the browser lands after sign-in completes.
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")

GOOGLE_ENABLED = bool(GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)

# --- Uploads ----------------------------------------------------------------
UPLOAD_DIR = BASE_DIR / "uploads"
MAX_UPLOAD_BYTES = _int("MAX_UPLOAD_BYTES", 5 * 1024 * 1024)  # 5 MB
ALLOWED_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
ALLOWED_DOC_EXTS = {".pdf", ".doc", ".docx"}
