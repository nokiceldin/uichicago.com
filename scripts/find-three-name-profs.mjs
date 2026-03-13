import fs from "fs";

const raw = fs.readFileSync("./public/data/professor_to_courses.json", "utf8");
const data = JSON.parse(raw);

const keys = Object.keys(data);

const threeNameProfessors = keys.filter((name) => {
  const parts = name.split(",").map((x) => x.trim());

  if (parts.length !== 2) return false;

  const lastName = parts[0];
  const firstMiddle = parts[1].split(/\s+/).filter(Boolean);

  return lastName && firstMiddle.length === 2;
});

fs.writeFileSync(
  "./three-name-professors.txt",
  threeNameProfessors.join("\n"),
  "utf8"
);

console.log("Saved", threeNameProfessors.length, "names to three-name-professors.txt");