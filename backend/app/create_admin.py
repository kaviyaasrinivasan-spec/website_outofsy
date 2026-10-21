# app/create_admin.py
"""Provision an admin account. Admins can never be created via public signup.

    python -m app.create_admin admin@outofsyllabuss.org

The password is read from stdin so it never lands in shell history.
"""
import getpass
import sys

from . import auth_models as am
from . import security
from .database import SessionLocal


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: python -m app.create_admin <email>")
        return 2

    email = sys.argv[1].lower().strip()
    password = getpass.getpass("Password: ")
    confirm = getpass.getpass("Confirm password: ")

    if password != confirm:
        print("Passwords do not match.")
        return 1

    problems = security.password_problems(password)
    if problems:
        print(f"Password must contain {', '.join(problems)}")
        return 1

    db = SessionLocal()
    try:
        existing = db.query(am.User).filter(am.User.email == email).first()
        if existing:
            if existing.role == am.ROLE_ADMIN:
                print(f"{email} is already an admin.")
                return 0
            print(f"{email} already exists as a {existing.role}. Refusing to change its role.")
            return 1

        db.add(am.User(
            email=email,
            password_hash=security.hash_password(password),
            role=am.ROLE_ADMIN,
            status=am.STATUS_ACTIVE,
            email_verified=True,
        ))
        db.commit()
        print(f"Admin created: {email}")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
