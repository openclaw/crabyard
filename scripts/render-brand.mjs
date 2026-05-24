// Renders the committed brand PNGs from the canonical SVG mark.
// Run after changing brandMarkSvg() in docs-site-assets.mjs:
//   node scripts/render-brand.mjs
// Outputs (committed to the repo):
//   src/assets/crabbox-logo.png + docs/crabbox-logo.png   — 256px app-icon mark
//   src/assets/crabfleet-og.png + docs/crabfleet-og.png   — 1200x630 social card
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { brandMarkSvg } from "./docs-site-assets.mjs";

const run = promisify(execFile);
const url = (p) => new URL(p, import.meta.url).pathname;

const tmp = await mkdtemp(join(tmpdir(), "crabfleet-brand-"));
try {
  // App-icon mark (no glow keeps it crisp at favicon sizes).
  const markFile = join(tmp, "mark.svg");
  await writeFile(markFile, brandMarkSvg());
  const logoPng = join(tmp, "logo.png");
  await rsvg(markFile, 256, 256, logoPng);
  await copy(logoPng, [url("../src/assets/crabbox-logo.png"), url("../docs/crabbox-logo.png")]);

  // Glowing mark, rendered at 2x its placement and embedded as a data URI in
  // the OG card so the card is a single self-contained SVG to rasterize.
  const glowFile = join(tmp, "mark-glow.svg");
  await writeFile(glowFile, brandMarkSvg({ glow: true }));
  const glowPng = join(tmp, "mark-glow.png");
  await rsvg(glowFile, 168, 168, glowPng);
  const glowDataUri = `data:image/png;base64,${(await readFile(glowPng)).toString("base64")}`;

  const ogFile = join(tmp, "og.svg");
  await writeFile(ogFile, ogCardSvg(glowDataUri));
  const ogPng = join(tmp, "og.png");
  await rsvg(ogFile, 1200, 630, ogPng);
  await copy(ogPng, [url("../src/assets/crabfleet-og.png"), url("../docs/crabfleet-og.png")]);

  console.log("Rendered crabbox-logo.png (256) and crabfleet-og.png (1200x630).");
} finally {
  await rm(tmp, { recursive: true, force: true });
}

function rsvg(input, w, h, output) {
  return run("rsvg-convert", ["-w", String(w), "-h", String(h), input, "-o", output]);
}

async function copy(from, targets) {
  const bytes = await readFile(from);
  await Promise.all(targets.map((target) => writeFile(target, bytes)));
}

function ogCardSvg(markHref) {
  const W = 1200;
  const H = 630;
  const sans = "Helvetica Neue, Helvetica, Arial, sans-serif";
  const mono = "Menlo, 'SF Mono', monospace";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="og-coral" cx="22%" cy="-6%" r="60%"><stop offset="0" stop-color="#f05a70" stop-opacity="0.18"/><stop offset="1" stop-color="#f05a70" stop-opacity="0"/></radialGradient>
    <radialGradient id="og-blue" cx="92%" cy="14%" r="55%"><stop offset="0" stop-color="#3b82f6" stop-opacity="0.14"/><stop offset="1" stop-color="#3b82f6" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="#0a0c11"/>
  <rect width="${W}" height="${H}" fill="url(#og-coral)"/>
  <rect width="${W}" height="${H}" fill="url(#og-blue)"/>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" fill="none" stroke="#1b1f29" stroke-width="1"/>
  <g transform="translate(80,74)">
    <image href="${markHref}" x="0" y="0" width="84" height="84"/>
    <text x="104" y="58" font-family="${sans}" font-size="46" font-weight="700" fill="#f4f4f6" letter-spacing="-0.5">Crabfleet</text>
  </g>
  <text x="80" y="330" font-family="${sans}" font-size="84" font-weight="700" fill="#f7f7f9" letter-spacing="-2">Mission control</text>
  <text x="80" y="426" font-family="${sans}" font-size="84" font-weight="700" fill="#f7f7f9" letter-spacing="-2">for <tspan fill="#f05a70">Agent runs</tspan>.</text>
  <g transform="translate(80,520)">
    <rect x="0" y="0" width="360" height="56" rx="12" fill="#11141b" stroke="#222633" stroke-width="1.5"/>
    <text x="22" y="37" font-family="${mono}" font-size="26" fill="#7e8ba3">$</text>
    <text x="46" y="37" font-family="${mono}" font-size="26" fill="#cdd2dc">ssh link@crabd.sh</text>
  </g>
  <text x="${W - 80}" y="568" text-anchor="end" font-family="${sans}" font-size="26" fill="#5f6675">docs.crabfleet.ai</text>
</svg>`;
}
