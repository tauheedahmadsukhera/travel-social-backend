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

function main() {
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
