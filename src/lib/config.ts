import 'dotenv/config';

export const JWT_SECRET = process.env.JWT_SECRET || '';
export const JWT_EXPIRES_IN = '7d';
export const PORT = Number(process.env.PORT ?? 3000);

if (!JWT_SECRET) {
  console.warn(
    'WARNING: JWT_SECRET is not set. Using an insecure default. Set it in server/.env.',
  );
}
