// Manual-release version bump.
// Rule: increment the middle (minor) digit, zero the last (patch) digit.
//   0.1.0 → 0.2.0 → ... → 0.10.0 → 1.0.0 (minor > 10 rolls over to major)
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const versionPath = resolve(import.meta.dirname, "..", "VERSION.txt");
const raw = readFileSync(versionPath, "utf-8").trim();
const m = raw.match(/^(\d+)\.(\d+)\.(\d+)$/);
if (!m) {
  console.error(`[bump-version] VERSION.txt must be X.Y.Z, got: "${raw}"`);
  process.exit(1);
}

let [major, minor, patch] = [Number(m[1]), Number(m[2]), Number(m[3])];
minor += 1;
patch = 0;
if (minor >= 10) {
  minor = 0;
  patch = 0;
  major += 1;
}

const next = `${major}.${minor}.${patch}`;
writeFileSync(versionPath, next + "\n", "utf-8");
console.log(`[bump-version] ${raw} → ${next}`);
