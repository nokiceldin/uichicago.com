export function normalizeProfName(raw: string) {
  if (!raw) return "";

  let s = raw.trim();

  // If it is "Last, First ..." then flip it to "First ... Last"
  if (s.includes(",")) {
    const parts = s.split(",").map((x) => x.trim()).filter(Boolean);
    const last = parts[0] ?? "";
    const first = parts.slice(1).join(" ").trim();
    s = `${first} ${last}`.trim();
  }

  s = s
    .toLowerCase()
    .replace(/['".]/g, "")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return s;
}
