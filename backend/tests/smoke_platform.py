"""Full smoke test of the rewritten OOS API, against local SQLite.

Production Postgres is at max_connections, so this runs on a throwaway SQLite
file. The real source tree is untouched.
"""
import sys, pathlib, importlib
from datetime import datetime, timedelta, timezone

BACKEND = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

db = importlib.import_module("app.database")
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

p = pathlib.Path(__file__).parent / "smoke_platform.db"
if p.exists():
    p.unlink()
db.engine = create_engine(f"sqlite:///{p}", connect_args={"check_same_thread": False})
db.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=db.engine)

main = importlib.import_module("app.main")
main.SessionLocal = db.SessionLocal
import app.auth_models as am
db.Base.metadata.create_all(bind=db.engine)

from fastapi.testclient import TestClient

passed = failed = 0
def check(label, got, want):
    global passed, failed
    ok = got == want
    globals()['passed' if ok else 'failed'] = (passed + 1) if ok else passed
    if not ok:
        globals()['failed'] = failed + 1
    print(f"  [{'OK ' if ok else 'FAIL'}] {label:<54} {got} (want {want})")
    return ok

# seed a company + internships directly
s = db.SessionLocal()
co = am.Company(name="Acme Tech", industry="Software", location="Chennai", is_verified=True)
s.add(co); s.flush()
live = am.Internship(company_id=co.id, title="Frontend Intern", duration="1 Month",
                     work_mode="Remote", stipend="5000/month",
                     required_skills="React, TypeScript",
                     status=am.INTERNSHIP_ACTIVE, is_featured=True,
                     last_date_to_apply=datetime.now(timezone.utc) + timedelta(days=30))
draft = am.Internship(company_id=co.id, title="Secret Draft Role",
                      status=am.INTERNSHIP_DRAFT)
expired = am.Internship(company_id=co.id, title="Expired Role",
                        status=am.INTERNSHIP_ACTIVE,
                        last_date_to_apply=datetime.now(timezone.utc) - timedelta(days=2))
s.add_all([live, draft, expired]); s.commit()
live_id, draft_id, expired_id = live.id, draft.id, expired.id
s.close()

print("=" * 104)
print("PUBLIC (no auth)")
anon = TestClient(main.app)
check("GET /internships", anon.get("/internships").status_code, 200)
body = anon.get("/internships").json()
check("  only active listed (draft hidden)", body["total"], 2)
titles = [i["title"] for i in body["items"]]
check("  draft not exposed", "Secret Draft Role" in titles, False)
check("  skills parsed to list",
      body["items"][0]["required_skills"] == ["React", "TypeScript"]
      or body["items"][1]["required_skills"] == ["React", "TypeScript"], True)
check("GET /internships?featured=true", anon.get("/internships?featured=true").json()["total"], 1)
check("GET /internships?search=React", anon.get("/internships?search=React").json()["total"], 1)
check("GET /internships?work_mode=Remote", anon.get("/internships?work_mode=Remote").json()["total"], 1)
check("GET /internships/{id} active", anon.get(f"/internships/{live_id}").status_code, 200)
check("GET /internships/{id} draft -> 404", anon.get(f"/internships/{draft_id}").status_code, 404)
check("GET /meta/options", anon.get("/meta/options").status_code, 200)
check("GET /stats", anon.get("/stats").json()["active_internships"], 2)
check("GET /success-stories", anon.get("/success-stories").status_code, 200)
check("POST /contact valid", anon.post("/contact", json={
    "name": "Kaviya", "email": "k@oosqa.co", "subject": "Hi", "message": "Hello there"}).status_code, 201)
check("POST /contact blank message -> 422", anon.post("/contact", json={
    "name": "X", "email": "k@oosqa.co", "message": "  "}).status_code, 422)

print("\nSTUDENT ENDPOINTS REQUIRE AUTH")
for path in ("/student/overview", "/student/profile", "/student/applications",
             "/student/saved", "/student/notifications", "/student/membership"):
    check(f"  anon {path} -> 401", anon.get(path).status_code, 401)
check("  anon apply -> 401",
      anon.post("/student/applications", json={"internship_id": live_id}).status_code, 401)

print("\nREGISTRATION (students only)")
c = TestClient(main.app)
r = c.post("/auth/register", json={"full_name": "Kaviya S", "email": "kaviya@oosqa.co",
                                   "password": "TestPass123", "college_name": "Anna Univ"})
check("register -> 201", r.status_code, 201)
check("  role is student", r.json()["role"], "student")
check("  member_id issued", bool(r.json()["member_id"]), True)
check("  session cookie set", "oos_session" in c.cookies, True)
check("duplicate email -> 409", c.post("/auth/register", json={
    "full_name": "Dup", "email": "kaviya@oosqa.co", "password": "TestPass123"}).status_code, 409)
check("weak password -> 422", c.post("/auth/register", json={
    "full_name": "W", "email": "w@oosqa.co", "password": "short"}).status_code, 422)
# role can no longer be chosen by the client
check("role field ignored (no company signup)", c.post("/auth/register", json={
    "full_name": "C", "email": "c@oosqa.co", "password": "TestPass123",
    "role": "admin"}).json().get("role"), "student")

print("\nDASHBOARD")
ov = c.get("/student/overview")
check("GET /student/overview", ov.status_code, 200)
check("  starts with 0 applications", ov.json()["active_applications"], 0)
check("  welcome notification created", c.get("/student/notifications").json().__len__(), 1)
check("  unread count 1", c.get("/student/overview").json()["unread_notifications"], 1)

print("\nPROFILE")
check("GET /student/profile", c.get("/student/profile").status_code, 200)
r = c.patch("/student/profile", json={"course": "B.E / B.Tech", "current_year": "Final Year",
                                      "skills": "React, Python", "city": "Chennai",
                                      "phone": "9876543210"})
check("PATCH profile -> 200", r.status_code, 200)
check("  completion rose", r.json()["completion_percent"] > 25, True)
check("PATCH bad course -> 422",
      c.patch("/student/profile", json={"course": "Underwater Basket Weaving"}).status_code, 422)
check("PATCH bad year -> 422",
      c.patch("/student/profile", json={"current_year": "7th Year"}).status_code, 422)
check("  omitted fields untouched", c.get("/student/profile").json()["city"], "Chennai")

print("\nAPPLY")
r = c.post("/student/applications", json={"internship_id": live_id, "cover_note": "Keen!"})
check("apply -> 201", r.status_code, 201)
check("  status applied", r.json()["status"], "applied")
check("duplicate apply -> 409",
      c.post("/student/applications", json={"internship_id": live_id}).status_code, 409)
check("apply to draft -> 404",
      c.post("/student/applications", json={"internship_id": draft_id}).status_code, 404)
check("apply past deadline -> 400",
      c.post("/student/applications", json={"internship_id": expired_id}).status_code, 400)
check("apply to missing id -> 404",
      c.post("/student/applications", json={"internship_id": 99999}).status_code, 404)
check("has_applied reflected in listing",
      [i for i in c.get("/internships").json()["items"] if i["id"] == live_id][0]["has_applied"], True)
check("overview active_applications = 1", c.get("/student/overview").json()["active_applications"], 1)

print("\nSAVE / UNSAVE")
check("save -> saved", c.post(f"/student/saved/{live_id}").json()["message"], "saved")
check("  appears in saved list", len(c.get("/student/saved").json()), 1)
check("toggle -> removed", c.post(f"/student/saved/{live_id}").json()["message"], "removed")
check("  saved list empty", len(c.get("/student/saved").json()), 0)

print("\nWITHDRAW REMOVED")
app_id = c.get("/student/applications").json()[0]["id"]
check("withdraw endpoint is gone -> 404",
      c.post(f"/student/applications/{app_id}/withdraw").status_code, 404)
check("  application still active",
      len(c.get("/student/applications?scope=active").json()), 1)

print("\nCROSS-STUDENT ISOLATION")
c2 = TestClient(main.app)
c2.post("/auth/register", json={"full_name": "Other", "email": "other@oosqa.co",
                                "password": "TestPass123"})
check("other student sees 0 applications", len(c2.get("/student/applications").json()), 0)

print("\nADMIN GUARD")
check("student hitting /admin/companies -> 403", c.get("/admin/companies").status_code, 403)
check("anon hitting /admin/companies -> 401", anon.get("/admin/companies").status_code, 401)
check("student hitting /admin/reports -> 403", c.get("/admin/reports/summary").status_code, 403)

print("\nADMIN PORTAL")
s = db.SessionLocal()
import app.security as sec
s.add(am.User(email="admin@oosqa.co", password_hash=sec.hash_password("AdminPass123"),
              role=am.ROLE_ADMIN, status=am.STATUS_ACTIVE, email_verified=True))
s.commit(); s.close()
a = TestClient(main.app)
check("admin login -> 200",
      a.post("/auth/login", json={"email": "admin@oosqa.co", "password": "AdminPass123"}).status_code, 200)
check("GET /admin/companies", a.get("/admin/companies").status_code, 200)
check("POST /admin/companies -> 201",
      a.post("/admin/companies", json={"name": "New Co", "is_verified": True}).status_code, 201)
check("POST /admin/colleges -> 201",
      a.post("/admin/colleges", json={"name": "New College"}).status_code, 201)
new_co = a.post("/admin/companies", json={"name": "Third Co"}).json()["id"]
check("POST /admin/internships -> 201", a.post("/admin/internships", json={
    "company_id": new_co, "title": "Data Intern", "status": "active",
    "work_mode": "Hybrid"}).status_code, 201)
check("internship bad work_mode -> 422", a.post("/admin/internships", json={
    "company_id": new_co, "title": "X", "work_mode": "Telepathic"}).status_code, 422)
check("internship unknown company -> 400", a.post("/admin/internships", json={
    "company_id": 99999, "title": "X"}).status_code, 400)
check("delete company with internships -> 409",
      a.delete(f"/admin/companies/{new_co}").status_code, 409)
check("GET /admin/students", len(a.get("/admin/students").json()), 3)
check("GET /admin/applications", len(a.get("/admin/applications").json()), 1)
check("GET /admin/contact-messages", len(a.get("/admin/contact-messages").json()), 1)
check("GET /admin/reports/summary", a.get("/admin/reports/summary").status_code, 200)

print("\nADMIN STATUS CHANGE NOTIFIES STUDENT")
before = len(c.get("/student/notifications").json())
check("PATCH application status -> 200", a.patch(f"/admin/applications/{app_id}",
      json={"status": "shortlisted", "admin_notes": "Strong"}).status_code, 200)
check("  student notified", len(c.get("/student/notifications").json()), before + 1)
check("  bad status -> 422",
      a.patch(f"/admin/applications/{app_id}", json={"status": "vibing"}).status_code, 422)

print("\nSUSPENSION REVOKES SESSIONS")
uid = [u["id"] for u in a.get("/admin/students").json() if u["email"] == "other@oosqa.co"][0]
check("suspend -> 200", a.post(f"/admin/students/{uid}/suspend?suspend=true").status_code, 200)
check("  suspended session dies immediately", c2.get("/student/overview").status_code, 401)
check("  suspended login refused -> 403",
      TestClient(main.app).post("/auth/login",
                                json={"email": "other@oosqa.co", "password": "TestPass123"}).status_code, 403)

print("\nNOTIFICATIONS")
check("mark read -> 200", c.post("/student/notifications/read").status_code, 200)
check("  unread now 0", c.get("/student/overview").json()["unread_notifications"], 0)

print("\n" + "=" * 104)
print(f"RESULT: {passed} passed, {failed} failed")
print("=" * 104)
sys.exit(1 if failed else 0)
