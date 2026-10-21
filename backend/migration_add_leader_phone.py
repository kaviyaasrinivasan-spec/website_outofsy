"""
Migration: Add phone field to leader_nominations table
"""
import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, Column, String, text

# Load environment variables from the backend/.env file
env_path = os.path.join(os.path.dirname(__file__), ".env")
load_dotenv(dotenv_path=env_path)

# Construct DATABASE_URL from individual environment variables
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT")
DB_NAME = os.getenv("DB_NAME")

DATABASE_URL = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

print(f"Connecting to database at {DB_HOST}:{DB_PORT}/{DB_NAME}")

engine = create_engine(DATABASE_URL)

def run_migration():
    """Add phone field to leader_nominations table"""
    with engine.connect() as conn:
        # Add phone column to leader_nominations
        try:
            conn.execute(text("""
                ALTER TABLE leader_nominations
                ADD COLUMN IF NOT EXISTS leader_phone VARCHAR(50);
            """))
            conn.commit()
            print("✅ Added 'leader_phone' column to leader_nominations table")
        except Exception as e:
            print(f"Error adding leader_phone column: {e}")
            raise

if __name__ == "__main__":
    print("Starting migration to add phone field to leader_nominations...")
    run_migration()
    print("Migration completed successfully!")
