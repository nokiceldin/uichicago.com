import json

INFILE = "raw/uic_last_year_raw.json"
OUTFILE = "raw/active_professors_last_year.json"

sections = json.load(open(INFILE, "r", encoding="utf8"))

active = set()
kept_sections = 0

for section in sections:
    sched = (section.get("scheduleTypeDescription") or "").strip().lower()

    # your strict rule
    if sched != "lecture":
        continue

    kept_sections += 1

    for fac in (section.get("faculty") or []):
        name = fac.get("displayName")
        if name:
            active.add(name.strip())

print("Lecture sections kept:", kept_sections)
print("Active professors found:", len(active))

json.dump(sorted(active), open(OUTFILE, "w", encoding="utf8"), indent=2)
print("Saved to:", OUTFILE)
