# OOS Build Progress

Last updated after building operations-portal sections 13, 15, 16, 17, 19, 20.

## How to check progress yourself

**1. Browse every endpoint that exists** — start the backend and open the
interactive docs. Every route is listed, documented, and callable from the
page:

```bash
cd backend
../venv_win/Scripts/python.exe -m uvicorn app.main:app --port 8001   # Windows
../venv/bin/uvicorn app.main:app --port 8001                         # server
```

Then open **http://localhost:8001/docs**

Sign in first via `POST /auth/login` (the docs page keeps the session cookie),
then any `/ops/*` endpoint is callable directly from the browser.

**2. Run the test suites** — this is the honest measure of what actually works:

```bash
cd backend
../venv_win/Scripts/python.exe tests/run_all.py
```

Tests use a throwaway SQLite file. **They never touch the production database.**

**3. Count what is wired up:**

```bash
cd backend
../venv_win/Scripts/python.exe -c "import app.main as m; print(len(m.app.routes), 'routes')"
```

---

## Student platform — complete

| Area | Status |
|---|---|
| Public site (home, internships, detail, about, contact) | Done |
| Student registration + login | Done |
| Google SSO | Done (needs prod URLs on deploy) |
| Student dashboard (6 sections) | Done |
| Apply / save / withdraw / notifications / membership | Done |

## Operations portal — 19 of 20 sections

| # | Section | Status | Notes |
|---|---|---|---|
| 1 | Dashboard | Done | Cached 60s |
| 2 | Company management | Done | |
| 3 | College management | Done | |
| 4 | Internship management | Done | Clone, pause, close |
| 5 | Student management | Done | |
| 6 | Registration management | Done | Filters + pagination |
| 7 | Application workflow | Done | 12 stages, transitions enforced |
| 8 | Progress tracking | Done | Attendance, weekly reports, mentors |
| 9 | Certificates | Done | Real PDF + QR verification |
| 10 | College coordinators | Done | Incl. bulk CSV student import |
| 11 | Company HR portal | Done | Provisioning + activity logs |
| 12 | User management | Done | 7 roles, editable permission matrix |
| 13 | Document management | Done | No Aadhaar number stored |
| 14 | **Communication centre** | **Blocked** | Needs SMTP creds + Meta approval |
| 15 | Reports | Done | 10 reports, CSV + XLSX export |
| 16 | Analytics | Done | 10 series; gender not collected |
| 17 | Approval centre | Done | |
| 18 | Master data | Done | |
| 19 | Audit logs | Done | Append-only |
| 20 | System settings | Done | Secrets masked on read |

## Not started

- **Operations portal UI** — roughly 40 screens. The API is complete but
  currently only reachable through `/docs`. This is the largest remaining
  piece of work.

## Known gaps and decisions

- **Aadhaar is deliberately not stored.** College ID is used for identity
  verification instead. Files can be uploaded; the *number* is never held.
- **Cryptographic PDF signing is not implemented.** Certificates carry a QR
  verification link, which covers the practical need. PKCS#7 signing requires
  an X.509 certificate from a CA — a purchase, not a code change.
- **Gender distribution analytics cannot be built** — gender is not collected
  anywhere in the platform.
- **No email is sent anywhere.** SMTP is unconfigured, so all notifications
  are in-app only.
- **Postgres hits `max_connections` intermittently.** Roughly 74 idle
  connections are leaked by other applications on the shared server. Fix the
  leak and add PgBouncer before real traffic.

## Before deploying

```
reportlab
qrcode
openpyxl
```

These three are installed locally but **missing from `requirements.txt`** —
add them or the server build will fail at import.
