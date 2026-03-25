function requireVar(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function validateEnv() {
  const env = (process.env.NODE_ENV || 'development').toLowerCase();

  const requiredInAllEnvs = ['MONGO_URI', 'JWT_SECRET'];
  requiredInAllEnvs.forEach(requireVar);

  if (env === 'production') {
    ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'].forEach(requireVar);
  }
}

module.exports = { validateEnv };
