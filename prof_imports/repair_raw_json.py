import sys, json

infile = sys.argv[1]
outfile = sys.argv[2]

text = open(infile, "r", encoding="utf8").read().strip()

# Try normal JSON first
try:
    data = json.loads(text)
    if isinstance(data, list):
        json.dump(data, open(outfile, "w", encoding="utf8"))
        print("Already valid list. Items:", len(data))
        sys.exit(0)
except Exception:
    pass

# Recover multiple JSON values from one file
decoder = json.JSONDecoder()
idx = 0
items = []

while idx < len(text):
    while idx < len(text) and text[idx].isspace():
        idx += 1
    if idx >= len(text):
        break

    obj, next_idx = decoder.raw_decode(text, idx)

    if isinstance(obj, list):
        items.extend(obj)
    else:
        items.append(obj)

    idx = next_idx

json.dump(items, open(outfile, "w", encoding="utf8"))
print("Repaired. Items:", len(items))
