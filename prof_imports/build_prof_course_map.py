import json
import csv
from collections import defaultdict

INPUT_FILE = "merged/uic_courses_full_clean.json"
OUT_JSON = "professor_to_courses.json"
OUT_CSV = "professor_to_courses.csv"


def normalize_prof_name(name: str) -> str:
    # Banner usually already gives "Last, First"
    return " ".join(name.strip().split())


def extract_professors(rec: dict) -> list[str]:
    """
    Tries multiple possible Banner keys, because different endpoints/terms can vary.
    Returns a list of professor display names like "Reeder, Jennifer".
    """
    profs = []

    # Most common in Banner searchResults payload
    if isinstance(rec.get("faculty"), list):
        for f in rec["faculty"]:
            if isinstance(f, dict):
                name = f.get("displayName") or f.get("name")
                if isinstance(name, str) and name.strip():
                    profs.append(normalize_prof_name(name))

    # Fallbacks (sometimes used in other Banner payloads)
    for key in ["instructors", "instructionalStaff", "primaryInstructor", "facultyDisplayName"]:
        val = rec.get(key)
        if isinstance(val, list):
            for item in val:
                if isinstance(item, dict):
                    name = item.get("displayName") or item.get("name")
                    if isinstance(name, str) and name.strip():
                        profs.append(normalize_prof_name(name))
                elif isinstance(item, str) and item.strip():
                    profs.append(normalize_prof_name(item))
        elif isinstance(val, dict):
            name = val.get("displayName") or val.get("name")
            if isinstance(name, str) and name.strip():
                profs.append(normalize_prof_name(name))
        elif isinstance(val, str) and val.strip():
            profs.append(normalize_prof_name(val))

    # Dedup while preserving order
    seen = set()
    out = []
    for p in profs:
        if p not in seen:
            seen.add(p)
            out.append(p)
    return out


def is_grad_course(rec: dict) -> bool:
    """
    Heuristic: only adds (GRAD) if record clearly indicates graduate.
    Banner fields vary, so we check several likely keys.
    """
    grad_signals = []

    for k in ["levelDescription", "level", "courseLevel", "courseLevelDescription", "academicLevel"]:
        v = rec.get(k)
        if isinstance(v, str):
            grad_signals.append(v.lower())

    # Sometimes level code like "GR", "G", "500"
    for k in ["levelCode", "academicLevelCode"]:
        v = rec.get(k)
        if isinstance(v, str):
            grad_signals.append(v.lower())

    text = " ".join(grad_signals)
    if "graduate" in text or "grad" in text or text.strip() in {"gr", "g"}:
        return True

    # Simple numeric hint: 400/500+ sometimes indicates upper/grad, but not always
    # So we only mark grad if explicit signals exist above.
    return False


def course_label(rec: dict) -> str:
    subject = (rec.get("subject") or "").strip()
    number = (rec.get("courseNumber") or rec.get("courseDisplay") or "").strip()
    title = (rec.get("courseTitle") or rec.get("title") or "").strip()

    base = f"{subject} {number} | {title}".strip()
    if is_grad_course(rec):
        base += "(GRAD)"
    return base


def main():
    with open(INPUT_FILE, "r", encoding="utf-8") as f:
        courses = json.load(f)

    prof_to_courses = defaultdict(set)

    for rec in courses:
        if not isinstance(rec, dict):
            continue

        label = course_label(rec)
        if not label or label.startswith("|"):
            continue

        profs = extract_professors(rec)
        if not profs:
            continue

        for p in profs:
            prof_to_courses[p].add(label)

    # Convert sets to sorted lists
    output = {p: sorted(list(cset)) for p, cset in prof_to_courses.items()}

    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    # CSV export (one row per professor-course)
    with open(OUT_CSV, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["Professor", "Course"])
        for prof in sorted(output.keys()):
            for c in output[prof]:
                w.writerow([prof, c])

    print("Done")
    print("Professors:", len(output))
    total_pairs = sum(len(v) for v in output.values())
    print("Professor-course pairs:", total_pairs)
    print("Saved:", OUT_JSON, "and", OUT_CSV)


if __name__ == "__main__":
    main()
