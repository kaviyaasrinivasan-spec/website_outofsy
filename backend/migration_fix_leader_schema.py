"""
Migration: Fix leader_nominations schema
1. Add leader_phone column
2. Make nominator_name nullable
3. Make nominator_email nullable
"""
import os
import urllib.parse
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

# Load environment variables from the backend/.env file
env_path = os.path.join(os.path.dirname(__file__), ".env")
load_dotenv(dotenv_path=env_path)

# Construct DATABASE_URL from individual environment variables
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASS")
DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT")
DB_NAME = os.getenv("DB_NAME")

# URL encode the password to handle special characters like '@'
encoded_password = urllib.parse.quote_plus(DB_PASSWORD)

DATABASE_URL = f"postgresql://{DB_USER}:{encoded_password}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

print(f"Connecting to database at {DB_HOST}:{DB_PORT}/{DB_NAME}")

engine = create_engine(DATABASE_URL)

def run_migration():
    """Fix leader_nominations schema"""
    # Use engine.begin() for automatic transaction management (commit on success, rollback on failure)
    with engine.begin() as conn:
        try:
            # 1. Add leader_phone column if it doesn't exist
            print("Adding leader_phone column...")
            conn.execute(text("""
                ALTER TABLE leader_nominations
                ADD COLUMN IF NOT EXISTS leader_phone VARCHAR(50);
            """))
            
            # 2. Make nominator_name nullable
            print("Making nominator_name nullable...")
            conn.execute(text("""
                ALTER TABLE leader_nominations
                ALTER COLUMN nominator_name DROP NOT NULL;
            """))

            # 3. Make nominator_email nullable
            print("Making nominator_email nullable...")
            conn.execute(text("""
                ALTER TABLE leader_nominations
                ALTER COLUMN nominator_email DROP NOT NULL;
            """))
            
            print("✅ Schema fixed successfully!")
        except Exception as e:
            print(f"Error fixing schema: {e}")
            raise

if __name__ == "__main__":
    print("Starting migration to fix leader_nominations schema...")
    run_migration()
    print("Migration completed successfully!")
