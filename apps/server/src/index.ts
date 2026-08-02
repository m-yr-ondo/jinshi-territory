import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import cors from 'cors';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { DiscordAuthError, exchangeDiscordCode } from './auth/DiscordIdentity.js';
import { arenaMetrics } from './lifecycle/ArenaMetrics.js';
import { TerritoryRoom } from './rooms/TerritoryRoom.js';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(currentDirectory, '../../client/dist');
const tokenAttempts = new Map<string, number[]>();

function isTokenRateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (tokenAttempts.get(ip) ?? []).filter((time) => now - time < 60_000);
  recent.push(now);
  tokenAttempts.set(ip, recent);
  return recent.length > 10;
}

const gameServer = new Server({
  transport: new WebSocketTransport({ pingInterval: 10_000, pingMaxRetries: 3 }),
  gracefullyShutdown: false,
  greet: false,
  express: (app) => {
    app.disable('x-powered-by');
    if (config.nodeEnv === 'production') app.set('trust proxy', 'loopback');
    app.use(cors({ origin: config.nodeEnv === 'production' ? false : config.clientOrigin }));
    app.use(express.json({ limit: '8kb' }));
    app.use((_request, response, next) => {
      response.setHeader('Cache-Control', 'no-store');
      next();
    });
    app.get('/health', (_request, response) => {
      response.json({
        ok: true,
        service: 'jinshi-territory',
        time: new Date().toISOString(),
        arena: arenaMetrics
      });
    });
    app.post('/discord_token', async (request, response) => {
      if (isTokenRateLimited(request.ip ?? 'unknown')) {
        response.status(429).json({ error: 'Too many authentication attempts' });
        return;
      }
      try {
        const result = await exchangeDiscordCode(
          request.body.code,
          request.body.guild_id,
          request.body.channel_id
        );
        response.json({
          access_token: result.accessToken,
          token: result.token,
          user: result.user
        });
      } catch (error) {
        const status = error instanceof DiscordAuthError ? error.status : 500;
        const message =
          error instanceof DiscordAuthError
            ? error.message
            : 'Authentication could not be completed';
        if (status >= 500) console.error('[auth] token exchange failed:', error);
        response.status(status).json({ error: message });
      }
    });
    if (config.nodeEnv === 'production') {
      app.use(express.static(clientDist));
      app.get('/{*path}', (_request, response) =>
        response.sendFile(path.join(clientDist, 'index.html'))
      );
    }
  }
});

gameServer.define('territory', TerritoryRoom);
gameServer.onShutdown(() => console.log('Jinshi Territory server stopped cleanly.'));

await gameServer.listen(config.port, config.host);
console.log(`Jinshi Territory server listening on http://${config.host}:${config.port}`);

const shutdown = async (signal: string) => {
  console.log(`Received ${signal}; shutting down.`);
  await gameServer.gracefullyShutdown(false);
  process.exit(0);
};

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
