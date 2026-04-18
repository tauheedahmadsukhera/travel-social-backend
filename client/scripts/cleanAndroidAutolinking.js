/**
 * Removes RN Gradle autolinking cache under android/build.
 * Stale autolinking.json (e.g. wrong OS paths or from an old CLI) causes
 * "No matching variant ... No variants exist" for every :react-native-* project on EAS.
 */
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'android', 'build', 'generated', 'autolinking');
try {
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('[cleanAndroidAutolinking] removed', dir);
} catch (e) {
  console.warn('[cleanAndroidAutolinking]', e.message || e);
}
