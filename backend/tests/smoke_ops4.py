"""Sections 10-12: portal user provisioning, lockout guards, bulk CSV import."""
import sys, pathlib, importlib, io

BACKEND = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

db = importlib.import_module("app.database")
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

p = pathlib.Path(__file__).parent / "smoke_ops4.db"
if p.exists():
    p.unlink()
db.engine = create_engine(f"sqlite:///{p}", connect_args={"check_same_thread": False})
db.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=db.engine)

main = importlib.import_module("app.main")
main.SessionLocal = db.SessionLocal
import app.auth_models as am
import app.ops_models as om
import app.security as sec
from app.permissions import seed_default_permissions
db.Base.metadata.create_all(bind=db.engine)

from fastapi.testclient import TestClient

passed = failed = 0
def check(label, got, want):
    global passed, failed
    ok = got == want
    if ok: passed += 1
    else:  failed += 1
    print(f"  [{'OK ' if ok else 'FAIL'}] {label:<58} {got} (want {want})")

s = db.SessionLocal()
seed_default_permissions(s)
for e, r in [("super@ops.co", om.ROLE_SUPER_ADMIN), ("mgr@ops.co", om.ROLE_OPS_MANAGER),
             ("exec@ops.co", om.ROLE_OPS_EXECUTIVE)]:
    s.add(am.User(email=e, password_hash=sec.hash_password("TestPass123"),
                  role=r, status=am.STATUS_ACTIVE, email_verified=True))
s.commit(); s.close()

def login(email, pw="TestPass123"):
    c = TestClient(main.app)
    r = c.post("/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, f"{email}: {r.status_code} {r.text[:150]}"
    return c

sup, mgr, ex = login("super@ops.co"), login("mgr@ops.co"), login("exec@ops.co")
co = sup.post("/ops/companies", json={"name":"Acme Tech"}).json()["id"]
co2 = sup.post("/ops/companies", json={"name":"Rival Corp"}).json()["id"]
col = sup.post("/ops/colleges", json={"name":"Anna University"}).json()["id"]

print("=" * 102)
print("SECTION 11 -- COMPANY HR PROVISIONING")
r = sup.post("/ops/users", json={"email":"hr@acme.co","full_name":"HR Person",
                                 "role":"company_hr","company_id":co})
check("create HR login -> 201", r.status_code, 201)
hr_id, hr_pw = r.json()["id"], r.json()["temporary_password"]
check("  temp password returned", len(hr_pw) >= 12, True)
check("  password not stored in plaintext",
      db.SessionLocal().query(am.User).filter(am.User.id==hr_id).first().password_hash != hr_pw, True)
check("  flagged as unset password",
      db.SessionLocal().query(am.User).filter(am.User.id==hr_id).first().password_set, False)

print("\n  scope is mandatory for scoped roles:")
check("HR without company_id -> 400",
      sup.post("/ops/users", json={"email":"x@a.co","full_name":"X","role":"company_hr"}).status_code, 400)
check("coordinator without college_id -> 400",
      sup.post("/ops/users", json={"email":"y@a.co","full_name":"Y","role":"college_coordinator"}).status_code, 400)
check("HR with bogus company -> 400",
      sup.post("/ops/users", json={"email":"z@a.co","full_name":"Z","role":"company_hr",
                                   "company_id":9999}).status_code, 400)
check("duplicate email -> 409",
      sup.post("/ops/users", json={"email":"hr@acme.co","full_name":"Dup","role":"company_hr",
                                   "company_id":co}).status_code, 409)
check("student role not provisionable -> 422",
      sup.post("/ops/users", json={"email":"s@a.co","full_name":"S","role":"student"}).status_code, 422)

print("\n  the new HR login actually works and is scoped:")
hr = login("hr@acme.co", hr_pw)
check("HR can sign in with temp password", hr.get("/auth/me").status_code, 200)
check("  sees only own company", hr.get("/ops/companies").json()["total"], 1)
check("  blocked from rival -> 403", hr.get(f"/ops/companies/{co2}").status_code, 403)
check("  cannot provision users -> 403",
      hr.post("/ops/users", json={"email":"n@a.co","full_name":"N","role":"company_hr",
                                  "company_id":co}).status_code, 403)

print("\nSECTION 10 -- COLLEGE COORDINATOR PROVISIONING")
r = sup.post("/ops/users", json={"email":"coord@anna.edu","full_name":"Coordinator",
                                 "role":"college_coordinator","college_id":col})
check("create coordinator -> 201", r.status_code, 201)
coord_pw = r.json()["temporary_password"]
coord = login("coord@anna.edu", coord_pw)
check("coordinator signs in", coord.get("/auth/me").status_code, 200)
check("  scope exposed to UI", coord.get("/ops/me/permissions").json()["scope"]["college_id"], col)

print("\nSUPER ADMIN GUARD")
check("manager CANNOT create a super_admin -> 403",
      mgr.post("/ops/users", json={"email":"sa@a.co","full_name":"SA",
                                   "role":"super_admin"}).status_code, 403)
check("super_admin CAN -> 201",
      sup.post("/ops/users", json={"email":"sa@a.co","full_name":"SA",
                                   "role":"super_admin"}).status_code, 201)
sa_id = [u for u in sup.get("/ops/users").json()["items"] if u["email"]=="sa@a.co"][0]["id"]
check("manager cannot modify a super_admin -> 403",
      mgr.patch(f"/ops/users/{sa_id}", json={"account_status":"suspended"}).status_code, 403)
check("manager cannot reset a super_admin password -> 403",
      mgr.post(f"/ops/users/{sa_id}/reset-password").status_code, 403)

print("\nSELF-LOCKOUT GUARDS")
me = sup.get("/auth/me").json()["id"]
check("cannot change own role -> 400",
      sup.patch(f"/ops/users/{me}", json={"role":"ops_executive"}).status_code, 400)
check("cannot suspend self -> 400",
      sup.patch(f"/ops/users/{me}", json={"account_status":"suspended"}).status_code, 400)
check("cannot delete self -> 400", sup.delete(f"/ops/users/{me}").status_code, 400)

print("\nROLE CHANGE REVOKES SESSIONS")
check("HR session alive before", hr.get("/auth/me").status_code, 200)
check("promote HR to executive", sup.patch(f"/ops/users/{hr_id}",
      json={"role":"ops_executive"}).status_code, 200)
check("  old session killed -> 401", hr.get("/auth/me").status_code, 401)
u = db.SessionLocal().query(am.User).filter(am.User.id==hr_id).first()
check("  stale company scope cleared", u.company_id, None)

print("\nPASSWORD RESET")
r = sup.post(f"/ops/users/{hr_id}/reset-password")
check("reset -> 200", r.status_code, 200)
new_pw = r.json()["temporary_password"]
check("  new password differs", new_pw != hr_pw, True)
check("  old password rejected",
      TestClient(main.app).post("/auth/login",
                                json={"email":"hr@acme.co","password":hr_pw}).status_code, 401)
check("  new password works",
      TestClient(main.app).post("/auth/login",
                                json={"email":"hr@acme.co","password":new_pw}).status_code, 200)

print("\nSUSPEND / ACTIVITY LOG")
check("suspend user", sup.patch(f"/ops/users/{hr_id}",
      json={"account_status":"suspended"}).status_code, 200)
check("  suspended login refused -> 403",
      TestClient(main.app).post("/auth/login",
                                json={"email":"hr@acme.co","password":new_pw}).status_code, 403)
act = sup.get(f"/ops/users/{me}/activity").json()
check("activity log paginated", "total_pages" in act, True)
check("  scoped to that user", act["user"]["id"], me)
check("  entries recorded", act["total"] > 0, True)
check("executive cannot view activity -> 403", ex.get(f"/ops/users/{me}/activity").status_code, 403)

print("\nLAST SUPER ADMIN CANNOT BE DELETED")
s2 = db.SessionLocal()
for u in s2.query(am.User).filter(am.User.role==om.ROLE_SUPER_ADMIN,
                                  am.User.email!="super@ops.co").all():
    s2.delete(u)
s2.commit(); s2.close()
check("deleting the last super admin -> 400", sup.delete(f"/ops/users/{me}").status_code, 400)

print("\nSECTION 10 -- BULK STUDENT CSV IMPORT")
t = sup.get("/ops/students/bulk-upload/template").json()
check("template lists required columns", t["required_columns"], ["full_name","email"])

good = ("full_name,email,phone,course,current_year\n"
        "Kaviya S,kaviya@oosqa.co,9876543210,B.E / B.Tech,Final Year\n"
        "Ravi Kumar,ravi@oosqa.co,9876543211,BCA,3rd Year\n"
        "Dup Row,kaviya@oosqa.co,,,\n"
        ",noname@oosqa.co,,,\n"
        "Bad Email,not-an-email,,,\n")
r = sup.post(f"/ops/students/bulk-upload?college_id={col}",
             files={"file": ("students.csv", good.encode(), "text/csv")})
check("upload -> 200", r.status_code, 200)
j = r.json()
check("  2 created", j["created_count"], 2)
check("  3 skipped", j["skipped_count"], 3)
reasons = " ".join(x["reason"] for x in j["skipped"])
check("  duplicate-in-file caught", "duplicate within file" in reasons, True)
check("  missing name caught", "missing full_name or email" in reasons, True)
check("  invalid email caught", "invalid email" in reasons, True)
check("  temp passwords returned", all("temporary_password" in c for c in j["created"]), True)
check("  students now listed", sup.get("/ops/students").json()["total"], 2)
check("  college applied from param",
      sup.get("/ops/students").json()["items"][0]["college_name"], "Anna University")

print("\n  re-upload must not clobber existing accounts:")
r2 = sup.post(f"/ops/students/bulk-upload?college_id={col}",
              files={"file": ("students.csv", good.encode(), "text/csv")})
check("  0 created on re-run", r2.json()["created_count"], 0)
check("  reported as already registered",
      "already registered" in " ".join(x["reason"] for x in r2.json()["skipped"]), True)
imported_pw = j["created"][0]["temporary_password"]
check("  original password still valid",
      TestClient(main.app).post("/auth/login",
                                json={"email":"kaviya@oosqa.co",
                                      "password":imported_pw}).status_code, 200)

print("\n  bad input:")
check("non-CSV rejected -> 400",
      sup.post("/ops/students/bulk-upload",
               files={"file": ("x.txt", b"hello", "text/plain")}).status_code, 400)
check("missing columns -> 400",
      sup.post("/ops/students/bulk-upload",
               files={"file": ("x.csv", b"name,mail\nA,b@c.co\n", "text/csv")}).status_code, 400)
check("empty file -> 400",
      sup.post("/ops/students/bulk-upload",
               files={"file": ("x.csv", b"", "text/csv")}).status_code, 400)

print("\n  coordinator import is forced to their own college:")
c2 = sup.post("/ops/colleges", json={"name":"Other College"}).json()["id"]
csv2 = "full_name,email\nForced Student,forced@oosqa.co\n"
r3 = coord.post(f"/ops/students/bulk-upload?college_id={c2}",
                files={"file": ("s.csv", csv2.encode(), "text/csv")})
check("upload -> 200", r3.status_code, 200)
s3 = db.SessionLocal()
prof = s3.query(am.StudentProfile).filter(am.StudentProfile.full_name=="Forced Student").first()
check("  college overridden to coordinator's own", prof.college_name, "Anna University")
s3.close()

print("\n" + "=" * 102)
print(f"RESULT: {passed} passed, {failed} failed")
print("=" * 102)
sys.exit(1 if failed else 0)
