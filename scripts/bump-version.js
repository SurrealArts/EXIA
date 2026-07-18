import { readFileSync, writeFileSync } from "node:fs";

const newVersion = process.argv[2];
if (!newVersion) {
  console.error("Usage: node scripts/bump-version.js <new-version>");
  process.exit(1);
}

const packageJson = JSON.parse(readFileSync("package.json", "utf-8"));
const oldVersion = packageJson.version;

if (oldVersion === newVersion) {
  console.log(`Version is already ${newVersion}`);
  process.exit(0);
}

packageJson.version = newVersion;
writeFileSync("package.json", JSON.stringify(packageJson, null, 2) + "\n", "utf-8");
console.log("Updated package.json");

const files = ["README.md", "README.ja.md", "DOCUMENTATION.md", "DOCUMENTATION.ja.md"];

const escaped = oldVersion.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const re = new RegExp(`(?<=^|[^\\d])${escaped}(?=[^\\d]|$)`, "gm");

for (const file of files) {
  try {
    const content = readFileSync(file, "utf-8");
    const updated = content.replace(re, newVersion);
    if (updated !== content) {
      writeFileSync(file, updated, "utf-8");
      console.log(`Updated ${file}`);
    }
  } catch (err) {
    console.error(`Failed to update ${file}: ${err.message}`);
  }
}

console.log(`Version bumped from ${oldVersion} to ${newVersion}`);
