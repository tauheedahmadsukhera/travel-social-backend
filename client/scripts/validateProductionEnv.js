const fs = require('fs');
const path = require('path');

const requiredVars = [
  'EXPO_PUBLIC_API_BASE_URL',
  'EXPO_PUBLIC_GOOGLE_MAPS_API_KEY',
  'EXPO_PUBLIC_FIREBASE_API_KEY',
  'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'EXPO_PUBLIC_FIREBASE_APP_ID',
];

const invalidPlaceholderPatterns = [
  /^SET_/i,
  /^your[-_]/i,
  /^changeme$/i,
  /^placeholder$/i,
  /^test$/i,
];

function isMissingOrPlaceholder(value) {
  if (!value || !String(value).trim()) return true;
  const normalized = String(value).trim();
  return invalidPlaceholderPatterns.some((pattern) => pattern.test(normalized));
}

function loadDotEnvFile() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex <= 0) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function main() {
  loadDotEnvFile();
  const missing = [];

  for (const key of requiredVars) {
    const value = process.env[key];
    if (isMissingOrPlaceholder(value)) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    console.error('Production environment validation failed.');
    console.error('Missing or placeholder values for:');
    for (const key of missing) {
      console.error(`- ${key}`);
    }
    process.exit(1);
  }

  console.log('Production environment validation passed.');
}

main();
