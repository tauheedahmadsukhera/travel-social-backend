/**
 * Rasterize Trips SVGs for Expo (icon, favicon, marks).
 * Full-screen `assets/splash.png` is built from `splashscreenlogo.png` when present, else from SVG.
 * Run: npm run assets:trips-png
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientRoot = path.join(__dirname, '..');
const imagesDir = path.join(clientRoot, 'assets', 'images');
const assetsDir = path.join(clientRoot, 'assets');

const svgApp = path.join(imagesDir, 'logo-trips-app.svg');
const svgWordmark = path.join(imagesDir, 'logo-trips.svg');

const BRAND = { r: 102, g: 126, b: 234, alpha: 1 }; // #667eea
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

/** Keep primary artwork inside ~64% of square so iOS / adaptive-icon masks do not clip. */
const ICON_SAFE_FRACTION = 0.64;

async function main() {
  if (!fs.existsSync(svgApp)) {
    console.error('Missing:', svgApp);
    process.exit(1);
  }
  if (!fs.existsSync(svgWordmark)) {
    console.error('Missing:', svgWordmark);
    process.exit(1);
  }

  // App icon + adaptive foreground (1024): padded square on white (matches adaptiveIcon.backgroundColor)
  const iconSide = 1024;
  const iconInner = Math.round(iconSide * ICON_SAFE_FRACTION);
  const iconMark = await sharp(svgApp)
    .resize(iconInner, iconInner, { fit: 'contain', background: WHITE })
    .png()
    .toBuffer();
  await sharp({
    create: { width: iconSide, height: iconSide, channels: 4, background: WHITE },
  })
    .composite([{ input: iconMark, gravity: 'center' }])
    .png()
    .toFile(path.join(imagesDir, 'icon.png'));
  console.log('Wrote assets/images/icon.png');

  // Optional legacy full-screen splash (expo-splash uses assets/images/splashscreenlogo.png in app.json)
  const splashLogoPath = path.join(imagesDir, 'splashscreenlogo.png');
  const splashW = 1242;
  const splashH = 2688;
  const splashInner = Math.round(Math.min(splashW, splashH) * 0.34);
  const markSource = fs.existsSync(splashLogoPath) ? splashLogoPath : svgApp;
  const markPng = await sharp(markSource)
    .resize(splashInner, splashInner, { fit: 'contain', background: WHITE })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: splashW,
      height: splashH,
      channels: 4,
      background: WHITE,
    },
  })
    .composite([{ input: markPng, gravity: 'center' }])
    .png()
    .toFile(path.join(assetsDir, 'splash.png'));
  console.log(
    fs.existsSync(splashLogoPath)
      ? 'Wrote assets/splash.png (from splashscreenlogo.png)'
      : 'Wrote assets/splash.png (from logo-trips-app.svg)',
  );

  // In-app header mark (bundled PNG; avoids huge SVG at runtime)
  await sharp(svgWordmark)
    .resize(512, 512, { fit: 'contain', background: { ...BRAND, alpha: 0 } })
    .png()
    .toFile(path.join(imagesDir, 'logo-trips-mark.png'));
  console.log('Wrote assets/images/logo-trips-mark.png');

  // Web favicon (same safe inset as app icon)
  const favSide = 48;
  const favInner = Math.round(favSide * ICON_SAFE_FRACTION);
  const favMark = await sharp(svgApp)
    .resize(favInner, favInner, { fit: 'contain', background: WHITE })
    .png()
    .toBuffer();
  await sharp({
    create: { width: favSide, height: favSide, channels: 4, background: WHITE },
  })
    .composite([{ input: favMark, gravity: 'center' }])
    .png()
    .toFile(path.join(imagesDir, 'favicon.png'));
  console.log('Wrote assets/images/favicon.png');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
