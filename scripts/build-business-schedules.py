#!/usr/bin/env python3
"""Apply the exact CBA base sample schedule to all 8 business major JSON files.

Source: https://catalog.uic.edu/ucat/colleges-depts/business-administration/
Totals: 15+15+16+14+16+15+15+14 = 120h
"""

import json
import copy
import pathlib

DATA_DIR = pathlib.Path("public/data/uic-knowledge/majors")

BUSINESS_MAJORS = [
    "accounting-bs.json",
    "finance-bs.json",
    "information-and-decision-sciences-bs.json",
    "entrepreneurship-bs.json",
    "human-resource-management-bs.json",
    "management-bs.json",
    "marketing-bs.json",
    "real-estate-bs.json",
]

# Completion programs: transfer students join at junior year, so only 4 semesters
COMPLETION_PROGRAMS = [
    "bachelor-of-business-administration-completion-program-on-campus.json",
    "bachelor-of-business-administration-completion-program-online.json",
]


def c(code, title, hours=3):
    return {"code": code, "title": title, "hours": hours, "isElective": False}


def e(elective_type, hours=3, title="Elective"):
    return {"code": None, "title": title, "hours": hours,
            "isElective": True, "electiveType": elective_type}


BASE_SCHEDULE = [
    {
        "label": "Freshman Year – First Semester",
        "total_hours": 15,
        "courses": [
            c("BA 101",   "Business First-Year Seminar", 1),
            c("ECON 120", "Principles of Microeconomics", 3),
            c("ENGL 160", "Academic Writing I: Writing in Academic and Public Contexts", 3),
            c("COMM 100", "Fundamentals of Human Communication", 3),
            e("math_elective", 5, "Mathematics course"),
        ],
    },
    {
        "label": "Freshman Year – Second Semester",
        "total_hours": 15,
        "courses": [
            c("BA 100",   "Introduction to Professional Development", 1),
            c("BA 111",   "Business Decision-Making", 3),
            c("ACTG 210", "Introduction to Financial Accounting", 3),
            c("ENGL 161", "Academic Writing II: Writing for Inquiry and Research", 3),
            e("math_elective", 5, "Mathematics course"),
        ],
    },
    {
        "label": "Sophomore Year – First Semester",
        "total_hours": 16,
        "courses": [
            c("MGMT 340", "Introduction to Organizations", 3),
            c("ACTG 211", "Introduction to Managerial Accounting", 3),
            c("FIN 300",  "Introduction to Finance", 3),
            c("IDS 270",  "Business Statistics I", 4),
            c("MKTG 360", "Introduction to Marketing", 3),
        ],
    },
    {
        "label": "Sophomore Year – Second Semester",
        "total_hours": 14,
        "courses": [
            c("BA 200",  "Business Communication", 3),
            c("BA 220",  "Business Professional Development II", 1),
            c("IDS 200", "Intro to Management Information Systems", 4),
            e("elective_general", 3, "Major course"),
            e("elective_general", 3, "Major course"),
        ],
    },
    {
        "label": "Junior Year – First Semester",
        "total_hours": 16,
        "courses": [
            c("BA 320",   "Civic Engagement", 1),
            c("ECON 121", "Principles of Macroeconomics", 3),
            c("IDS 355",  "Operations Management", 3),
            c("MGMT 350", "Business and Its External Environment", 3),
            e("elective_general", 3, "Major course"),
            e("elective_general", 3, "Advanced Quantitative Skills course"),
        ],
    },
    {
        "label": "Junior Year – Second Semester",
        "total_hours": 15,
        "courses": [
            e("elective_general", 3, "Major course"),
            e("elective_general", 3, "Major course"),
            e("elective_general", 3, "Major course"),
            e("elective_general", 3, "Major course"),
            e("gen_ed_any",       3, "General Education Core course"),
        ],
    },
    {
        "label": "Senior Year – First Semester",
        "total_hours": 15,
        "courses": [
            e("elective_general", 3, "Major course"),
            e("elective_general", 3, "Major course"),
            e("elective_general", 3, "General Elective"),
            e("global_biz",       3, "Global Business Perspectives course"),
            e("gen_ed_any",       3, "General Education Core course"),
        ],
    },
    {
        "label": "Senior Year – Second Semester",
        "total_hours": 14,
        "courses": [
            e("elective_general", 4, "Competitive Strategy course"),
            e("elective_general", 3, "Major course"),
            e("elective_general", 4, "General Elective"),
            e("gen_ed_any",       3, "General Education Core course"),
        ],
    },
]


def main():
    for filename in BUSINESS_MAJORS:
        path = DATA_DIR / filename
        with open(path) as f:
            data = json.load(f)

        data["sampleSchedule"] = copy.deepcopy(BASE_SCHEDULE)

        with open(path, "w") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

        total = sum(s["total_hours"] for s in data["sampleSchedule"])
        print(f"  {filename}: {total}h")

    # Completion programs: transfer students start at junior year
    junior_senior = [s for s in BASE_SCHEDULE if "Junior" in s["label"] or "Senior" in s["label"]]
    for filename in COMPLETION_PROGRAMS:
        path = DATA_DIR / filename
        with open(path) as f:
            data = json.load(f)

        data["sampleSchedule"] = copy.deepcopy(junior_senior)

        with open(path, "w") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

        total = sum(s["total_hours"] for s in data["sampleSchedule"])
        print(f"  {filename}: {total}h (completion program – junior/senior only)")


if __name__ == "__main__":
    main()
