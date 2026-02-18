import json

files = [
    "raw/fall25_raw.json",
    "raw/spring26_raw.json",
    "raw/summer25_raw.json",
]

all_sections = []

for file in files:
    with open(file, "r", encoding="utf8") as f:
        obj = json.load(f)

    # your files are like: [ { success, totalCount, data: [...] } ]
    if isinstance(obj, list) and obj and isinstance(obj[0], dict) and "data" in obj[0]:
        sections = obj[0].get("data") or []
        all_sections.extend(sections)
        print(file, "sections:", len(sections))
    else:
        # fallback: already a list of sections
        if isinstance(obj, list):
            all_sections.extend(obj)
            print(file, "sections:", len(obj))
        else:
            raise ValueError(f"Unexpected JSON shape in {file}: {type(obj)}")

print("Total merged sections:", len(all_sections))

with open("raw/uic_last_year_raw.json", "w", encoding="utf8") as out:
    json.dump(all_sections, out)

print("Wrote raw/uic_last_year_raw.json")
