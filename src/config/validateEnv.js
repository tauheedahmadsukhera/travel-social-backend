function requireVar(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function validateEnv() {
  const env = (process.env.NODE_ENV || 'development').toLowerCase();

  // These must be set in ALL environments
  const requiredInAllEnvs = [
    'MONGO_URI',
    'JWT_SECRET',
  ];
  requiredInAllEnvs.forEach(requireVar);

  // Enforce minimum JWT_SECRET strength in production
  if (env === 'production') {
    const jwtSecret = process.env.JWT_SECRET;
    if (jwtSecret && jwtSecret.length < 32) {
      throw new Error('JWT_SECRET must be at least 32 characters in production');
    }

    // These must be set in production
    const requiredInProduction = [
      'AWS_ACCESS_KEY_ID',
      'AWS_SECRET_ACCESS_KEY',
      'AWS_REGION',
      'AWS_S3_BUCKET_NAME',
      'ALLOWED_ORIGINS',
    ];
    requiredInProduction.forEach(requireVar);
  }
}

module.exports = { validateEnv };
