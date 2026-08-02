import { DiscordSDK } from '@discord/embedded-app-sdk';

const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID as string | undefined;

export interface ActivityAuth {
  token: string;
  user: {
    id: string;
    username: string;
    globalName: string | null;
    avatar: string | null;
    guildId: string;
    channelId: string;
  };
}

export function isDiscordActivityBuild(): boolean {
  return Boolean(clientId);
}

export async function authenticateActivity(): Promise<ActivityAuth | undefined> {
  if (!clientId) return undefined;

  const discordSdk = new DiscordSDK(clientId);
  await Promise.race([
    discordSdk.ready(),
    new Promise<never>((_resolve, reject) =>
      window.setTimeout(() => reject(new Error('Discord Activity handshake timed out')), 10_000)
    )
  ]);

  const guildId = discordSdk.guildId;
  const channelId = discordSdk.channelId;
  if (!guildId || !channelId) {
    throw new Error('Launch Jinshi Territory inside a Discord server channel');
  }

  const { code } = await discordSdk.commands.authorize({
    client_id: clientId,
    response_type: 'code',
    state: '',
    prompt: 'none',
    scope: ['identify', 'guilds']
  });
  const response = await fetch('/colyseus/discord_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, guild_id: guildId, channel_id: channelId })
  });
  const body = (await response.json()) as {
    access_token?: string;
    token?: string;
    user?: ActivityAuth['user'];
    error?: string;
  };
  if (!response.ok || !body.access_token || !body.token || !body.user) {
    throw new Error(body.error ?? 'Discord authentication failed');
  }

  const authenticated = await discordSdk.commands.authenticate({
    access_token: body.access_token
  });
  if (!authenticated) throw new Error('Discord did not authenticate this Activity session');
  return { token: body.token, user: body.user };
}
