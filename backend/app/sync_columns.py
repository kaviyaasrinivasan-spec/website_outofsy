# app/sync_columns.py
"""Add columns that exist in the models but not yet in the database.

    python -m app.sync_columns          # report only
    python -m app.sync_columns --apply  # actually add them

`Base.metadata.create_all()` creates missing TABLES but never adds missing
COLUMNS to tables that already exist, so a model change on a live database
silently produces "column ... does not exist" at query time.

This is a stopgap for exactly that case. It is strictly additive -- it never
drops or alters an existing column. Adopt Alembic for anything more.
"""
import sys

from sqlalchemy import inspect, text
from sqlalchemy.schema import CreateColumn

from .database import engine, Base
from . import models  # noqa: F401 -- register marketing tables
from . import auth_models  # noqa: F401 -- register platform tables
from . import ops_models  # noqa: F401 -- register operations-portal tables


def find_missing():
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    missing = []

    for table in Base.metadata.sorted_tables:
        if table.name not in existing_tables:
            continue  # create_all handles whole new tables
        db_cols = {c["name"] for c in inspector.get_columns(table.name)}
        for column in table.columns:
            if column.name not in db_cols:
                missing.append((table, column))
    return missing


def main() -> int:
    apply = "--apply" in sys.argv
    missing = find_missing()

    if not missing:
        print("Schema is in sync -- no missing columns.")
        return 0

    print(f"{len(missing)} column(s) missing from the database:\n")
    statements = []
    for table, column in missing:
        # Reuse SQLAlchemy's own DDL compiler so types match the model exactly.
        col_ddl = CreateColumn(column).compile(engine).string
        # A NOT NULL column cannot be added to a table with existing rows
        # unless it has a default, so relax it and let the app enforce it.
        col_ddl = col_ddl.replace(" NOT NULL", "")
        stmt = f'ALTER TABLE {table.name} ADD COLUMN IF NOT EXISTS {col_ddl}'
        statements.append(stmt)
        print(f"   {table.name}.{column.name}")

    if not apply:
        print("\nDry run. Re-run with --apply to execute:\n")
        for s in statements:
            print(f"   {s};")
        return 0

    print("\nApplying...")
    with engine.begin() as conn:
        for s in statements:
            conn.execute(text(s))
            print(f"   OK  {s}")

        # A NOT NULL column had its constraint stripped above so it could be
        # added to a populated table. Backfill the model's default, otherwise
        # existing rows hold NULL where the code expects a real value -- e.g.
        # a NULL boolean reads as False and silently changes behaviour.
        for table, column in missing:
            if column.nullable or column.default is None:
                continue
            default = getattr(column.default, "arg", None)
            if callable(default) or default is None:
                continue
            literal = (
                "TRUE" if default is True
                else "FALSE" if default is False
                else f"'{default}'" if isinstance(default, str)
                else str(default)
            )
            stmt = (
                f"UPDATE {table.name} SET {column.name} = {literal} "
                f"WHERE {column.name} IS NULL"
            )
            result = conn.execute(text(stmt))
            if result.rowcount:
                print(f"   OK  backfilled {table.name}.{column.name} = {literal} "
                      f"({result.rowcount} rows)")

    remaining = find_missing()
    print(f"\nDone. Remaining missing columns: {len(remaining)}")
    return 0 if not remaining else 1


if __name__ == "__main__":
    sys.exit(main())
