import json
import html
import unicodedata
import re

def normalize(name):
    if not name:
        return ""

    name = html.unescape(name)
    name = unicodedata.normalize("NFKD", name)
    name = name.replace("’", "'").replace("‘", "'")
    name = re.sub(r"\s+", " ", name)

    return name.strip().lower()


# Load active professors
with open("public/data/professor_to_courses.json") as f:
    course_map = json.load(f)

active_set = set(normalize(name) for name in course_map.keys())

# Load RMP file (LIST format)
with open("public/data/uic_rmp_professors_fixed.json") as f:
    rmp_data = json.load(f)

filtered = [
    prof for prof in rmp_data
    if normalize(prof["Name"]) in active_set
]

print("Before:", len(rmp_data))
print("After:", len(filtered))

with open("public/data/uic_rmp_professors_fixed.json", "w") as f:
    json.dump(filtered, f, indent=2)
