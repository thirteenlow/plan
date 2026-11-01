/**
 * Regenerates every app icon from one drawing of the Plan logo (a P monogram with a coin dot on the brand
 * gradient), so the iOS/Android/web icons, favicon and splash always match.
 *   npm i --no-save @resvg/resvg-js && node scripts/generate-icons.mjs
 * The same shapes are drawn in the app by src/components/BrandMark.tsx.
 */
import fs from 'node:fs';
import path from 'node:path';

const { Resvg } = await import('@resvg/resvg-js').catch(() => {
  console.error('Install the renderer first: npm i --no-save @resvg/resvg-js');
  process.exit(1);
});

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
// Brand gradient (src/theme GRADIENT), top-left to bottom-right.
const STOPS = ['#3DB6F5', '#B65CF4', '#FF9A6A'];
// The P monogram on a 100 grid, optically centred: a rounded stem, a ring for the bowl, and a coin dot.
const STEM = { x: 27, y: 24.6, w: 12.5, h: 54 };
const BOWL = { cx: 50, cy: 42.6, r: 15, stroke: 12.5 };
const DOT = { cx: 67.5, cy: 73.1, r: 5.5 };
const ROUND = 22.66; // corner radius for rounded tiles (≈ the iOS squircle)

const gradient = `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">${STOPS.map((c, i) => `<stop offset="${i / (STOPS.length - 1)}" stop-color="${c}"/>`).join('')}</linearGradient>`;

function glyph({ scale = 1, dotOpacity = 0.88 } = {}) {
  const t = scale === 1 ? '' : ` transform="translate(50 50) scale(${scale}) translate(-50 -50)"`;
  return (
    `<g${t}>` +
    `<rect x="${STEM.x}" y="${STEM.y}" width="${STEM.w}" height="${STEM.h}" rx="${STEM.w / 2}" fill="#FFFFFF"/>` +
    `<circle cx="${BOWL.cx}" cy="${BOWL.cy}" r="${BOWL.r}" fill="none" stroke="#FFFFFF" stroke-width="${BOWL.stroke}"/>` +
    `<circle cx="${DOT.cx}" cy="${DOT.cy}" r="${DOT.r}" fill="#FFFFFF" fill-opacity="${dotOpacity}"/>` +
    `</g>`
  );
}

/** `rx`: 0 = full-bleed square (platform masks it); `bg`: false = glyph only on transparent. */
function svg({ rx = ROUND, bg = true, glyphOn = true, scale = 1, dotOpacity } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs>${gradient}</defs>${bg ? `<rect width="100" height="100" rx="${rx}" fill="url(#g)"/>` : ''}${glyphOn ? glyph({ scale, dotOpacity }) : ''}</svg>`;
}

function png(file, size, opts) {
  const out = new Resvg(svg(opts), { fitTo: { mode: 'width', value: size } }).render().asPng();
  fs.writeFileSync(path.join(root, file), out);
  console.log('wrote', file, `${size}px`);
}

// Masters (vector).
fs.writeFileSync(path.join(root, 'assets/brand/plan-logo.svg'), svg());
fs.writeFileSync(path.join(root, 'assets/brand/plan-glyph.svg'), svg({ bg: false }));
fs.writeFileSync(path.join(root, 'public/favicon.svg'), svg());
console.log('wrote assets/brand/plan-logo.svg, assets/brand/plan-glyph.svg, public/favicon.svg');

// Native app (Expo): iOS masks the full-bleed square itself; Android uses the adaptive layers.
png('assets/icon.png', 1024, { rx: 0 });
png('assets/splash-icon.png', 1024, {});
png('assets/favicon.png', 48, {});
png('assets/android-icon-background.png', 1024, { rx: 0, glyphOn: false });
png('assets/android-icon-foreground.png', 1024, { bg: false });
png('assets/android-icon-monochrome.png', 1024, { bg: false, dotOpacity: 1 });

// Web / PWA: rounded with transparent corners for "any"; full-bleed for Apple and maskable (OS crops them).
png('public/apple-touch-icon.png', 180, { rx: 0 });
png('public/logo192.png', 192, {});
png('public/logo512.png', 512, {});
png('public/maskable512.png', 512, { rx: 0, scale: 0.86 });
