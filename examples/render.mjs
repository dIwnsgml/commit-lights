// Render a few lights SVGs from a made-up calendar. No network, no tokens.
//   node examples/render.mjs            -> writes examples/out/*.svg
//   node examples/render.mjs some/dir   -> writes there instead
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildLightsSvg, fromCounts } from "../src/lights-svg.mjs";

const outDir = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), "out");
mkdirSync(outDir, { recursive: true });

// A synthetic year: 53 Sunday-aligned weeks, busy weekdays, quiet weekends, a two-week holiday in August.
const start = "2025-11-23"; // a Sunday
let s = 2026;
const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32;
const counts = [];
for (let day = 0; day < 53 * 7 - 4; day++) { // the last week is partial: "today" is a Wednesday
  const weekday = day % 7, week = Math.floor(day / 7);
  const holiday = week >= 36 && week <= 37;
  const p = holiday ? 0.03 : weekday === 0 || weekday === 6 ? 0.2 : 0.7;
  counts.push(rnd() < p ? 1 + Math.floor(rnd() ** 2 * 14) : 0);
}
const cal = fromCounts(start, counts);

const variants = [
  ["night.svg", { user: "your-username" }],                                  // default: own dark panel
  ["dark.svg", { user: "your-username", theme: "dark" }],                    // transparent, for dark READMEs
  ["light.svg", { user: "your-username", theme: "light" }],                  // transparent, for light READMEs
  ["warm.svg", { user: "your-username", style: "warm" }],
  ["candy-still.svg", { user: "your-username", style: "candy", motion: false }],
];
for (const [file, opts] of variants) {
  const svg = buildLightsSvg(cal, opts);
  writeFileSync(join(outDir, file), svg);
  console.log(`${join(outDir, file)}  ${(svg.length / 1024).toFixed(1)} KB`);
}
console.log(`${cal.total} contributions in the synthetic year`);
