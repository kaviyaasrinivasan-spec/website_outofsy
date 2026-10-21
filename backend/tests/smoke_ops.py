"""RBAC + audit smoke test against local SQLite (production DB untouched)."""
import sys, pathlib, importlib

BACKEND = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

db = importlib.import_module("app.database")
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

p = pathlib.Path(__file__).parent / "smoke_ops.db"
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
co = am.Company(name="Acme", is_verified=True); s.add(co); s.flush()
co2 = am.Company(name="Rival Corp", is_verified=True); s.add(co2); s.flush()
col = am.College(name="Anna Univ"); s.add(col); s.flush()

def mk(email, role, **kw):
    u = am.User(email=email, password_hash=sec.hash_password("TestPass123"),
                role=role, status=am.STATUS_ACTIVE, email_verified=True, **kw)
    s.add(u); s.flush(); return u.id

# Capture as plain ints -- these objects detach once the session closes.
CO_ID, CO2_ID, COL_ID = co.id, co2.id, col.id

ids = {
    "super":  mk("super@ops.co",  om.ROLE_SUPER_ADMIN),
    "mgr":    mk("mgr@ops.co",    om.ROLE_OPS_MANAGER),
    "exec":   mk("exec@ops.co",   om.ROLE_OPS_EXECUTIVE),
    "hr":     mk("hr@ops.co",     om.ROLE_COMPANY_HR, company_id=co.id),
    "coord":  mk("coord@ops.co",  om.ROLE_COLLEGE_COORDINATOR, college_id=col.id),
    "mentor": mk("mentor@ops.co", om.ROLE_MENTOR),
    "stu":    mk("stu@ops.co",    am.ROLE_STUDENT),
}
s.commit(); s.close()

def login(email):
    c = TestClient(main.app)
    r = c.post("/auth/login", json={"email": email, "password": "TestPass123"})
    assert r.status_code == 200, f"{email} login failed: {r.text[:200]}"
    return c

print("=" * 104)
print("STAFF GATE (students must not reach the operations portal)")
anon = TestClient(main.app)
check("anonymous /ops/dashboard -> 401", anon.get("/ops/dashboard").status_code, 401)
stu = login("stu@ops.co")
check("student /ops/dashboard -> 403", stu.get("/ops/dashboard").status_code, 403)
check("student /ops/audit-logs -> 403", stu.get("/ops/audit-logs").status_code, 403)
check("student /ops/permissions -> 403", stu.get("/ops/permissions").status_code, 403)

print("\nDASHBOARD")
sup = login("super@ops.co")
r = sup.get("/ops/dashboard")
check("super_admin dashboard -> 200", r.status_code, 200)
d = r.json()
check("  totals present", set(["students","companies","colleges","applications"]) <= set(d["totals"]), True)
check("  pending_approvals present", "certificates" in d["pending_approvals"], True)
check("  trend is a list", isinstance(d["registration_trend"], list), True)
mgr = login("mgr@ops.co")
check("ops_manager dashboard -> 200", mgr.get("/ops/dashboard").status_code, 200)
mentor = login("mentor@ops.co")
check("mentor dashboard -> 200 (staff)", mentor.get("/ops/dashboard").status_code, 200)

print("\nPERMISSION MATRIX ENFORCEMENT")
ex = login("exec@ops.co")
hr = login("hr@ops.co")
coord = login("coord@ops.co")
# users:view -> manager yes, executive no
check("manager can view permissions", mgr.get("/ops/permissions").status_code, 200)
check("executive CANNOT view permissions -> 403", ex.get("/ops/permissions").status_code, 403)
check("hr CANNOT view permissions -> 403", hr.get("/ops/permissions").status_code, 403)
# master_data:view -> executive yes, hr no
check("executive can view master data", ex.get("/ops/master/skill").status_code, 200)
check("hr CANNOT view master data -> 403", hr.get("/ops/master/skill").status_code, 403)
# master_data:add -> manager yes, executive no
check("manager can add master data",
      mgr.post("/ops/master", json={"category":"skill","name":"Python"}).status_code, 201)
check("executive CANNOT add master data -> 403",
      ex.post("/ops/master", json={"category":"skill","name":"Rust"}).status_code, 403)
# audit_logs:view -> manager yes, executive no
check("manager can view audit logs", mgr.get("/ops/audit-logs").status_code, 200)
check("executive CANNOT view audit logs -> 403", ex.get("/ops/audit-logs").status_code, 403)

print("\nSUPER ADMIN BYPASSES THE TABLE")
check("super has zero rows in role_permissions",
      db.SessionLocal().query(om.RolePermission).filter(om.RolePermission.role==om.ROLE_SUPER_ADMIN).count(), 0)
check("  yet can view permissions", sup.get("/ops/permissions").status_code, 200)
check("  and audit logs", sup.get("/ops/audit-logs").status_code, 200)
check("  and add master data",
      sup.post("/ops/master", json={"category":"department","name":"CSE"}).status_code, 201)

print("\nSELF-LOCKOUT GUARD")
check("cannot edit super_admin permissions -> 400",
      sup.patch("/ops/permissions", json={"role":"super_admin","resource":"users","action":"edit","allowed":False}).status_code, 400)
check("cannot edit legacy admin permissions -> 400",
      sup.patch("/ops/permissions", json={"role":"admin","resource":"users","action":"edit","allowed":False}).status_code, 400)
check("unknown role rejected -> 400",
      sup.patch("/ops/permissions", json={"role":"wizard","resource":"users","action":"edit","allowed":True}).status_code, 400)
check("unknown resource rejected -> 400",
      sup.patch("/ops/permissions", json={"role":"mentor","resource":"nukes","action":"view","allowed":True}).status_code, 400)
check("unknown action rejected -> 400",
      sup.patch("/ops/permissions", json={"role":"mentor","resource":"students","action":"yeet","allowed":True}).status_code, 400)

print("\nLIVE PERMISSION EDIT TAKES EFFECT")
check("executive blocked before", ex.get("/ops/audit-logs").status_code, 403)
check("grant audit_logs:view to executive",
      sup.patch("/ops/permissions", json={"role":"ops_executive","resource":"audit_logs","action":"view","allowed":True}).status_code, 200)
check("  executive now allowed", ex.get("/ops/audit-logs").status_code, 200)
check("revoke it again",
      sup.patch("/ops/permissions", json={"role":"ops_executive","resource":"audit_logs","action":"view","allowed":False}).status_code, 200)
check("  executive blocked again", ex.get("/ops/audit-logs").status_code, 403)

print("\nSCOPING (row-level, not just permissions)")
from app.permissions import scope_company_id, scope_college_id
s2 = db.SessionLocal()
hr_u = s2.query(am.User).filter(am.User.email=="hr@ops.co").first()
coord_u = s2.query(am.User).filter(am.User.email=="coord@ops.co").first()
mgr_u = s2.query(am.User).filter(am.User.email=="mgr@ops.co").first()
check("company_hr scoped to own company", scope_company_id(hr_u), CO_ID)
check("  and NOT the rival company", scope_company_id(hr_u) == CO2_ID, False)
check("coordinator scoped to own college", scope_college_id(coord_u), COL_ID)
check("manager unscoped (sees everything)", scope_company_id(mgr_u), None)
s2.close()

print("\nMASTER DATA")
check("duplicate rejected -> 409",
      sup.post("/ops/master", json={"category":"skill","name":"Python"}).status_code, 409)
check("bad category rejected -> 400",
      sup.post("/ops/master", json={"category":"pokemon","name":"Pikachu"}).status_code, 400)
check("unknown category on GET -> 400", sup.get("/ops/master/pokemon").status_code, 400)
items = sup.get("/ops/master/skill").json()
check("skill list populated", len(items), 1)
mid = items[0]["id"]
check("delete deactivates, not destroys", sup.delete(f"/ops/master/{mid}").status_code, 200)
check("  gone from active list", len(sup.get("/ops/master/skill").json()), 0)
check("  still present when including inactive",
      len(sup.get("/ops/master/skill?include_inactive=true").json()), 1)

print("\nAUDIT TRAIL")
logs = sup.get("/ops/audit-logs").json()
check("audit rows written", logs["total"] > 0, True)
actions = {i["action"] for i in logs["items"]}
check("  master creation logged", "created" in actions, True)
check("  permission change logged", "permission_updated" in actions, True)
check("  deactivation logged", "deactivated" in actions, True)
first = logs["items"][0]
check("  actor email captured", bool(first["actor_email"]), True)
check("  actor role captured", bool(first["actor_role"]), True)
check("filter by entity_type works",
      all(i["entity_type"] == "master_item"
          for i in sup.get("/ops/audit-logs?entity_type=master_item").json()["items"]), True)

print("\nMY PERMISSIONS (drives menu visibility)")
r = mgr.get("/ops/me/permissions").json()
check("manager super_admin flag false", r["super_admin"], False)
check("  has students resource", "students" in r["permissions"], True)
r = sup.get("/ops/me/permissions").json()
check("super_admin flag true", r["super_admin"], True)
check("  granted every resource", len(r["permissions"]), len(om.RESOURCES))
r = hr.get("/ops/me/permissions").json()
check("hr scope exposed to UI", r["scope"]["company_id"], CO_ID)

print("\n" + "=" * 104)
print(f"RESULT: {passed} passed, {failed} failed")
print("=" * 104)
sys.exit(1 if failed else 0)
