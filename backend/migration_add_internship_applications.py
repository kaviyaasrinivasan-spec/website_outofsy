# Migration: create the internship_applications table
# Run once against your Postgres instance:  python migration_add_internship_applications.py
#
# Safe to re-run -- uses CREATE TABLE IF NOT EXISTS and ADD COLUMN IF NOT EXISTS.

import os
from pathlib import Path
from urllib.parse import quote_plus
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

backend_dir = Path(__file__).parent
load_dotenv(backend_dir / ".env")

DB_HOST = os.getenv("DB_HOST", "127.0.0.1")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_USER = os.getenv("DB_USER", "user")
DB_PASS = os.getenv("DB_PASS", "")
DB_NAME = os.getenv("DB_NAME", "db")

DATABASE_URL = f"postgresql://{DB_USER}:{quote_plus(DB_PASS)}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
engine = create_engine(DATABASE_URL)

CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS internship_applications (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(200) NOT NULL,
    whatsapp_number VARCHAR(50) NOT NULL,
    email VARCHAR(200) NOT NULL,
    college_name VARCHAR(300) NOT NULL,
    current_year VARCHAR(50) NOT NULL,
    course VARCHAR(100) NOT NULL,
    status VARCHAR(50) DEFAULT 'new',
    confirmation_email_sent VARCHAR(10) DEFAULT 'no',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
"""

CREATE_INDEXES = """
CREATE INDEX IF NOT EXISTS ix_internship_applications_email
    ON internship_applications (email);
CREATE INDEX IF NOT EXISTS ix_internship_applications_created_at
    ON internship_applications (created_at DESC);
"""


def run_migration():
    print("Starting migration: internship_applications")

    try:
        with engine.connect() as conn:
            conn.execute(text(CREATE_TABLE))
            conn.commit()
        print("[ok] Created table internship_applications (or it already existed)")
    except Exception as e:
        print(f"[error] Creating internship_applications: {e}")
        return

    try:
        with engine.connect() as conn:
            for stmt in filter(None, (s.strip() for s in CREATE_INDEXES.split(";"))):
                conn.execute(text(stmt))
            conn.commit()
        print("[ok] Created indexes on email and created_at")
    except Exception as e:
        print(f"[error] Creating indexes: {e}")

    print("\nMigration completed.")
    print("\nTo review submitted applications:")
    print("  SELECT id, full_name, email, whatsapp_number, college_name,")
    print("         current_year, course, confirmation_email_sent, created_at")
    print("  FROM internship_applications ORDER BY created_at DESC;")


if __name__ == "__main__":
    run_migration()
