import 'dotenv/config';

const isProduction = process.env.NODE_ENV === 'production';

function requireSecret(name: string, minLength = 24): string {
  const value = process.env[name]?.trim();
  if (!value || value.length < minLength) {
    throw new Error(
      `${name} must be set and at least ${minLength} characters long. ` +
        `Set it in server/.env (or in Render -> Environment) before starting.`,
    );
  }
  return value;
}

export const JWT_SECRET = requireSecret('JWT_SECRET');
export const JWT_EXPIRES_IN = '7d';
export const PORT = Number(process.env.PORT ?? 3000);

/**
 * Comma-separated allowlist of browser origins allowed to call the API.
 * Native mobile clients send no Origin header and are unaffected by this.
 * When unset (local development), all origins are allowed with a warning.
 */
export const CORS_ORIGINS: string[] | '*' =
  process.env.CORS_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean) ||
  '*';

if (CORS_ORIGINS === '*') {
  console.warn(
    'WARNING: CORS_ORIGINS is not set. Allowing all origins. ' +
      'Set CORS_ORIGINS to a comma-separated list in production.',
  );
}

export { isProduction };