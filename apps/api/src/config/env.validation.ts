/**
 * Fails fast at boot when a required secret is missing, instead of returning
 * unverifiable tokens at runtime.
 */
export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const required = ['DATABASE_URL', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'];
  const missing = required.filter((key) => !config[key] || String(config[key]).trim() === '');

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. ` +
        'Copy .env.example to .env and fill them in.',
    );
  }

  for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
    if (String(config[key]).length < 32) {
      throw new Error(`${key} must be at least 32 characters long`);
    }
  }
  if (config.JWT_ACCESS_SECRET === config.JWT_REFRESH_SECRET) {
    throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different');
  }

  return config;
}
