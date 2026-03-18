import fs from "fs";

const inPath = "./public/data/uic_rmp_professors.json";
const outPath = "./public/data/uic_rmp_professors_fixed.json";

const raw = fs.readFileSync(inPath, "utf8");

// If the file contains NaN, it is not valid JSON.
// We replace : NaN with : null safely.
const cleaned = raw.replace(/:\s*NaN/g, ": null");

fs.writeFileSync(outPath, cleaned, "utf8");

console.log("Done. Wrote:", outPath);
