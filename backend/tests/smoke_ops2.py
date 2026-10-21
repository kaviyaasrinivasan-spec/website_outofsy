"""Sections 2-7 smoke test: CRUD, scoping, pagination, 12-stage pipeline."""
import sys, pathlib, importlib
from datetime import date, timedelta

BACKEND = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

db = importlib.import_module("app.database")
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

p = pathlib.Path(__file__).parent / "smoke_ops2.db"
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
    print(f"  [{'OK ' if ok else 'FAIL'}] {label:<56} {got} (want {want})")

s = db.SessionLocal()
seed_default_permissions(s)
def mk(email, role, **kw):
    u = am.User(email=email, password_hash=sec.hash_password("TestPass123"),
                role=role, status=am.STATUS_ACTIVE, email_verified=True, **kw)
    s.add(u); s.flush(); return u.id
mk("super@ops.co", om.ROLE_SUPER_ADMIN)
mk("mgr@ops.co", om.ROLE_OPS_MANAGER)
mk("exec@ops.co", om.ROLE_OPS_EXECUTIVE)
s.commit(); s.close()

def login(email):
    c = TestClient(main.app)
    r = c.post("/auth/login", json={"email": email, "password": "TestPass123"})
    assert r.status_code == 200, f"{email}: {r.text[:200]}"
    return c

sup, mgr, ex = login("super@ops.co"), login("mgr@ops.co"), login("exec@ops.co")

print("=" * 100)
print("SECTION 2 -- COMPANIES")
r = sup.post("/ops/companies", json={"name":"Acme Tech","industry":"Software",
                                     "gst_number":"29ABCDE1234F1Z5","is_verified":True})
check("create -> 201", r.status_code, 201)
c1 = r.json()["id"]
c2 = sup.post("/ops/companies", json={"name":"Rival Corp"}).json()["id"]
check("duplicate name -> 409", sup.post("/ops/companies", json={"name":"acme tech"}).status_code, 409)
check("list is paginated", set(["items","total","page","total_pages","has_next"])
      <= set(sup.get("/ops/companies").json()), True)
check("  total = 2", sup.get("/ops/companies").json()["total"], 2)
check("page_size honoured", len(sup.get("/ops/companies?page_size=1").json()["items"]), 1)
check("  has_next true", sup.get("/ops/companies?page_size=1").json()["has_next"], True)
check("page_size cap enforced -> 422", sup.get("/ops/companies?page_size=9999").status_code, 422)
check("search filter", sup.get("/ops/companies?search=Acme").json()["total"], 1)
check("detail shows counts", "internship_count" in sup.get(f"/ops/companies/{c1}").json(), True)
check("executive CANNOT delete -> 403", ex.delete(f"/ops/companies/{c2}").status_code, 403)

print("\nSECTION 3 -- COLLEGES")
r = sup.post("/ops/colleges", json={"name":"Anna University","university":"Anna",
                                    "college_code":"AU01","placement_officer":"Mr X"})
check("create -> 201", r.status_code, 201)
col1 = r.json()["id"]
check("bad partnership_status -> 422",
      sup.post("/ops/colleges", json={"name":"X","partnership_status":"vibing"}).status_code, 422)
check("approve college", sup.post(f"/ops/colleges/{col1}/status?partnership_status=approved").status_code, 200)
check("  reflected", sup.get(f"/ops/colleges/{col1}").json()["partnership_status"], "approved")

print("\nSECTION 4 -- INTERNSHIPS")
r = sup.post("/ops/internships", json={
    "company_id": c1, "title":"Backend Intern", "department":"Engineering",
    "work_mode":"Remote", "openings":2, "certificate_available":True,
    "ppo_available":True, "status":"active",
    "start_date": str(date.today()), "end_date": str(date.today()+timedelta(days=30))})
check("create -> 201", r.status_code, 201)
i1 = r.json()["id"]
check("end before start -> 400", sup.post("/ops/internships", json={
    "company_id": c1, "title":"Bad", "start_date": str(date.today()),
    "end_date": str(date.today()-timedelta(days=5))}).status_code, 400)
check("unknown company -> 400",
      sup.post("/ops/internships", json={"company_id":9999,"title":"X"}).status_code, 400)
check("bad work_mode -> 422",
      sup.post("/ops/internships", json={"company_id":c1,"title":"X","work_mode":"Astral"}).status_code, 422)
r = sup.post(f"/ops/internships/{i1}/clone")
check("clone -> 201", r.status_code, 201)
clone_id = r.json()["id"]
clone = [x for x in sup.get("/ops/internships").json()["items"] if x["id"]==clone_id][0]
check("  clone lands as draft", clone["status"], "draft")
check("  clone title marked", clone["title"].endswith("(Copy)"), True)
check("pause internship", sup.post(f"/ops/internships/{i1}/status?status=paused").status_code, 200)
check("  restore to active", sup.post(f"/ops/internships/{i1}/status?status=active").status_code, 200)
check("executive CANNOT publish a draft -> 403",
      ex.post(f"/ops/internships/{clone_id}/status?status=active").status_code, 403)
check("applicant count attached", "application_count" in sup.get("/ops/internships").json()["items"][0], True)

print("\nDEACTIVATING A COMPANY CLOSES ITS LISTINGS")
c3 = sup.post("/ops/companies", json={"name":"Temp Co"}).json()["id"]
i3 = sup.post("/ops/internships", json={"company_id":c3,"title":"Temp Role","status":"active"}).json()["id"]
check("listing active", [x for x in sup.get("/ops/internships").json()["items"] if x["id"]==i3][0]["status"], "active")
check("deactivate company", sup.post(f"/ops/companies/{c3}/activate?active=false").status_code, 200)
check("  its listing auto-closed",
      [x for x in sup.get("/ops/internships").json()["items"] if x["id"]==i3][0]["status"], "closed")
check("deactivated company cannot post -> 400",
      sup.post("/ops/internships", json={"company_id":c3,"title":"Nope"}).status_code, 400)

print("\nSECTION 5 -- STUDENTS")
stu = TestClient(main.app)
stu.post("/auth/register", json={"full_name":"Test Student","email":"stu@oosqa.co",
                                 "password":"TestPass123","college_name":"Anna University"})
check("student list paginated", sup.get("/ops/students").json()["total"], 1)
sid = sup.get("/ops/students").json()["items"][0]["id"]
d = sup.get(f"/ops/students/{sid}").json()
check("detail has profile", d["profile"]["full_name"], "Test Student")
check("detail has membership", bool(d["membership"]["member_id"]), True)
check("detail has history list", isinstance(d["internship_history"], list), True)
check("search by name", sup.get("/ops/students?search=Test").json()["total"], 1)
check("search miss", sup.get("/ops/students?search=Nobody").json()["total"], 0)

print("\nSECTION 6-7 -- APPLICATION PIPELINE")
r = stu.post("/student/applications", json={"internship_id": i1})
check("student applies -> 201", r.status_code, 201)
app_id = r.json()["id"]
wf = sup.get("/ops/applications/workflow").json()
check("workflow exposes 13 statuses", len(wf["statuses"]), 13)
check("  terminal states listed", set(wf["terminal"]),
      {"certificate_issued","rejected","withdrawn"})
check("  holds listed", set(wf["holding"]), {"on_hold","not_responded"})
check("apps list paginated", sup.get("/ops/applications").json()["total"], 1)
check("filter by internship", sup.get(f"/ops/applications?internship_id={i1}").json()["total"], 1)
check("filter by status", sup.get("/ops/applications?status=applied").json()["total"], 1)

print("\n  stage-by-stage progression:")
for nxt in ["shortlisted","interview_scheduled","selected","awaiting_registration_fee",
            "registration_fee_paid","internship_started","completed","certificate_issued"]:
    code = sup.patch(f"/ops/applications/{app_id}", json={"status":nxt}).status_code
    check(f"    -> {nxt}", code, 200)

print("\n  illegal transitions rejected:")
check("certificate_issued is terminal -> 400",
      sup.patch(f"/ops/applications/{app_id}", json={"status":"applied"}).status_code, 400)
check("cannot reject a finished app -> 400",
      sup.patch(f"/ops/applications/{app_id}", json={"status":"rejected"}).status_code, 400)
check("cannot hold a finished app -> 400",
      sup.patch(f"/ops/applications/{app_id}", json={"status":"on_hold"}).status_code, 400)

s2 = db.SessionLocal()
prog = s2.query(om.InternshipProgress).filter(om.InternshipProgress.application_id==app_id).first()
check("joining auto-created progress row", prog is not None, True)
check("  joining date set", prog.joining_date is not None, True)
s2.close()

print("\n  skipping stages blocked:")
stu2 = TestClient(main.app)
stu2.post("/auth/register", json={"full_name":"S2","email":"s2@oosqa.co","password":"TestPass123"})
a2 = stu2.post("/student/applications", json={"internship_id": i1}).json()["id"]
check("applied -> selected (skips stages) -> 400",
      sup.patch(f"/ops/applications/{a2}", json={"status":"selected"}).status_code, 400)
check("applied -> rejected allowed (universal exit)",
      sup.patch(f"/ops/applications/{a2}", json={"status":"rejected"}).status_code, 200)

print("\n  selections not capped by openings:")
i4 = sup.post("/ops/internships", json={"company_id":c1,"title":"One Seat",
                                        "openings":1,"status":"active"}).json()["id"]
s3, s4 = TestClient(main.app), TestClient(main.app)
s3.post("/auth/register", json={"full_name":"A","email":"a@oosqa.co","password":"TestPass123"})
s4.post("/auth/register", json={"full_name":"B","email":"b@oosqa.co","password":"TestPass123"})
ap3 = s3.post("/student/applications", json={"internship_id":i4}).json()["id"]
ap4 = s4.post("/student/applications", json={"internship_id":i4}).json()["id"]
for a in (ap3, ap4):
    sup.patch(f"/ops/applications/{a}", json={"status":"shortlisted"})
check("first selection OK", sup.patch(f"/ops/applications/{ap3}", json={"status":"selected"}).status_code, 200)
check("second beyond openings still OK",
      sup.patch(f"/ops/applications/{ap4}", json={"status":"selected"}).status_code, 200)

print("\n  bulk update:")
r = sup.post("/ops/applications/bulk-status?status=rejected", json=[ap4, 99999])
check("bulk -> 200", r.status_code, 200)
check("  1 updated", len(r.json()["updated"]), 1)
check("  1 skipped with reason", r.json()["skipped"][0]["reason"], "not found")

print("\nCOMPANY HR SCOPING")
s5 = db.SessionLocal()
hr_id = mk_hr = None
u = am.User(email="hr@ops.co", password_hash=sec.hash_password("TestPass123"),
            role=om.ROLE_COMPANY_HR, status=am.STATUS_ACTIVE,
            email_verified=True, company_id=c1)
s5.add(u); s5.commit(); s5.close()
hr = login("hr@ops.co")
check("hr sees only own company", hr.get("/ops/companies").json()["total"], 1)
check("  and it is theirs", hr.get("/ops/companies").json()["items"][0]["id"], c1)
check("hr blocked from rival detail -> 403", hr.get(f"/ops/companies/{c2}").status_code, 403)
check("hr sees only own internships",
      all(i["company"]["id"]==c1 for i in hr.get("/ops/internships").json()["items"]), True)
check("hr cannot post for rival -> 403",
      hr.post("/ops/internships", json={"company_id":c2,"title":"Sneaky"}).status_code, 403)

print("\nDASHBOARD CACHE")
r1 = sup.get("/ops/dashboard").json()
check("first call not cached", r1["cached"], False)
check("second call cached", sup.get("/ops/dashboard").json()["cached"], True)
check("refresh=true bypasses", sup.get("/ops/dashboard?refresh=true").json()["cached"], False)
check("totals still correct", sup.get("/ops/dashboard?refresh=true").json()["totals"]["companies"], 3)

print("\nAUDIT TRAIL")
logs = sup.get("/ops/audit-logs").json()
acts = {i["action"] for i in logs["items"]}
check("creations logged", "created" in acts, True)
check("status changes logged", "status_changed" in acts, True)
check("clone logged", "cloned" in acts, True)
check("bulk logged", "bulk_status_changed" in acts, True)

print("\n" + "=" * 100)
print(f"RESULT: {passed} passed, {failed} failed")
print("=" * 100)
sys.exit(1 if failed else 0)
