import json

# change these to your exact clean filenames
FILES = [
    "spring26_clean.json",
    "fall25_clean.json",
    "summer25_clean.json"
]

OUT = "uic_courses_full_clean.json"

def as_list(obj):
    # supports either: [ ... ] or { "data": [ ... ] }
    if isinstance(obj, list):
        return obj
    if isinstance(obj, dict) and isinstance(obj.get("data"), list):
        return obj["data"]
    raise ValueError("Unexpected JSON format. Expected a list or an object with a 'data' list.")

def main():
    merged = []
    seen = set()

    for path in FILES:
        with open(path, "r", encoding="utf-8") as f:
            obj = json.load(f)
        items = as_list(obj)

        for r in items:
            # best unique key: term + CRN if present
            term = str(r.get("term", "")).strip()
            crn = str(r.get("courseReferenceNumber", "")).strip()

            key = None
            if term and crn:
                key = f"{term}-{crn}"
            else:
                # fallback if CRN missing: try id else whole record
                key = str(r.get("id")) if r.get("id") is not None else json.dumps(r, sort_keys=True)

            if key in seen:
                continue
            seen.add(key)
            merged.append(r)

    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(merged, f, ensure_ascii=False)

    print(f"Done. Merged records: {len(merged)} -> {OUT}")

if __name__ == "__main__":
    main()
