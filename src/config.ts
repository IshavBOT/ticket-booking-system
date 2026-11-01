import dotenv from 'dotenv';
dotenv.config({ quiet: true });

const e = process.env;
if (!e.DATABASE_URL || !e.REDIS_URL) {
  throw new Error('DATABASE_URL and REDIS_URL are required. Copy .env.example to .env and fill them in.');
}

export const config = {
  port: Number(e.PORT ?? 3000),
  databaseUrl: e.DATABASE_URL,
  redisUrl: e.REDIS_URL,
  jwtSecret: e.JWT_SECRET ?? 'dev-secret-change-me',
  adminEmail: (e.ADMIN_EMAIL ?? 'admin@example.com').toLowerCase(),
  holdTtl: Number(e.HOLD_TTL_SECONDS ?? 600),
  rateLimitPerMin: Number(e.RATE_LIMIT_PER_MIN ?? 300),
  bcryptRounds: Number(e.BCRYPT_ROUNDS ?? 10),
  smtpUrl: e.SMTP_URL, // unset => emails are rendered as JSON and logged, not sent
};
