// Generates the iOS splash screen PNG for iPhone 13 Pro.
// Run with: node scripts/generate-splash.mjs
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// iPhone 13 Pro: 390×844pt at @3x = 1170×2532px physical
const W = 1170;
const H = 2532;

// iPhone 13 Pro safe-area-inset-top = 47pt = 141px physical
// Today header: 15px font + 10px padding×2 = ~41px CSS = 123px physical
const SAFE_TOP = 141;
const HEADER_H = 123;
const RED_H = SAFE_TOP + HEADER_H;

// hsl(0, 75%, 50%) — matches colorForPosition(0, total)
const RED = '#bf2020';
// More precise: hsl(0 75% 50%) = rgb(223, 32, 32)
const RED_PRECISE = 'rgb(223,32,32)';

const FONT_SIZE = 45; // 15px CSS × 3
const LETTER_SPACING = Math.round(0.08 * FONT_SIZE); // 0.08em
// Text baseline: vertically centred within header band
const TEXT_Y = SAFE_TOP + HEADER_H / 2;

const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${H}" fill="#0c0c0c"/>
  <rect width="${W}" height="${RED_H}" fill="${RED_PRECISE}"/>
  <text
    x="${W / 2}"
    y="${TEXT_Y}"
    dominant-baseline="middle"
    text-anchor="middle"
    font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
    font-size="${FONT_SIZE}"
    font-weight="700"
    letter-spacing="${LETTER_SPACING}"
    fill="white">TODAY</text>
</svg>`;

const out = join(__dirname, '..', 'public', 'splash-iphone13pro.png');

await sharp(Buffer.from(svg))
  .png()
  .toFile(out);

console.log(`Written ${out} (${W}×${H})`);
