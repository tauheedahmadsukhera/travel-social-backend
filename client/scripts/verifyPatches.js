#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const checks = [
  {
    file: path.join('node_modules', '@react-navigation', 'native-stack', 'lib', 'module', 'views', 'NativeStackView.native.js'),
    mustInclude: "compatibilityFlags != null && typeof compatibilityFlags === 'object'",
    reason: "Native stack SceneView guard for compatibilityFlags",
  },
  {
    file: path.join('node_modules', 'expo-router', 'build', 'fork', 'getPathFromState.js'),
    mustInclude: "route.params && typeof route.params === 'object' && 'screen' in route.params",
    reason: "Expo router guard for primitive route params",
  },
  {
    file: path.join('node_modules', 'expo-router', 'build', 'fork', 'NavigationContainer.js'),
    mustInclude: "if (linking?.config && typeof linking.config === 'object')",
    reason: "Expo router linking config object guard",
  },
];

function fail(message) {
  console.error('\n[verify:patches] FAILED');
  console.error(message);
  console.error('\nRun these commands and rebuild:');
  console.error('  npm install');
  console.error('  npx patch-package');
  console.error('  npm run verify:patches');
  process.exit(1);
}

const missing = [];

for (const check of checks) {
  const abs = path.resolve(process.cwd(), check.file);

  if (!fs.existsSync(abs)) {
    missing.push(`- Missing file: ${check.file}`);
    continue;
  }

  const content = fs.readFileSync(abs, 'utf8');
  if (!content.includes(check.mustInclude)) {
    missing.push(`- Patch not applied in ${check.file} (${check.reason})`);
  }
}

if (missing.length > 0) {
  fail(missing.join('\n'));
}

console.log('[verify:patches] OK - required navigation/router patches are present.');
