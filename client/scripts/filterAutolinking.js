const { spawnSync } = require('child_process');
const path = require('path');

// Resolve expo-modules-autolinking path
let autolinkingPath;
try {
  const expoPath = require.resolve('expo/package.json');
  autolinkingPath = require.resolve('expo-modules-autolinking', { paths: [path.dirname(expoPath)] });
} catch (e) {
  console.error('Error: Could not find expo-modules-autolinking');
  process.exit(1);
}

// Arguments for the autolinking command
const args = [
  '--no-warnings',
  '--eval',
  `require('${autolinkingPath.replace(/\\/g, '/')}')(process.argv.slice(1))`,
  ...process.argv.slice(2) // Skip 'node' and this script name
];

const result = spawnSync('node', args, { encoding: 'utf8' });

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

if (result.status !== 0) {
  process.stderr.write(result.stderr);
  process.exit(result.status);
}

try {
  const json = JSON.parse(result.stdout);

  // Filter out Sentry from React Native CLI autolinking
  // This prevents it from being linked as :sentry_react-native (underscore)
  // while allowing useExpoModules() to link it as :sentry-react-native (hyphen)
  if (json.dependencies && json.dependencies['@sentry/react-native']) {
    delete json.dependencies['@sentry/react-native'];
  }

  process.stdout.write(JSON.stringify(json));
} catch (e) {
  process.stderr.write('Error parsing JSON output from autolinking\n');
  process.stderr.write(result.stdout);
  process.exit(1);
}
