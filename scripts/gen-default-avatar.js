const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const outDir = path.join(__dirname, '..', 'assets');
const outFile = path.join(outDir, 'avatardefault.webp');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">
  <rect width="100%" height="100%" fill="#E8EEF2"/>
  <circle cx="128" cy="100" r="48" fill="#9AA8B2"/>
  <ellipse cx="128" cy="210" rx="78" ry="56" fill="#9AA8B2"/>
</svg>`;

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  await sharp(Buffer.from(svg)).webp({ quality: 85 }).toFile(outFile);
  // Also copy for client bundling fallback reference (optional PNG)
  const pngOut = path.join(outDir, 'avatardefault.png');
  await sharp(Buffer.from(svg)).png().toFile(pngOut);
  console.log('wrote', outFile, fs.statSync(outFile).size);
  console.log('wrote', pngOut, fs.statSync(pngOut).size);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
