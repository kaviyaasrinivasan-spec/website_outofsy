# Migration script to add photo, status, and linkedin_url columns
# Run this script once to update your existing database tables

import os
import sys
from pathlib import Path
from urllib.parse import quote_plus
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

# Load .env from the backend directory
backend_dir = Path(__file__).parent.parent
env_path = backend_dir / '.env'
load_dotenv(env_path)

# Get database credentials from environment
DB_HOST = os.getenv("DB_HOST", "127.0.0.1")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_USER = os.getenv("DB_USER", "user")
DB_PASS = os.getenv("DB_PASS", "")
DB_NAME = os.getenv("DB_NAME", "db")

# percent-encode password (handles @ or other special chars)
db_pass_quoted = quote_plus(DB_PASS)

DATABASE_URL = f"postgresql://{DB_USER}:{db_pass_quoted}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

engine = create_engine(DATABASE_URL)

def run_migration():
    """Add new columns to campus_ambassadors and leader_nominations tables"""
    
    print("Starting migration...")
    
    # Add columns to campus_ambassadors table
    try:
        print("Adding columns to campus_ambassadors table...")
        with engine.connect() as conn:
            conn.execute(text("""
                ALTER TABLE campus_ambassadors 
                ADD COLUMN IF NOT EXISTS photo VARCHAR(500),
                ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'unapproved',
                ADD COLUMN IF NOT EXISTS linkedin_url VARCHAR(500);
            """))
            conn.commit()
        print("✓ Successfully added columns to campus_ambassadors")
    except Exception as e:
        print(f"Error updating campus_ambassadors: {e}")
    
    # Add columns to leader_nominations table
    try:
        print("Adding columns to leader_nominations table...")
        with engine.connect() as conn:
            conn.execute(text("""
                ALTER TABLE leader_nominations 
                ADD COLUMN IF NOT EXISTS photo VARCHAR(500),
                ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'unapproved',
                ADD COLUMN IF NOT EXISTS linkedin_url VARCHAR(500);
            """))
            conn.commit()
        print("✓ Successfully added columns to leader_nominations")
    except Exception as e:
        print(f"Error updating leader_nominations: {e}")
    
    # Make nominator fields nullable in leader_nominations
    try:
        print("Making nominator fields nullable in leader_nominations...")
        with engine.connect() as conn:
            conn.execute(text("""
                ALTER TABLE leader_nominations 
                ALTER COLUMN nominator_name DROP NOT NULL,
                ALTER COLUMN nominator_email DROP NOT NULL;
            """))
            conn.commit()
        print("✓ Successfully updated nominator fields")
    except Exception as e:
        print(f"Error updating nominator fields: {e}")
    
    print("\n✅ Migration completed successfully!")
    print("\nNext steps:")
    print("1. Manually add photo URLs and LinkedIn URLs to approved entries")
    print("2. Update status to 'approved' for entries you want to display on the website")

if __name__ == "__main__":
    run_migration()

