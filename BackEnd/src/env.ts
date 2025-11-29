// DEBUT BLOC (remplace tout ce qui est entre ce commentaire et "FIN BLOC")
import 'dotenv/config';

const required = (name: string, fallback?: string) => {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing env var ${name}`);
  return v;
};

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  PORT: Number(process.env.PORT ?? 5175),
  FRONTEND_ORIGIN: required('FRONTEND_ORIGIN', 'http://localhost:5173'),
  JWT_SECRET: required('JWT_SECRET', 'replace_me_with_a_long_random_secret'),
  COOKIE_NAME: process.env.COOKIE_NAME ?? 'epion_session',
  BCRYPT_ROUNDS: Number(process.env.BCRYPT_ROUNDS ?? 12),
};
// FIN BLOC
