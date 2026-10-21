# app/init_db.py
"""Create any missing tables.

    python -m app.init_db

Kept separate from app startup so a transient database outage cannot prevent
the API from booting.
"""
import sys

from sqlalchemy import inspect

from .database import engine, Base
from . import models  # noqa: F401 -- register marketing-form tables
from . import auth_models  # noqa: F401 -- register auth/profile tables
from . import ops_models  # noqa: F401 -- register operations-portal tables


def main() -> int:
    try:
        Base.metadata.create_all(bind=engine)
    except Exception as exc:
        print(f"FAILED: {exc}")
        return 1

    tables = sorted(inspect(engine).get_table_names())
    print(f"OK -- {len(tables)} tables present:")
    for t in tables:
        print(f"  - {t}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
