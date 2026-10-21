# app/seed_internships.py
"""Seed the first two internship programs.

    python -m app.seed_internships           # report only
    python -m app.seed_internships --apply

Idempotent: a company or internship that already exists is left alone, so this
is safe to re-run.

NOTE: stipend and work mode are deliberately left unset -- those are commercial
and logistical commitments that should come from the company, not be invented
here. Set them in the admin portal before publicising these listings.
"""
import sys
from datetime import datetime, timedelta, timezone

from . import auth_models as am
from .database import SessionLocal

APPLY_WINDOW_DAYS = 30

COMPANIES = [
    {
        "name": "Axiora Labs AI",
        "industry": "Artificial Intelligence",
        "is_verified": True,
    },
    {
        "name": "The Brand Authority",
        "industry": "Digital Marketing",
        "is_verified": True,
    },
]

INTERNSHIPS = [
    {
        "company": "Axiora Labs AI",
        "title": "AI Engineer Intern",
        "duration": "1 Month",
        "description": (
            "A one-month AI engineering internship for students who want hands-on "
            "experience building and shipping machine learning features. You'll work "
            "alongside the engineering team on live problems rather than tutorial "
            "exercises."
        ),
        "responsibilities": (
            "- Build and evaluate machine learning models on real datasets\n"
            "- Clean, explore and prepare data for training\n"
            "- Integrate models into working applications via APIs\n"
            "- Document experiments and present findings to the team\n"
            "- Take part in code reviews and weekly progress check-ins"
        ),
        "required_skills": "Python, Machine Learning, Data Analysis, APIs",
        "openings": 2,
    },
    {
        "company": "The Brand Authority",
        "title": "Digital Marketing Intern",
        "duration": "1 Month",
        "description": (
            "A one-month digital marketing internship covering the full campaign "
            "lifecycle — from content planning through to performance reporting. "
            "Suited to students who want practical marketing experience before "
            "graduating."
        ),
        "responsibilities": (
            "- Plan and schedule content across social media channels\n"
            "- Support live campaign setup and day-to-day optimisation\n"
            "- Track engagement and campaign performance metrics\n"
            "- Assist with SEO research and on-page improvements\n"
            "- Prepare performance reports and share insights with the team"
        ),
        "required_skills": "Social Media, Content Writing, SEO, Analytics",
        "openings": 2,
    },
]


def main() -> int:
    apply = "--apply" in sys.argv
    db = SessionLocal()
    planned, skipped = [], []

    try:
        deadline = datetime.now(timezone.utc) + timedelta(days=APPLY_WINDOW_DAYS)

        # --- companies ---
        company_ids = {}
        for spec in COMPANIES:
            existing = db.query(am.Company).filter(am.Company.name == spec["name"]).first()
            if existing:
                company_ids[spec["name"]] = existing.id
                skipped.append(f"company '{spec['name']}' (already exists)")
                continue
            if apply:
                row = am.Company(**spec)
                db.add(row)
                db.flush()
                company_ids[spec["name"]] = row.id
            planned.append(f"company '{spec['name']}'")

        # --- internships ---
        for spec in INTERNSHIPS:
            company_id = company_ids.get(spec["company"])
            existing = (
                db.query(am.Internship)
                .filter(am.Internship.title == spec["title"])
                .filter(am.Internship.company_id == company_id)
                .first()
                if company_id else None
            )
            if existing:
                skipped.append(f"internship '{spec['title']}' (already exists)")
                continue

            planned.append(f"internship '{spec['title']}' @ {spec['company']}")
            if apply:
                payload = {k: v for k, v in spec.items() if k != "company"}
                db.add(am.Internship(
                    company_id=company_id,
                    status=am.INTERNSHIP_ACTIVE,   # live on the public site
                    is_featured=True,
                    last_date_to_apply=deadline,
                    **payload,
                ))

        if apply:
            db.commit()

        for s in skipped:
            print(f"  skip   {s}")
        for p in planned:
            print(f"  {'create' if apply else 'would '} {p}")

        if not apply:
            print("\nDry run. Re-run with --apply to insert.")
        else:
            print(f"\nDone. Applications close {deadline.date()}.")
            print("Still unset (set these in the admin portal): stipend, work_mode, "
                  "location, company logo/about.")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
