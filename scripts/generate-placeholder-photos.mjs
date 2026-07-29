/**
 * Generates stand-in photography for the catalog.
 *
 * These are NOT pretty placeholders. They deliberately reproduce the real
 * constraint from the brief: the image library is WhatsApp photos taken in a
 * warehouse and at real events — uneven lighting, mixed aspect ratios, busy
 * backgrounds, off-centre framing, occasional motion blur.
 *
 * The point is to test "la vitrina" (the photo treatment) against imperfect
 * source material, because clean product-on-white shots will never exist.
 *
 * Replacing these with the owners' real photos is a drop-in: same filenames,
 * same folder. Run with:  node scripts/generate-placeholder-photos.mjs
 */

import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "catalogo");

// ---- Seeded randomness so output is stable across runs ---------------------

function hash(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

function rng(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- The imperfection budget ----------------------------------------------

/** Mixed aspect ratios, exactly like a camera roll. */
const RATIOS = [
  [1200, 900], // 4:3 landscape
  [900, 1200], // 3:4 portrait
  [1080, 1080], // square
  [1280, 720], // 16:9
  [810, 1440], // 9:16 — someone's phone held vertically
  [1024, 768],
];

/** Where the photo was taken. Each has its own bad lighting. */
const SCENES = {
  warehouse: {
    wall: "#8d9086",
    floor: "#63655c",
    clutter: ["#75776d", "#9a9c90", "#565952", "#84867a"],
    light: "#ffe9c4",
    lightStrength: 0.5,
  },
  patio: {
    wall: "#b3a68e",
    floor: "#9c8f7c",
    clutter: ["#8fa38c", "#c4b79f", "#7d8f7a", "#a89a83"],
    light: "#fff4d8",
    lightStrength: 0.72, // blown-out midday sun
  },
  hall: {
    wall: "#6f7b83",
    floor: "#575f66",
    clutter: ["#7e8a91", "#5b666d", "#8b959b", "#68737a"],
    light: "#ffdfae",
    lightStrength: 0.4,
  },
  night: {
    wall: "#333a3c",
    floor: "#272c2e",
    clutter: ["#3f474a", "#4a5356", "#2e3436", "#454e51"],
    light: "#ffc978",
    lightStrength: 0.85, // one hard flash, everything else black
  },
};

/** Rough object colour, read off the item name so placeholders aren't lies. */
function objectColor(name, rand) {
  const n = name.toLowerCase();
  if (n.includes("dorad")) return "#b3934e";
  if (n.includes("transparente")) return "#d8dee0";
  if (n.includes("barro")) return "#9c6244";
  if (n.includes("roja")) return "#9e3226";
  if (n.includes("mimbre") || n.includes("canasta")) return "#b18d5c";
  if (n.includes("hierro") || n.includes("metálic")) return "#9a9a94";
  if (n.includes("acero") || n.includes("chafing") || n.includes("samovar"))
    return "#b8bcbd";
  if (n.includes("blanc")) return "#e6e4dd";
  if (n.includes("madera")) return "#8a6a4a";
  return ["#dcd8ce", "#c9c3b6", "#e2ded4"][Math.floor(rand() * 3)];
}

// ---- Object silhouettes ----------------------------------------------------
// Loose shapes only. They get blurred and buried in noise, so at grid size they
// read as "a photo of a thing" rather than as an illustration.

function chair(x, y, s, c) {
  return `
    <rect x="${x - 34 * s}" y="${y - 96 * s}" width="${68 * s}" height="${86 * s}" rx="${10 * s}" fill="${c}"/>
    <rect x="${x - 42 * s}" y="${y - 14 * s}" width="${84 * s}" height="${16 * s}" rx="${5 * s}" fill="${c}"/>
    <rect x="${x - 38 * s}" y="${y + 2 * s}" width="${9 * s}" height="${74 * s}" fill="${c}"/>
    <rect x="${x + 29 * s}" y="${y + 2 * s}" width="${9 * s}" height="${74 * s}" fill="${c}"/>
    <rect x="${x - 38 * s}" y="${y + 40 * s}" width="${76 * s}" height="${7 * s}" fill="${c}" opacity="0.75"/>`;
}

function table(x, y, s, c) {
  return `
    <ellipse cx="${x}" cy="${y - 40 * s}" rx="${104 * s}" ry="${30 * s}" fill="${c}"/>
    <rect x="${x - 104 * s}" y="${y - 42 * s}" width="${208 * s}" height="${14 * s}" fill="${c}"/>
    <rect x="${x - 9 * s}" y="${y - 30 * s}" width="${18 * s}" height="${86 * s}" fill="${c}" opacity="0.85"/>
    <ellipse cx="${x}" cy="${y + 56 * s}" rx="${46 * s}" ry="${12 * s}" fill="${c}" opacity="0.8"/>`;
}

function cloth(x, y, s, c) {
  return `
    <path d="M ${x - 118 * s} ${y - 46 * s}
             Q ${x} ${y - 78 * s} ${x + 118 * s} ${y - 46 * s}
             L ${x + 98 * s} ${y + 96 * s}
             Q ${x} ${y + 122 * s} ${x - 98 * s} ${y + 96 * s} Z"
          fill="${c}"/>
    <path d="M ${x - 40 * s} ${y - 60 * s} L ${x - 26 * s} ${y + 104 * s}"
          stroke="${c}" stroke-opacity="0.45" stroke-width="${16 * s}" fill="none"/>
    <path d="M ${x + 44 * s} ${y - 58 * s} L ${x + 32 * s} ${y + 102 * s}"
          stroke="${c}" stroke-opacity="0.35" stroke-width="${13 * s}" fill="none"/>`;
}

function glassware(x, y, s, c) {
  let out = "";
  for (let i = 0; i < 5; i++) {
    const gx = x + (i - 2) * 42 * s + (i % 2 ? 6 * s : -4 * s);
    const gy = y + (i % 3) * 7 * s;
    out += `
      <path d="M ${gx - 17 * s} ${gy - 62 * s}
               L ${gx + 17 * s} ${gy - 62 * s}
               L ${gx + 11 * s} ${gy - 18 * s}
               L ${gx - 11 * s} ${gy - 18 * s} Z" fill="${c}" opacity="0.88"/>
      <rect x="${gx - 3 * s}" y="${gy - 20 * s}" width="${6 * s}" height="${34 * s}" fill="${c}" opacity="0.8"/>
      <ellipse cx="${gx}" cy="${gy + 15 * s}" rx="${18 * s}" ry="${5 * s}" fill="${c}" opacity="0.9"/>`;
  }
  return out;
}

function arch(x, y, s, c) {
  return `
    <circle cx="${x}" cy="${y - 34 * s}" r="${96 * s}" fill="none" stroke="${c}" stroke-width="${13 * s}"/>
    <rect x="${x - 66 * s}" y="${y + 58 * s}" width="${132 * s}" height="${11 * s}" rx="${5 * s}" fill="${c}"/>`;
}

function vessel(x, y, s, c) {
  return `
    <path d="M ${x - 74 * s} ${y - 40 * s}
             Q ${x} ${y + 96 * s} ${x + 74 * s} ${y - 40 * s} Z" fill="${c}"/>
    <ellipse cx="${x}" cy="${y - 42 * s}" rx="${76 * s}" ry="${21 * s}" fill="${c}"/>
    <ellipse cx="${x}" cy="${y - 44 * s}" rx="${58 * s}" ry="${15 * s}" fill="#000" opacity="0.22"/>
    <rect x="${x - 90 * s}" y="${y + 48 * s}" width="${180 * s}" height="${13 * s}" rx="${6 * s}" fill="${c}" opacity="0.8"/>`;
}

const SHAPES = {
  sillas: chair,
  mesas: table,
  manteleria: cloth,
  cristaleria: glassware,
  decoracion: arch,
  "caballo-bayo": vessel,
};

// ---- The photo ------------------------------------------------------------

function makePhoto({ slug, name, category }) {
  const rand = rng(hash(slug));

  const [w, h] = RATIOS[Math.floor(rand() * RATIOS.length)];
  const sceneKeys = Object.keys(SCENES);
  const scene = SCENES[sceneKeys[Math.floor(rand() * sceneKeys.length)]];
  const color = objectColor(name, rand);
  const shape = SHAPES[category] ?? chair;

  // Bad framing: the subject drifts off-centre, sometimes badly.
  const cx = w * (0.32 + rand() * 0.4);
  const cy = h * (0.42 + rand() * 0.26);
  const scale = (Math.min(w, h) / 620) * (0.85 + rand() * 0.55);

  // Some of these were taken by someone in a hurry.
  const motionBlur = rand() < 0.28 ? 1.6 + rand() * 2.6 : 0;
  const horizon = h * (0.5 + rand() * 0.22);
  const lightAngle = rand() < 0.5 ? 0 : 1;

  // Busy background: other stock stacked behind the subject.
  let clutter = "";
  const clutterCount = 4 + Math.floor(rand() * 5);
  for (let i = 0; i < clutterCount; i++) {
    const c = scene.clutter[Math.floor(rand() * scene.clutter.length)];
    const bw = w * (0.08 + rand() * 0.24);
    const bh = h * (0.1 + rand() * 0.3);
    const bx = rand() * (w - bw * 0.5) - bw * 0.25;
    const by = horizon - bh * (0.55 + rand() * 0.6);
    clutter += `<rect x="${bx.toFixed(0)}" y="${by.toFixed(0)}" width="${bw.toFixed(0)}" height="${bh.toFixed(0)}" rx="${(bw * 0.04).toFixed(0)}" fill="${c}" opacity="${(0.5 + rand() * 0.4).toFixed(2)}"/>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="presentation">
  <defs>
    <filter id="soft"><feGaussianBlur stdDeviation="${(Math.min(w, h) / 340).toFixed(2)}"/></filter>
    ${motionBlur ? `<filter id="shake"><feGaussianBlur stdDeviation="${motionBlur.toFixed(2)} 0.4"/></filter>` : ""}
    <filter id="noise">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" stitchTiles="stitch"/>
      <feColorMatrix type="saturate" values="0"/>
    </filter>
    <linearGradient id="flare" x1="${lightAngle ? 1 : 0}" y1="0" x2="${lightAngle ? 0 : 1}" y2="1">
      <stop offset="0%" stop-color="${scene.light}" stop-opacity="${scene.lightStrength}"/>
      <stop offset="46%" stop-color="${scene.light}" stop-opacity="0.06"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.3"/>
    </linearGradient>
    <radialGradient id="vig" cx="50%" cy="46%" r="72%">
      <stop offset="60%" stop-color="#000000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.42"/>
    </radialGradient>
  </defs>

  <rect width="${w}" height="${h}" fill="${scene.wall}"/>
  <rect y="${horizon.toFixed(0)}" width="${w}" height="${(h - horizon).toFixed(0)}" fill="${scene.floor}"/>
  <g filter="url(#soft)">${clutter}</g>

  <g ${motionBlur ? 'filter="url(#shake)"' : ""}>
    <ellipse cx="${cx.toFixed(0)}" cy="${(cy + 88 * scale).toFixed(0)}" rx="${(150 * scale).toFixed(0)}" ry="${(26 * scale).toFixed(0)}" fill="#000" opacity="0.26"/>
    ${shape(cx, cy, scale, color)}
  </g>

  <rect width="${w}" height="${h}" fill="url(#flare)"/>
  <rect width="${w}" height="${h}" fill="url(#vig)"/>
  <rect width="${w}" height="${h}" filter="url(#noise)" opacity="0.16" style="mix-blend-mode:overlay"/>
</svg>`;
}

// ---- Run ------------------------------------------------------------------

// The catalog is TypeScript, so read the slugs straight out of the source
// rather than importing it — this script deliberately has no build step.
const { readFileSync } = await import("node:fs");
const source = readFileSync(join(ROOT, "src", "data", "catalog.ts"), "utf8");

const entries = [];
const re =
  /slug:\s*"([^"]+)",\s*\n\s*name:\s*"([^"]+)",\s*\n\s*category:\s*"([^"]+)"/g;
let m;
while ((m = re.exec(source))) {
  entries.push({ slug: m[1], name: m[2], category: m[3] });
}

if (entries.length === 0) {
  console.error("No catalog items found — check the shape of src/data/catalog.ts");
  process.exit(1);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

for (const entry of entries) {
  writeFileSync(join(OUT, `${entry.slug}.svg`), makePhoto(entry));
}

// A handful of wider "scene" shots for the hero wall and the campaign landing.
const SCENE_SHOTS = [
  { slug: "escena-salon-montado", name: "Salón montado", category: "mesas" },
  { slug: "escena-mesa-servida", name: "Mesa servida blanco", category: "cristaleria" },
  { slug: "escena-sillas-apiladas", name: "Sillas apiladas blancas", category: "sillas" },
  { slug: "escena-arco-entrada", name: "Arco metálico dorado", category: "decoracion" },
  { slug: "escena-buffet", name: "Buffet olla de barro", category: "caballo-bayo" },
  { slug: "escena-manteles", name: "Manteles blancos", category: "manteleria" },
  { slug: "escena-patio", name: "Patio con mesas blancas", category: "mesas" },
  { slug: "escena-graduacion", name: "Graduación sillas blancas", category: "sillas" },
];

for (const shot of SCENE_SHOTS) {
  writeFileSync(join(OUT, `${shot.slug}.svg`), makePhoto(shot));
}

console.log(
  `Generated ${entries.length} item photos + ${SCENE_SHOTS.length} scene shots in public/catalogo/`,
);
