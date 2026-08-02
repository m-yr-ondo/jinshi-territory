import 'dotenv/config';

function integer(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

export const config = {
  host: process.env.HOST ?? '127.0.0.1',
  port: integer('PORT', 2570, 1, 65535),
  maxHumans: integer('MAX_HUMANS', 32, 1, 256),
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5175',
  nodeEnv: process.env.NODE_ENV ?? 'development',
  seed: process.env.GAME_SEED ? Number(process.env.GAME_SEED) : undefined
};

if (config.seed !== undefined && !Number.isFinite(config.seed)) {
  throw new Error('GAME_SEED must be a finite number');
}

if (config.nodeEnv === 'production') {
  for (const name of ['DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET', 'JWT_SECRET']) {
    if (!process.env[name]) throw new Error(`${name} is required in production`);
  }
}
