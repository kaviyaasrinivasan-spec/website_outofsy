"""Sections 8-9: progress tracking, mentors, certificates, public verification."""
import sys, pathlib, importlib
from datetime import date, timedelta

BACKEND = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

db = importlib.import_module("app.database")
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

p = pathlib.Path(__file__).parent / "smoke_ops3.db"
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
from app.ops_progress import CERT_DIR
db.Base.metadata.create_all(bind=db.engine)

from fastapi.testclient import TestClient

passed = failed = 0
def check(label, got, want):
    global passed, failed
    ok = got == want
    if ok: passed += 1
    else:  failed += 1
    print(f"  [{'OK ' if ok else 'FAIL'}] {label:<56} {got} (want {want})")

s = db.SessionLocal()
seed_default_permissions(s)
for e, r in [("super@ops.co", om.ROLE_SUPER_ADMIN), ("exec@ops.co", om.ROLE_OPS_EXECUTIVE)]:
    s.add(am.User(email=e, password_hash=sec.hash_password("TestPass123"),
                  role=r, status=am.STATUS_ACTIVE, email_verified=True))
s.commit(); s.close()

def login(email):
    c = TestClient(main.app)
    assert c.post("/auth/login", json={"email": email, "password": "TestPass123"}).status_code == 200
    return c

sup, ex = login("super@ops.co"), login("exec@ops.co")

# --- set up a company, internship, student, and drive to 'joined' ---
co = sup.post("/ops/companies", json={"name":"Acme Tech","is_verified":True}).json()["id"]
i1 = sup.post("/ops/internships", json={
    "company_id": co, "title":"Backend Intern", "duration":"1 Month",
    "status":"active", "openings":5, "certificate_available":True,
    "start_date": str(date.today()), "end_date": str(date.today()+timedelta(days=30))
}).json()["id"]
i_nocert = sup.post("/ops/internships", json={
    "company_id": co, "title":"No Cert Role", "status":"active",
    "openings":5, "certificate_available":False}).json()["id"]

stu = TestClient(main.app)
stu.post("/auth/register", json={"full_name":"Kaviya S","email":"kaviya@oosqa.co",
                                 "password":"TestPass123","college_name":"Anna University"})
app_id = stu.post("/student/applications", json={"internship_id": i1}).json()["id"]
for st in ["under_review","shortlisted","selected","offer_released","joined"]:
    sup.patch(f"/ops/applications/{app_id}", json={"status": st})

print("=" * 100)
print("SECTION 8 -- PROGRESS TRACKING")
lst = sup.get("/ops/progress").json()
check("joining auto-created a progress row", lst["total"], 1)
pid = lst["items"][0]["id"]
check("  joining date populated", lst["items"][0]["joining_date"] is not None, True)
check("  paginated envelope", "total_pages" in lst, True)

print("\n  mentors:")
m = sup.post("/ops/mentors", json={"full_name":"Ravi Kumar","company_id":co,
                                   "email":"ravi@acme.co","designation":"Lead Engineer"})
check("create mentor -> 201", m.status_code, 201)
mid = m.json()["id"]
check("assign mentor", sup.patch(f"/ops/progress/{pid}", json={"mentor_id":mid}).status_code, 200)
check("  nonexistent mentor -> 400",
      sup.patch(f"/ops/progress/{pid}", json={"mentor_id":9999}).status_code, 400)
check("  mentor shown on detail", sup.get(f"/ops/progress/{pid}").json()["mentor"]["full_name"], "Ravi Kumar")

print("\n  attendance + tasks:")
check("record attendance", sup.patch(f"/ops/progress/{pid}",
      json={"days_present":18,"days_total":22}).status_code, 200)
check("  attendance % derived", sup.get(f"/ops/progress/{pid}").json()["attendance_percent"], 82)
check("present > total rejected -> 400",
      sup.patch(f"/ops/progress/{pid}", json={"days_present":99,"days_total":22}).status_code, 400)
r = sup.patch(f"/ops/progress/{pid}", json={"tasks_completed":8,"tasks_assigned":10})
check("record tasks", r.status_code, 200)
check("  completion % from tasks", r.json()["completion_percent"], 80)
check("completed > assigned rejected -> 400",
      sup.patch(f"/ops/progress/{pid}", json={"tasks_completed":50,"tasks_assigned":10}).status_code, 400)
check("score out of range -> 422",
      sup.patch(f"/ops/progress/{pid}", json={"performance_score":150}).status_code, 422)

print("\n  weekly reports:")
check("submit week 1", sup.post(f"/ops/progress/{pid}/reports",
      json={"week_number":1,"summary":"Set up environment","hours_logged":38}).status_code, 201)
r2 = sup.post(f"/ops/progress/{pid}/reports", json={"week_number":2,"summary":"Built API"})
check("submit week 2", r2.status_code, 201)
rid = r2.json()["id"]
check("duplicate week -> 409", sup.post(f"/ops/progress/{pid}/reports",
      json={"week_number":1,"summary":"dup"}).status_code, 409)
check("week 0 rejected -> 422", sup.post(f"/ops/progress/{pid}/reports",
      json={"week_number":0}).status_code, 422)
check("hours > 168 rejected -> 422", sup.post(f"/ops/progress/{pid}/reports",
      json={"week_number":5,"hours_logged":200}).status_code, 422)
check("mentor comments on report",
      sup.patch(f"/ops/progress/reports/{rid}", json={"mentor_comment":"Good work"}).status_code, 200)
det = sup.get(f"/ops/progress/{pid}").json()
check("  2 reports on detail", len(det["weekly_reports"]), 2)
check("  comment saved", det["weekly_reports"][1]["mentor_comment"], "Good work")

print("\nSECTION 9 -- CERTIFICATES")
print("  guard: no certificate before completion")
check("generate while in-progress -> 400",
      sup.post(f"/ops/certificates/generate/{app_id}").status_code, 400)

sup.patch(f"/ops/applications/{app_id}", json={"status":"in_progress"})
r = sup.post(f"/ops/progress/{pid}/complete?performance_score=88&final_evaluation=Excellent")
check("complete internship -> 200", r.status_code, 200)
check("  application now completed", r.json()["application_status"], "completed")

print("\n  issuance:")
r = sup.post(f"/ops/certificates/generate/{app_id}")
check("generate -> 201", r.status_code, 201)
cert_id = r.json()["id"]
cert_no = r.json()["certificate_number"]
check("  number formatted OOS/YYYY/nnnnn", cert_no.startswith(f"OOS/{date.today().year}/"), True)
check("  starts pending", sup.get("/ops/certificates").json()["items"][0]["status"], "pending")
check("duplicate issue -> 400", sup.post(f"/ops/certificates/generate/{app_id}").status_code, 400)
check("download before approval -> 404",
      sup.get(f"/ops/certificates/{cert_id}/download").status_code, 404)
check("executive CANNOT approve -> 403",
      ex.post(f"/ops/certificates/{cert_id}/approve").status_code, 403)

print("\n  approval renders a real PDF:")
r = sup.post(f"/ops/certificates/{cert_id}/approve")
check("approve -> 200", r.status_code, 200)
fname = r.json()["file_url"].rsplit("/",1)[-1]
pdf = CERT_DIR / fname
check("  PDF written to disk", pdf.exists(), True)
check("  non-trivial size (>3KB)", pdf.stat().st_size > 3000, True)
check("  valid PDF magic bytes", pdf.read_bytes()[:4], b"%PDF")
check("  status now issued", sup.get("/ops/certificates").json()["items"][0]["status"], "issued")
d = sup.get(f"/ops/certificates/{cert_id}/download")
check("download -> 200", d.status_code, 200)
check("  served as PDF", d.headers["content-type"], "application/pdf")

print("\n  public verification (no auth):")
anon = TestClient(main.app)
s3 = db.SessionLocal()
code = s3.query(om.Certificate).filter(om.Certificate.id==cert_id).first().verification_code
s3.close()
v = anon.get(f"/verify/{code}")
check("verify -> 200", v.status_code, 200)
vj = v.json()
check("  valid", vj["valid"], True)
check("  student name shown", vj["student_name"], "Kaviya S")
check("  company shown", vj["company_name"], "Acme Tech")
check("  no email leaked", "email" not in vj, True)
check("bad code -> valid:false", anon.get("/verify/madeupcode").json()["valid"], False)

print("\n  revocation:")
check("revoke -> 200", sup.post(f"/ops/certificates/{cert_id}/revoke?reason=Issued in error").status_code, 200)
rv = anon.get(f"/verify/{code}").json()
check("  verification now fails", rv["valid"], False)
check("  reason given", "revoked" in rv["reason"].lower(), True)
check("cannot re-approve a revoked cert -> 400",
      sup.post(f"/ops/certificates/{cert_id}/approve").status_code, 400)

print("\n  certificate_available=false is honoured:")
stu2 = TestClient(main.app)
stu2.post("/auth/register", json={"full_name":"No Cert","email":"nc@oosqa.co","password":"TestPass123"})
a2 = stu2.post("/student/applications", json={"internship_id": i_nocert}).json()["id"]
for st in ["under_review","shortlisted","selected","offer_released","joined","in_progress","completed"]:
    sup.patch(f"/ops/applications/{a2}", json={"status": st})
r = sup.post(f"/ops/certificates/generate/{a2}")
check("blocked when internship offers none -> 400", r.status_code, 400)
check("  reason explains why", "does not offer" in r.json()["detail"], True)

print("\n  bulk generation:")
ids = []
for n in range(3):
    c = TestClient(main.app)
    c.post("/auth/register", json={"full_name":f"Bulk {n}","email":f"bulk{n}@oosqa.co",
                                   "password":"TestPass123"})
    aid = c.post("/student/applications", json={"internship_id": i1}).json()["id"]
    for st in ["under_review","shortlisted","selected","offer_released","joined","in_progress","completed"]:
        sup.patch(f"/ops/applications/{aid}", json={"status": st})
    ids.append(aid)
r = sup.post("/ops/certificates/bulk-generate", json=ids + [99999, app_id])
check("bulk -> 200", r.status_code, 200)
check("  3 created", len(r.json()["created"]), 3)
check("  2 skipped", len(r.json()["skipped"]), 2)
reasons = " ".join(x["reason"] for x in r.json()["skipped"])
check("  reasons explain each skip", "not found" in reasons and "already exists" in reasons, True)

print("\nAUDIT")
acts = {i["action"] for i in sup.get("/ops/audit-logs").json()["items"]}
check("approval logged", "approved" in acts, True)
check("revocation logged", "revoked" in acts, True)
check("completion logged", "completed" in acts, True)

print("\n" + "=" * 100)
print(f"RESULT: {passed} passed, {failed} failed")
print("=" * 100)
sys.exit(1 if failed else 0)
