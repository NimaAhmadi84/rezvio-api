/**
 * One-off brand asset generator (2026-09-19).
 * Crops the rounded card out of the generated logo artwork and emits:
 *   - rezvio-web/src/app/icon.png            (256x256 favicon)
 *   - rezvio-web/src/app/apple-icon.png      (180x180 iOS touch icon)
 *   - rezvio-web/public/logo/brand-mark.png  (512x512 for BrandMark component)
 * Run from rezvio-api:  node scripts/make-logo-assets.js
 * Uses sharp (already installed in rezvio-api).
 */
const sharp = require('sharp');
const path = require('path');

const SRC = path.resolve(__dirname, '../../rezvio-web/brand/original.png');
const OUT_ICON = path.resolve(__dirname, '../../rezvio-web/src/app/icon.png');
const OUT_APPLE = path.resolve(__dirname, '../../rezvio-web/src/app/apple-icon.png');
const OUT_MARK = path.resolve(__dirname, '../../rezvio-web/public/logo/brand-mark.png');

// Card region as fractions of the source artwork (measured 2026-09-19).
// If a pastel fringe appears on the edges, increase INSET (0.03, 0.035...).
const CARD = { left: 0.25, top: 0.05, width: 0.5, height: 0.9 };
const INSET = 0.02;

(async () => {
  const meta = await sharp(SRC).metadata();
  const W = meta.width;
  const H = meta.height;
  let left = Math.round(W * (CARD.left + INSET));
  let top = Math.round(H * (CARD.top + INSET));
  const cardW = Math.round(W * (CARD.width - INSET * 2));
  const cardH = Math.round(H * (CARD.height - INSET * 2));
  const side = Math.min(cardW, cardH);
  left += Math.round((cardW - side) / 2);
  top += Math.round((cardH - side) / 2);

  const square = await sharp(SRC)
    .extract({ left, top, width: side, height: side })
    .toBuffer();

  await sharp(square).resize(512, 512).png().toFile(OUT_MARK);
  await sharp(square).resize(256, 256).png().toFile(OUT_ICON);
  await sharp(square).resize(180, 180).png().toFile(OUT_APPLE);

  console.log('✅ Logo assets generated');
  console.log('   source: ' + W + 'x' + H + ' | crop: ' + side + 'x' + side + ' @ ' + left + ',' + top);
  console.log('   - ' + OUT_MARK);
  console.log('   - ' + OUT_ICON);
  console.log('   - ' + OUT_APPLE);
})().catch((err) => {
  console.error('❌ Failed: ' + err.message);
  process.exit(1);
});
