import { JWT } from '@colyseus/auth';
import { describe, expect, it } from 'vitest';
import { discordJoinOptions, verifyDiscordActivity } from '../src/auth/DiscordIdentity.js';
import { validateLocalIdentity } from '../src/auth/LocalIdentity.js';

describe('local identity', () => {
  it('accepts identity fields and discards client-provided colors', () => {
    expect(
      validateLocalIdentity({
        playerId: 'player_valid',
        displayName: 'Player',
        skinId: 'hot-pink'
      })
    ).toEqual({ playerId: 'player_valid', displayName: 'Player' });
  });
});

describe('Discord Activity identity', () => {
  it('uses the verified Discord identity and discards client-provided colors', () => {
    const auth = {
      id: '123456789012345678',
      username: 'discord-user',
      globalName: 'Verified Player',
      avatar: null,
      guildId: '223456789012345678',
      channelId: '323456789012345678'
    };
    expect(
      discordJoinOptions(
        {
          playerId: 'spoofed_player',
          displayName: 'Spoofed Name',
          skinId: 'hot-pink'
        },
        auth
      )
    ).toEqual({
      playerId: auth.id,
      displayName: auth.globalName,
      guildId: auth.guildId,
      channelId: auth.channelId
    });
  });

  it('accepts a signed token only for its original guild and channel', async () => {
    process.env.JWT_SECRET = 'test-jwt-secret-with-at-least-32-characters';
    const auth = {
      id: '123456789012345678',
      username: 'discord-user',
      globalName: null,
      avatar: null,
      guildId: '223456789012345678',
      channelId: '323456789012345678'
    };
    const token = await JWT.sign(auth);
    await expect(
      verifyDiscordActivity(token, { guildId: auth.guildId, channelId: auth.channelId })
    ).resolves.toMatchObject(auth);
    await expect(
      verifyDiscordActivity(token, {
        guildId: auth.guildId,
        channelId: '423456789012345678'
      })
    ).rejects.toThrow('Discord Activity identity could not be verified');
  });
});
