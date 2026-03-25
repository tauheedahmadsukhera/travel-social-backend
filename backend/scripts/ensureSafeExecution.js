#!/usr/bin/env node

const env = (process.env.NODE_ENV || '').toLowerCase();
const allowDangerous = String(process.env.ALLOW_DANGEROUS_SCRIPTS || '').toLowerCase() === 'true';

// Block destructive scripts in production unless explicitly overridden.
if (env === 'production' && !allowDangerous) {
  console.error('❌ Refusing to run destructive script in production.');
  console.error('Set ALLOW_DANGEROUS_SCRIPTS=true only for audited one-off operations.');
  process.exit(1);
}

module.exports = {};
