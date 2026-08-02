import { JWT } from '@colyseus/auth';
import { ServerError } from '@colyseus/core';
import { DEFAULT_PLAYER_SKIN_ID, isPlayerSkinId, type JoinOptions } from '@jinshi-territory/shared';

const DISCORD_API = 'https://discord.com/api/v10';
const SNOWFLAKE = /^\d{17,20}$/;

export interface AuthenticatedDiscordUser {
  id: string;
  username: string;
  globalName: string | null;
  avatar: string | null;
  guildId: string;
  channelId: string;
}

interface DiscordTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

interface DiscordUser {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
}

interface DiscordGuild {
  id: string;
}

export class DiscordAuthError extends Error {
  constructor(
    message: string,
    readonly status = 400
  ) {
    super(message);
  }
}

function isSnowflake(value: unknown): value is string {
  return typeof value === 'string' && SNOWFLAKE.test(value);
}

function cleanDisplayName(value: string): string {
  return value
    .replace(/[\p{Cc}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 24);
}

async function discordJson<T>(url: string, accessToken: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(5_000)
  });
  if (!response.ok) {
    throw new DiscordAuthError(`Discord API request failed (${response.status})`, 502);
  }
  return (await response.json()) as T;
}

export async function exchangeDiscordCode(
  code: unknown,
  guildId: unknown,
  channelId: unknown
): Promise<{ accessToken: string; token: string; user: AuthenticatedDiscordUser }> {
  if (typeof code !== 'string' || code.length < 6) {
    throw new DiscordAuthError('Missing or invalid authorization code');
  }
  if (!isSnowflake(guildId) || !isSnowflake(channelId)) {
    throw new DiscordAuthError('A valid Discord guild and channel are required');
  }

  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  if (!clientId || !clientSecret || !process.env.JWT_SECRET) {
    throw new DiscordAuthError('Discord authentication is not configured', 503);
  }

  const tokenResponse = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code
    }),
    signal: AbortSignal.timeout(5_000)
  });
  const tokenBody = (await tokenResponse.json()) as DiscordTokenResponse;
  if (!tokenResponse.ok || !tokenBody.access_token) {
    throw new DiscordAuthError(
      tokenBody.error_description ?? tokenBody.error ?? 'Discord rejected the authorization code',
      401
    );
  }

  const [profile, guilds] = await Promise.all([
    discordJson<DiscordUser>(`${DISCORD_API}/users/@me`, tokenBody.access_token),
    discordJson<DiscordGuild[]>(`${DISCORD_API}/users/@me/guilds`, tokenBody.access_token)
  ]);
  if (!isSnowflake(profile.id)) {
    throw new DiscordAuthError('Discord returned an invalid user profile', 502);
  }
  if (!guilds.some((guild) => guild.id === guildId)) {
    throw new DiscordAuthError('You are not a member of this Discord server', 403);
  }

  const user: AuthenticatedDiscordUser = {
    id: profile.id,
    username: cleanDisplayName(profile.username) || 'Discord Player',
    globalName: profile.global_name ? cleanDisplayName(profile.global_name) : null,
    avatar: profile.avatar ?? null,
    guildId,
    channelId
  };
  return {
    accessToken: tokenBody.access_token,
    token: await JWT.sign(user, { expiresIn: '1h' }),
    user
  };
}

export async function verifyDiscordActivity(
  token: string,
  options: Partial<JoinOptions>
): Promise<AuthenticatedDiscordUser> {
  try {
    const auth = await JWT.verify<AuthenticatedDiscordUser>(token);
    if (
      !isSnowflake(auth?.id) ||
      !isSnowflake(auth?.guildId) ||
      !isSnowflake(auth?.channelId) ||
      auth.guildId !== options.guildId ||
      auth.channelId !== options.channelId
    ) {
      throw new Error('Activity context mismatch');
    }
    return auth;
  } catch {
    throw new ServerError(401, 'Discord Activity identity could not be verified');
  }
}

export function discordJoinOptions(
  rawOptions: unknown,
  auth: AuthenticatedDiscordUser
): JoinOptions {
  const candidate =
    rawOptions && typeof rawOptions === 'object' ? (rawOptions as JoinOptions) : null;
  return {
    playerId: auth.id,
    displayName: auth.globalName || auth.username,
    skinId: isPlayerSkinId(candidate?.skinId) ? candidate.skinId : DEFAULT_PLAYER_SKIN_ID,
    guildId: auth.guildId,
    channelId: auth.channelId
  };
}
