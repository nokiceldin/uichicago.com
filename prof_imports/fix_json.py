import json
import re

INPUT_FILE = "raw/summer25_raw.json"
OUTPUT_FILE = "summer25_clean.json"



def main():
    with open(INPUT_FILE, "r", encoding="utf-8") as f:
        text = f.read()

    objects = []
    decoder = json.JSONDecoder()

    i = 0
    n = len(text)

    while True:
        while i < n and text[i].isspace():
            i += 1
        if i >= n:
            break

        obj, end = decoder.raw_decode(text, i)
        i = end

        if isinstance(obj, dict) and "data" in obj and isinstance(obj["data"], list):
            objects.extend(obj["data"])

    with open(OUTPUT_FILE, "w", encoding="utf-8") as out:
        json.dump(objects, out, ensure_ascii=False)

    print("Done")
    print("Total courses saved:", len(objects))
    print("Output file:", OUTPUT_FILE)

if __name__ == "__main__":
    main()
