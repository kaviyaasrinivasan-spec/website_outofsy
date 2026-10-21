"""Auth smoke test against the real outofsyllabus database.

Uses clearly-marked @smoketest.invalid emails and deletes every row it creates.
"""
import sys, pathlib
BACKEND = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

import app.main as main
import app.auth_models as am
from app.database import SessionLocal
from fastapi.testclient import TestClient

MARK = "@oosqa.co"  # not .invalid/.test -- email-validator rejects reserved domains
STU = f"student{MARK}"
COM = f"company{MARK}"
COL = f"college{MARK}"

passed = failed = 0

def check(label, got, want):
    global passed, failed
    ok = got == want
    if ok:
        passed += 1
    else:
        failed += 1
    print(f"  [{'OK ' if ok else 'FAIL'}] {label:<52} {got} (want {want})")


def cleanup():
    db = SessionLocal()
    try:
        users = db.query(am.User).filter(am.User.email.like(f"%{MARK}")).all()
        for u in users:
            db.delete(u)          # cascades to sessions and profiles
        db.commit()
        return len(users)
    finally:
        db.close()


cleanup()  # clear any residue from a previous run
print("=" * 96)

# --- registration ----------------------------------------------------------
print("REGISTRATION")
c = TestClient(main.app)
r = c.post("/auth/register", json={"email": STU, "password": "TestPass123",
                                   "role": "student", "name": "Smoke Student"})
check("student register -> 201", r.status_code, 201)
if r.status_code == 201:
    check("student status is active", r.json()["status"], "active")
    check("session cookie set", main.__dict__ and ("oos_session" in c.cookies), True)

r = c.post("/auth/register", json={"email": STU, "password": "TestPass123",
                                   "role": "student", "name": "Dup"})
check("duplicate email -> 409", r.status_code, 409)

r = c.post("/auth/register", json={"email": f"weak{MARK}", "password": "short",
                                   "role": "student", "name": "Weak"})
check("weak password -> 422", r.status_code, 422)

r = c.post("/auth/register", json={"email": f"nodigit{MARK}", "password": "abcdefghij",
                                   "role": "student", "name": "NoDigit"})
check("password without digit -> 422", r.status_code, 422)

r = c.post("/auth/register", json={"email": f"admin{MARK}", "password": "TestPass123",
                                   "role": "admin", "name": "Sneaky Admin"})
check("admin self-signup blocked -> 422", r.status_code, 422)

cc = TestClient(main.app)
r = cc.post("/auth/register", json={"email": COM, "password": "TestPass123",
                                    "role": "company", "name": "Smoke Corp"})
check("company register -> 201", r.status_code, 201)
if r.status_code == 201:
    check("company status is pending", r.json()["status"], "pending")
    check("no session for pending account", "oos_session" not in cc.cookies, True)

ccl = TestClient(main.app)
r = ccl.post("/auth/register", json={"email": COL, "password": "TestPass123",
                                     "role": "college", "name": "Smoke College"})
check("college register -> 201", r.status_code, 201)

# --- session ---------------------------------------------------------------
print("\nSESSION")
r = c.get("/auth/me")
check("GET /auth/me with cookie -> 200", r.status_code, 200)
if r.status_code == 200:
    check("me returns correct email", r.json()["email"], STU)
    check("me returns profile name", r.json()["name"], "Smoke Student")

anon = TestClient(main.app)
check("GET /auth/me anonymous -> 401", anon.get("/auth/me").status_code, 401)
check("GET /auth/session anonymous -> 200", anon.get("/auth/session").status_code, 200)
check("anonymous session authenticated=False",
      anon.get("/auth/session").json()["authenticated"], False)

bad = TestClient(main.app)
bad.cookies.set("oos_session", "totally-made-up-token")
check("forged cookie rejected -> 401", bad.get("/auth/me").status_code, 401)

# --- login -----------------------------------------------------------------
print("\nLOGIN")
l = TestClient(main.app)
check("wrong password -> 401",
      l.post("/auth/login", json={"email": STU, "password": "WrongPass123"}).status_code, 401)
check("unknown email -> 401",
      l.post("/auth/login", json={"email": f"ghost{MARK}", "password": "TestPass123"}).status_code, 401)
check("pending company login -> 403",
      l.post("/auth/login", json={"email": COM, "password": "TestPass123"}).status_code, 403)
r = l.post("/auth/login", json={"email": STU, "password": "TestPass123"})
check("correct credentials -> 200", r.status_code, 200)
check("login sets session cookie", "oos_session" in l.cookies, True)

# --- logout ----------------------------------------------------------------
print("\nLOGOUT")
check("logout -> 200", l.post("/auth/logout").status_code, 200)
check("me after logout -> 401", l.get("/auth/me").status_code, 401)

# --- role guards -----------------------------------------------------------
print("\nROLE GUARDS")
from fastapi import Depends
from app.security import require_roles
main.app.router.routes = main.app.router.routes  # no-op, keep router stable

@main.app.get("/_smoke/company-only")
def _company_only(u=Depends(require_roles(am.ROLE_COMPANY))):
    return {"ok": True}

g = TestClient(main.app)
check("guard: anonymous -> 401", g.get("/_smoke/company-only").status_code, 401)
g.post("/auth/login", json={"email": STU, "password": "TestPass123"})
check("guard: student hitting company route -> 403",
      g.get("/_smoke/company-only").status_code, 403)

# --- password change revokes sessions --------------------------------------
print("\nPASSWORD CHANGE")
p = TestClient(main.app)
p.post("/auth/login", json={"email": STU, "password": "TestPass123"})
other = TestClient(main.app)
other.post("/auth/login", json={"email": STU, "password": "TestPass123"})
r = p.post("/auth/change-password",
           json={"current_password": "TestPass123", "new_password": "NewPass456"})
check("change password -> 200", r.status_code, 200)
check("other session revoked -> 401", other.get("/auth/me").status_code, 401)
check("old password rejected -> 401",
      TestClient(main.app).post("/auth/login",
                                json={"email": STU, "password": "TestPass123"}).status_code, 401)
check("new password works -> 200",
      TestClient(main.app).post("/auth/login",
                                json={"email": STU, "password": "NewPass456"}).status_code, 200)

# --- storage checks --------------------------------------------------------
print("\nSTORAGE")
db = SessionLocal()
u = db.query(am.User).filter(am.User.email == STU).first()
check("password is hashed, not plaintext", u.password_hash.startswith("$2"), True)
check("password hash != plaintext", u.password_hash != "NewPass456", True)
sess = db.query(am.UserSession).filter(am.UserSession.user_id == u.id).first()
check("session token stored as 64-char hash", len(sess.token_hash), 64)
db.close()

# --- upload validation -----------------------------------------------------
print("\nUPLOAD HARDENING")
up = TestClient(main.app)
check("reject .exe -> 400",
      up.post("/upload", files={"file": ("x.exe", b"MZ", "application/octet-stream")}).status_code, 400)
check("reject .php -> 400",
      up.post("/upload", files={"file": ("x.php", b"<?php", "text/plain")}).status_code, 400)
check("oversized file -> 413",
      up.post("/upload", files={"file": ("big.png", b"x" * (6 * 1024 * 1024), "image/png")}).status_code, 413)

print("\n" + "=" * 96)
removed = cleanup()
print(f"CLEANUP: removed {removed} test users (and their sessions/profiles)")
db = SessionLocal()
left = db.query(am.User).filter(am.User.email.like(f"%{MARK}")).count()
db.close()
print(f"residual test rows: {left}")
print(f"\nRESULT: {passed} passed, {failed} failed")
print("=" * 96)
sys.exit(1 if failed else 0)
